import autoLoad from "@fastify/autoload";
import fastifyFormBody from "@fastify/formbody";
import rawBody from "fastify-raw-body";
import Fastify, { type FastifyInstance } from "fastify";
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

  const applyCorsHeaders = (
    request: { headers: Record<string, string | string[] | undefined> },
    reply: { header: (key: string, value: string | string[]) => unknown },
  ) => {
    const origin = request.headers.origin ?? "*";
    const requestedHeaders = request.headers["access-control-request-headers"] ?? "*";

    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    reply.header("Access-Control-Allow-Headers", requestedHeaders);
    reply.header("Access-Control-Allow-Credentials", "true");
    reply.header("Vary", "Origin");
  };

  // Handle OPTIONS requests for all routes with permissive CORS headers
  server.options("*", async (request, reply) => {
    applyCorsHeaders(request, reply);
    return reply.code(204).send();
  });

  // Add CORS headers to all responses via onSend hook
  server.addHook("onSend", async (request, reply, payload) => {
    applyCorsHeaders(request, reply);
    return payload;
  });

  // Log every incoming request with body and headers for evidence capture
  server.addHook("onRequest", async (request) => {
    server.log.info(
      {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body,
        query: request.query,
        params: request.params,
        remoteAddress: request.ip,
      },
      "Incoming request",
    );
  });

  // Log every response for evidence capture
  server.addHook("onResponse", async (request, reply) => {
    server.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      "Request completed",
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
