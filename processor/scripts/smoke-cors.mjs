import { spawn } from "node:child_process";
import { createServer } from "node:net";

const HOST = "127.0.0.1";
const ORIGIN = "https://shelfmarket-dev.public.cloud.oklyt.pl";
const REQUESTED_HEADERS = "content-type,x-session-id";
const STARTUP_TIMEOUT_MS = 10_000;
const CRASH_WAIT_MS = 500;
const BAD_LOG_PATTERNS = [
  /ERR_HTTP_HEADERS_SENT/,
  /Reply was already sent/,
  /Cannot write headers after they are sent/,
];

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate local TCP port.")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 2_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForReady(baseUrl, child, getLogs) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError;

  while (Date.now() < deadline) {
    assertChildAlive(child, getLogs);
    try {
      const response = await fetchWithTimeout(`${baseUrl}/operations/config`, {
        headers: { origin: ORIGIN },
      });
      if (response.status === 200) {
        await response.arrayBuffer();
        return;
      }
      lastError = new Error(`Unexpected startup status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }

  throw new Error(`Processor did not become ready: ${lastError?.message ?? "unknown error"}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertChildAlive(child, getLogs) {
  if (child.exitCode !== null) {
    throw new Error(`Processor exited with code ${child.exitCode}. Logs:\n${getLogs()}`);
  }
}

function assertNoBadLogs(logs) {
  for (const pattern of BAD_LOG_PATTERNS) {
    if (pattern.test(logs)) {
      throw new Error(`Detected bad processor log matching ${pattern}:\n${logs}`);
    }
  }
}

async function main() {
  const port = await getFreePort();
  const baseUrl = `http://${HOST}:${port}`;
  let logs = "";

  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      LOGGER_LEVEL: "info",
      CTP_PROJECT_KEY: "local-cors-smoke",
      CTP_CLIENT_ID: "local-client-id",
      CTP_CLIENT_SECRET: "local-client-secret",
      CTP_AUTH_URL: "https://auth.europe-west1.gcp.commercetools.com",
      CTP_API_URL: "https://api.europe-west1.gcp.commercetools.com",
      CTP_SESSION_URL: "https://session.europe-west1.gcp.commercetools.com",
      CTP_CHECKOUT_URL: "https://checkout.europe-west1.gcp.commercetools.com",
      CTP_JWKS_URL: "https://mc-api.europe-west1.gcp.commercetools.com/.well-known/jwks.json",
      CTP_JWT_ISSUER: "https://mc-api.europe-west1.gcp.commercetools.com",
      NUVEI_ENV: "test",
      NUVEI_MERCHANT_ID: "local-merchant-id",
      NUVEI_MERCHANT_SITE_ID: "local-site-id",
      NUVEI_SECRET_KEY: "local-secret-key",
      NUVEI_API_BASE_URL: "https://ppp-test.nuvei.com/ppp/api/v1",
      CORS_ALLOWED_ORIGINS: ORIGIN,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const getLogs = () => logs;
  child.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });

  try {
    await waitForReady(baseUrl, child, getLogs);

    const preflight = await fetchWithTimeout(`${baseUrl}/operations/config`, {
      method: "OPTIONS",
      headers: {
        origin: ORIGIN,
        "access-control-request-method": "GET",
        "access-control-request-headers": REQUESTED_HEADERS,
      },
    });

    assertEqual(preflight.status, 204, "preflight status");
    assertEqual(preflight.headers.get("access-control-allow-origin"), ORIGIN, "preflight origin");
    assertEqual(
      preflight.headers.get("access-control-allow-headers"),
      REQUESTED_HEADERS,
      "preflight allowed headers",
    );
    assertEqual(
      preflight.headers.get("access-control-allow-credentials"),
      "true",
      "preflight credentials",
    );

    for (let i = 0; i < 3; i += 1) {
      const config = await fetchWithTimeout(`${baseUrl}/operations/config`, {
        headers: {
          origin: ORIGIN,
          "x-session-id": "local-session-id",
        },
      });
      assertEqual(config.status, 200, `config status ${i + 1}`);
      assertEqual(config.headers.get("access-control-allow-origin"), ORIGIN, `config origin ${i + 1}`);
      assertEqual(
        config.headers.get("access-control-allow-credentials"),
        "true",
        `config credentials ${i + 1}`,
      );
      const body = await config.json();
      assertEqual(body.environment, "test", `config environment ${i + 1}`);
    }

    await delay(CRASH_WAIT_MS);
    assertChildAlive(child, getLogs);
    assertNoBadLogs(logs);

    console.log("CORS smoke passed", { baseUrl });
  } finally {
    child.kill("SIGTERM");
    await delay(50);
    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
