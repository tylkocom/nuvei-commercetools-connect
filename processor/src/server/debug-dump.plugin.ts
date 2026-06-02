import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";

/**
 * In-memory ring buffer for request/response debugging.
 * Captures the last N HTTP exchanges so you can inspect them
 * without digging through terminal logs.
 */
const MAX_ENTRIES = 200;

export type DebugEntry = {
  id: string;
  at: string;
  method: string;
  url: string;
  headers: Record<string, string | string[]>;
  query: unknown;
  params: unknown;
  body: unknown;
  rawBody?: string;
  statusCode?: number;
  responseBody?: unknown;
  error?: string;
  durationMs: number;
};

const buffer: DebugEntry[] = [];

function pushEntry(entry: DebugEntry) {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

export function getDebugDump(): DebugEntry[] {
  return [...buffer];
}

export function clearDebugDump(): void {
  buffer.length = 0;
}

const debugDumpPlugin = fp(async (fastify: FastifyInstance) => {
  // Capture on every request
  fastify.addHook("onRequest", async (request: FastifyRequest) => {
    (request as unknown as Record<string, unknown>)["__debugCaptureStart"] =
      performance.now();
  });

  fastify.addHook("onSend", async (
    request: FastifyRequest,
    reply: FastifyReply,
    payload: string,
  ) => {
    const start = (request as unknown as Record<string, unknown>)[
      "__debugCaptureStart"
    ] as number | undefined;
    const durationMs = start ? Math.round(performance.now() - start) : 0;

    let body: unknown = undefined;
    let rawBody: string | undefined = undefined;

    try {
      // fastify-raw-body may have set rawBody on some routes
      rawBody = (request as unknown as { rawBody?: string }).rawBody;
    } catch {
      // ignore
    }

    try {
      if (typeof request.body === "string") {
        body = request.body;
      } else if (request.body !== undefined) {
        body = request.body;
      }
    } catch {
      // ignore
    }

    let responseBody: unknown = undefined;
    try {
      if (typeof payload === "string" && payload.length > 0) {
        responseBody =
          payload.startsWith("{") || payload.startsWith("[")
            ? JSON.parse(payload)
            : payload;
      }
    } catch {
      responseBody = payload;
    }

    const entry: DebugEntry = {
      id: request.id,
      at: new Date().toISOString(),
      method: request.method,
      url: request.url,
      headers: request.headers as Record<string, string | string[]>,
      query: request.query,
      params: request.params,
      body,
      rawBody,
      statusCode: reply.statusCode,
      responseBody,
      durationMs,
    };

    pushEntry(entry);
  });

  fastify.addHook("onError", async (
    request: FastifyRequest,
    reply: FastifyReply,
    error: Error,
  ) => {
    const start = (request as unknown as Record<string, unknown>)[
      "__debugCaptureStart"
    ] as number | undefined;
    const durationMs = start ? Math.round(performance.now() - start) : 0;

    const entry: DebugEntry = {
      id: request.id,
      at: new Date().toISOString(),
      method: request.method,
      url: request.url,
      headers: request.headers as Record<string, string | string[]>,
      query: request.query,
      params: request.params,
      body: request.body,
      statusCode: reply.statusCode,
      error: error.message,
      durationMs,
    };

    pushEntry(entry);
  });

  // Expose debug endpoints (no auth for local dev; production can gate behind origin/IP)
  fastify.get("/debug/dump", async (_request, reply) => {
    const accept = (_request.headers["accept"] as string) || "";
    const entries = getDebugDump();

    if (accept.includes("text/html")) {
      const rows = entries
        .map(
          (e) => `
        <tr>
          <td style="padding:0.4rem;border:1px solid #334155;white-space:nowrap;">${new Date(e.at).toLocaleTimeString()}</td>
          <td style="padding:0.4rem;border:1px solid #334155;font-weight:bold;color:${e.statusCode && e.statusCode < 400 ? "#4ade80" : e.statusCode && e.statusCode >= 400 ? "#f87171" : "#94a3b8"};">${e.method}</td>
          <td style="padding:0.4rem;border:1px solid #334155;">${e.url}</td>
          <td style="padding:0.4rem;border:1px solid #334155;text-align:center;">${e.statusCode ?? "—"}</td>
          <td style="padding:0.4rem;border:1px solid #334155;text-align:right;">${e.durationMs}ms</td>
        </tr>
        <tr>
          <td colspan="5" style="padding:0.4rem;border:1px solid #334155;background:#0b1220;">
            <details>
              <summary style="cursor:pointer;color:#38bdf8;">Details (id: ${e.id})</summary>
              <pre style="margin:0.5rem 0;overflow-x:auto;font-size:0.8rem;">${JSON.stringify(e, null, 2)}</pre>
            </details>
          </td>
        </tr>
      `,
        )
        .join("");

      const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Debug Dump — Nuvei Processor</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#0f172a; color:#e2e8f0; padding:1rem; }
  h1 { font-size:1.4rem; margin-bottom:0.5rem; }
  p { color:#94a3b8; margin-bottom:1rem; }
  table { width:100%; border-collapse:collapse; font-size:0.85rem; }
  th { text-align:left; padding:0.5rem; background:#1e293b; border:1px solid #334155; }
  pre { color:#e2e8f0; }
  a { color:#38bdf8; }
</style>
</head>
<body>
<h1>Debug Dump</h1>
<p>Last ${entries.length} captured requests. <a href="/debug/dump">Refresh</a> | <a href="/debug/clear">Clear</a> | <a href="/debug/dump.json">JSON</a></p>
<table>
  <thead>
    <tr>
      <th>Time</th>
      <th>Method</th>
      <th>URL</th>
      <th>Status</th>
      <th>Duration</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>
</body>
</html>`;
      return reply.type("text/html").send(html);
    }

    return reply.send({ count: entries.length, entries });
  });

  fastify.get("/debug/dump.json", async (_request, reply) => {
    return reply.send({ count: buffer.length, entries: getDebugDump() });
  });

  fastify.get("/debug/clear", async (_request, reply) => {
    clearDebugDump();
    return reply.send({ ok: true, message: "Debug dump cleared" });
  });
});

export default debugDumpPlugin;
