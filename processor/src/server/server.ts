import autoLoad from "@fastify/autoload";
import cors from "@fastify/cors";
import fastifyFormBody from "@fastify/formbody";
import rawBody from "fastify-raw-body";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config/config.js";
import debugDumpPlugin from "./debug-dump.plugin.js";
import { requestContextPlugin } from "../libs/fastify/context/context.js";
import { errorHandler } from "../libs/fastify/error-handler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CORS_ALLOWED_METHODS = ["GET", "HEAD", "POST", "DELETE", "OPTIONS"];
const CORS_ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Correlation-ID",
  "X-Request-ID",
  "X-Session-ID",
];
const CORS_ALLOWED_METHODS_HEADER = CORS_ALLOWED_METHODS.join(", ");
const CORS_ALLOWED_HEADERS_HEADER = CORS_ALLOWED_HEADERS.join(", ");

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return undefined;
  }
}

function deriveMerchantCenterOrigin(jwtIssuer: string): string | undefined {
  try {
    const url = new URL(jwtIssuer);
    if (url.hostname.startsWith("mc-api.")) {
      url.hostname = `mc.${url.hostname.slice("mc-api.".length)}`;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

function isCommercetoolsAppOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname.endsWith(".commercetools.app");
  } catch {
    return false;
  }
}

function buildAllowedCorsOrigins(): ReadonlySet<string> {
  const origins = new Set<string>();
  const checkoutOrigin = normalizeOrigin(config.checkoutUrl);
  const merchantCenterOrigin = deriveMerchantCenterOrigin(config.jwtIssuer);

  if (checkoutOrigin) origins.add(checkoutOrigin);
  if (merchantCenterOrigin) origins.add(merchantCenterOrigin);

  for (const origin of config.corsAllowedOrigins) {
    if (origin === "*") continue;
    const normalizedOrigin = normalizeOrigin(origin);
    if (normalizedOrigin) origins.add(normalizedOrigin);
  }

  return origins;
}

function isAllowedCorsOrigin(origin: string | undefined, allowedOrigins: ReadonlySet<string>): boolean {
  if (origin === undefined) return true;

  const normalizedOrigin = normalizeOrigin(origin);
  return normalizedOrigin === origin && (allowedOrigins.has(normalizedOrigin) || isCommercetoolsAppOrigin(normalizedOrigin));
}

function addSecurityHeaders(reply: FastifyReply): void {
  reply.header("x-content-type-options", "nosniff");
  reply.header("referrer-policy", "no-referrer");
  reply.header("x-frame-options", "DENY");
  reply.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
}

function writePreflightResponse(reply: FastifyReply, statusCode: 204 | 403, origin?: string): void {
  const headers: Record<string, string> = {
    "content-length": "0",
    "vary": "Origin, Access-Control-Request-Headers",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  };

  if (statusCode === 204 && origin !== undefined) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = CORS_ALLOWED_METHODS_HEADER;
    headers["access-control-allow-headers"] = CORS_ALLOWED_HEADERS_HEADER;
  }

  reply.hijack();
  reply.raw.writeHead(statusCode, headers);
  reply.raw.end();
}

function registerCorsPreflightHandler(server: FastifyInstance, allowedOrigins: ReadonlySet<string>): void {
  server.addHook("onRequest", (request: FastifyRequest, reply: FastifyReply, done) => {
    addSecurityHeaders(reply);

    if (request.raw.method !== "OPTIONS") {
      done();
      return;
    }

    const origin = getHeaderValue(request.headers.origin);
    const requestedMethod = getHeaderValue(request.headers["access-control-request-method"]);

    if (origin === undefined || requestedMethod === undefined) {
      done();
      return;
    }

    if (!isAllowedCorsOrigin(origin, allowedOrigins)) {
      writePreflightResponse(reply, 403);
      return;
    }

    writePreflightResponse(reply, 204, origin);
  });
}


/**
 * Setup Fastify server instance
 * @returns
 */
export const setupFastify = async () => {
  // Create fastify server instance
  const server = Fastify({
    logger: {
      level: config.loggerLevel,
    },
    genReqId: () => randomUUID().toString(),
    requestIdLogLabel: "requestId",
    requestIdHeader: "x-request-id",
    bodyLimit: 100 * 1024,
  });

  const allowedCorsOrigins = buildAllowedCorsOrigins();
  registerCorsPreflightHandler(server, allowedCorsOrigins);

  // Config raw body for webhooks routes
  await server.register(rawBody, {
    field: "rawBody",
    global: false,
    encoding: false,
    runFirst: true,
    routes: ["/webhooks/nuvei"],
  });

  // Setup error handler
  server.setErrorHandler(errorHandler);

  await server.register(cors, {
    methods: CORS_ALLOWED_METHODS,
    allowedHeaders: CORS_ALLOWED_HEADERS,
    origin: (origin, callback) => {
      callback(null, isAllowedCorsOrigin(origin, allowedCorsOrigins));
    },
  });

  // Add content type parser for the content type application/x-www-form-urlencoded
  await server.register(fastifyFormBody);

  // Register context plugin
  await server.register(requestContextPlugin);

  await server.register(autoLoad, {
    dir: join(__dirname, "plugins"),
  });

  // Register debug dump plugin manually (kept outside autoload dir to avoid double-registration)
  await server.register(debugDumpPlugin);

  return server;
};
