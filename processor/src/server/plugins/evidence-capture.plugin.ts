import { timingSafeEqual, createHash } from "node:crypto";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { config } from "../../config/config.js";
import { log } from "../../libs/logger/index.js";

/**
 * Token-gated, whitelisted evidence capture for phase-2 E2E evidence runs.
 *
 * Disabled by default: without EVIDENCE_CAPTURE_TOKEN (>= 16 chars) no route
 * is registered and nothing is buffered. When enabled, a bounded ring buffer
 * holds per-request summaries containing ONLY whitelisted fields — never
 * session tokens, checksums, card data, PII, headers, or raw bodies.
 *
 * This intentionally replaces the removed /debug/dump endpoint with a safe,
 * opt-in equivalent for deployed evidence collection.
 */

const MIN_TOKEN_LENGTH = 16;
const BUFFER_LIMIT = 200;

const DMN_REQUEST_FIELDS = [
  "merchant_id",
  "merchantId",
  "transactionType",
  "ppp_status",
  "Status",
  "status",
  "PPP_TransactionID",
  "PPP_TransactionId",
  "ppp_TransactionID",
  "TransactionID",
  "transactionId",
  "merchant_unique_id",
  "clientUniqueId",
  "totalAmount",
  "currency",
] as const;

const RESPONSE_FIELDS = [
  "outcome",
  "paymentReference",
  "cartId",
  "amount",
  "currency",
  "environment",
  "status",
  "message",
  "statusCode",
  "errors",
] as const;

type CaptureEntry = {
  seq: number;
  method: string;
  route: string;
  statusCode: number;
  requestId: string;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
};

function pickFields(
  source: unknown,
  fields: readonly string[],
): Record<string, unknown> | undefined {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    if (record[field] !== undefined) output[field] = record[field];
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function tokenMatches(provided: string, expected: string): boolean {
  // Hash both sides so length differences never leak through timing.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

async function evidenceCapturePlugin(server: FastifyInstance) {
  const token = config.evidenceCaptureToken;
  if (!token) return;
  if (token.length < MIN_TOKEN_LENGTH) {
    log.warn(
      "EVIDENCE_CAPTURE_TOKEN is shorter than 16 characters; evidence capture stays disabled.",
    );
    return;
  }

  log.info("Evidence capture enabled (token-gated, whitelisted fields only).");

  const buffer: CaptureEntry[] = [];
  let sequence = 0;

  server.addHook("onSend", async (request, reply, payload) => {
    const route = request.routeOptions?.url ?? request.url;
    if (route.startsWith("/evidence/")) return payload;

    let responseBody: unknown;
    if (typeof payload === "string") {
      try {
        responseBody = JSON.parse(payload);
      } catch {
        responseBody = undefined;
      }
    }

    const entry: CaptureEntry = {
      seq: (sequence += 1),
      method: request.method,
      route,
      statusCode: reply.statusCode,
      requestId: String(request.id),
    };

    if (route === "/webhooks/nuvei") {
      entry.request = pickFields(request.body, DMN_REQUEST_FIELDS);
    }
    const responseSummary = pickFields(responseBody, RESPONSE_FIELDS);
    if (responseSummary) entry.response = responseSummary;

    buffer.push(entry);
    if (buffer.length > BUFFER_LIMIT) buffer.splice(0, buffer.length - BUFFER_LIMIT);
    return payload;
  });

  const authenticate = (request: FastifyRequest, reply: FastifyReply): boolean => {
    const header = request.headers.authorization ?? "";
    const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (!provided || !tokenMatches(provided, token)) {
      void reply.code(401).send({ message: "Unauthorized" });
      return false;
    }
    return true;
  };

  server.get("/evidence/captures", async (request, reply) => {
    if (!authenticate(request, reply)) return;
    return reply.code(200).send({ count: buffer.length, entries: buffer });
  });

  server.post("/evidence/captures/clear", async (request, reply) => {
    if (!authenticate(request, reply)) return;
    buffer.length = 0;
    sequence = 0;
    return reply.code(200).send({ cleared: true });
  });
}

// fp() breaks encapsulation so the onSend hook observes every route, not just
// routes registered inside this plugin context.
export default fp(evidenceCapturePlugin);
