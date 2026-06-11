import autoLoad from "@fastify/autoload";
import cors from "@fastify/cors";
import fastifyFormBody from "@fastify/formbody";
import rawBody from "fastify-raw-body";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config/config.js";
import { requestContextPlugin } from "../libs/fastify/context/context.js";
import { errorHandler } from "../libs/fastify/error-handler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

  // Browser origins must be explicitly allowlisted: the commercetools Checkout
  // origin (from CTP_CHECKOUT_URL) is always allowed; CORS_ALLOWED_ORIGINS adds
  // storefront origins. Non-allowlisted origins still get a preflight answer
  // (204) but no Access-Control-Allow-Origin grant, so browsers block them —
  // returning `origin: false` per-request would instead 404 the OPTIONS
  // preflight, which breaks Checkout error reporting. Server-to-server requests
  // (Nuvei DMNs, Checkout Payment Intents) carry no Origin and are unaffected.
  const allowedOrigins = new Set(config.corsAllowedOrigins);
  if (config.checkoutUrl) {
    try {
      allowedOrigins.add(new URL(config.checkoutUrl).origin);
    } catch {
      // Invalid CTP_CHECKOUT_URL is rejected by validateConfig at boot.
    }
  }
  await server.register(cors, {
    origin: [...allowedOrigins],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    optionsSuccessStatus: 204,
  });

  // Defensive response headers; the processor serves only JSON APIs.
  server.addHook("onSend", async (_request, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-frame-options", "DENY");
    reply.header(
      "permissions-policy",
      "accelerometer=(), camera=(), geolocation=(), microphone=(), payment=()",
    );
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

  // Add content type parser for the content type application/x-www-form-urlencoded
  await server.register(fastifyFormBody);

  // Register context plugin
  await server.register(requestContextPlugin);

  await server.register(autoLoad, {
    dir: join(__dirname, "plugins"),
  });

  return server;
};
