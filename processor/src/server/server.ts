import autoLoad from "@fastify/autoload";
import cors from "@fastify/cors";
import fastifyFormBody from "@fastify/formbody";
import rawBody from "fastify-raw-body";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config/config.js";
import debugDumpPlugin from "./debug-dump.plugin.js";
import { requestContextPlugin } from "../libs/fastify/context/context.js";
import { errorHandler } from "../libs/fastify/error-handler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getMerchantCenterOrigin(jwtIssuer: string): string | undefined {
  try {
    const issuerUrl = new URL(jwtIssuer);
    if (!issuerUrl.hostname.startsWith("mc-api.")) {
      return undefined;
    }

    return `${issuerUrl.protocol}//${issuerUrl.hostname.replace(/^mc-api\./, "mc.")}`;
  } catch {
    return undefined;
  }
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

  server.addHook("onSend", async (_, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-frame-options", "DENY");
    reply.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
  });

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

  // Enable CORS. When corsAllowedOrigins is exactly ["*"], register with origin: "*"
  // so @fastify/cors handles OPTIONS preflights before any auth hook (template behaviour).
  // Explicit allow-lists restrict to those origins only.
  const configuredOrigins = config.corsAllowedOrigins.filter(Boolean);
  const corsIsWildcardOnly = configuredOrigins.length === 1 && configuredOrigins[0] === "*";
  if (corsIsWildcardOnly) {
    await server.register(cors, {
      methods: ["GET", "HEAD", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Correlation-ID",
        "X-Request-ID",
        "X-Session-ID",
      ],
      origin: "*",
    });
  } else {
    const merchantCenterOrigin = getMerchantCenterOrigin(config.jwtIssuer);
    const allowedOrigins = new Set(
      [config.checkoutUrl, merchantCenterOrigin, ...configuredOrigins].filter(Boolean),
    );
    await server.register(cors, {
      methods: ["GET", "HEAD", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Correlation-ID",
        "X-Request-ID",
        "X-Session-ID",
      ],
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("CORS origin is not allowed"), false);
      },
    });
  }

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
