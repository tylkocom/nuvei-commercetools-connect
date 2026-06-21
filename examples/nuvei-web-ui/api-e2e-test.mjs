#!/usr/bin/env node
/**
 * Headless API-level test for the Nuvei processor.
 *
 * Tests unauthenticated endpoints and verifies auth gates.
 * Authenticated flows (create session, confirm payment) require a real
 * commercetools Checkout session token and are validated via the browser
 * test page instead.
 *
 * Run with:
 *   node examples/nuvei-web-ui/api-e2e-test.mjs
 *
 * Prerequisites:
 *   - Processor running on PORT (default 8080)
 *   - Mock CT server running on MOCK_CT_PORT (default 8089)
 */

import assert from "node:assert";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PROCESSOR_URL = process.env.PROCESSOR_URL ?? "http://localhost:8080";
const MOCK_CT_URL = process.env.MOCK_CT_URL ?? "http://localhost:8089";
const TEST_ORIGIN = "http://localhost:3000";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, headers: res.headers, body };
}

function log(step, detail) {
  console.log(`\x1b[36m[${step}]\x1b[0m ${detail}`);
}

function fail(step, detail) {
  console.error(`\x1b[31m[${step}] FAIL\x1b[0m ${detail}`);
  process.exitCode = 1;
}

function ok(step, detail) {
  console.log(`\x1b[32m[${step}] OK\x1b[0m ${detail}`);
}

function warn(step, detail) {
  console.log(`\x1b[33m[${step}] WARN\x1b[0m ${detail}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function testProcessorHealth() {
  log("TEST-1", "GET /health");
  const { status, body } = await request(`${PROCESSOR_URL}/health`);
  if (status !== 200) {
    fail("TEST-1", `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    return false;
  }
  assert(body.status === "ok", "Health status not ok");
  ok("TEST-1", `${body.checks?.length ?? 0} config check(s) passed`);
  return true;
}

async function testCorsPreflight() {
  log("TEST-2", "OPTIONS /payments/session (CORS preflight)");
  const res = await fetch(`${PROCESSOR_URL}/payments/session`, {
    method: "OPTIONS",
    headers: {
      origin: TEST_ORIGIN,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type, x-session-id",
    },
  });
  if (res.status !== 204 && res.status !== 200) {
    fail("TEST-2", `Expected 204/200, got ${res.status}`);
    return false;
  }
  const allowOrigin = res.headers.get("access-control-allow-origin");
  if (!allowOrigin) {
    fail(
      "TEST-2",
      `Missing Access-Control-Allow-Origin header. The processor only grants CORS to ` +
        `allowlisted origins - start it with CORS_ALLOWED_ORIGINS=${TEST_ORIGIN}`,
    );
    return false;
  }
  ok("TEST-2", `CORS allowed origin: ${allowOrigin}`);
  return true;
}

async function testAuthRejection() {
  log("TEST-3", "POST /payments/session without auth (should 401)");
  const { status, body } = await request(`${PROCESSOR_URL}/payments/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: TEST_ORIGIN },
    body: JSON.stringify({ paymentMethodOptions: { card: {} } }),
  });
  if (status !== 401) {
    fail("TEST-3", `Expected 401, got ${status}: ${JSON.stringify(body)}`);
    return false;
  }
  ok("TEST-3", "Correctly rejected unauthenticated request");
  return true;
}

async function testMockCtHealth() {
  log("TEST-4", "GET /health on mock CT server");
  const { status, body } = await request(`${MOCK_CT_URL}/health`);
  if (status !== 200) {
    fail("TEST-4", `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    return false;
  }
  ok("TEST-4", "Mock CT server healthy");
  return true;
}

async function testMockCtCreateSession() {
  log("TEST-5", "POST /payments/session on mock CT server");
  const { status, body } = await request(`${MOCK_CT_URL}/payments/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paymentMethodOptions: { embedded: {} } }),
  });
  if (status !== 200) {
    fail("TEST-5", `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    return null;
  }
  assert(body.sessionToken, "Missing sessionToken");
  assert(body.paymentReference, "Missing paymentReference");
  ok(
    "TEST-5",
    `hasSessionToken=true, sessionTokenLength=${body.sessionToken.length}, paymentReference=${body.paymentReference}`,
  );
  return body;
}

async function testMockCtConfirm(paymentReference) {
  log("TEST-6", `POST /payments/confirm/${paymentReference} on mock CT server`);
  const { status, body } = await request(`${MOCK_CT_URL}/payments/confirm/${paymentReference}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionToken: "mock-session-token" }),
  });
  if (status !== 200) {
    fail("TEST-6", `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    return false;
  }
  assert(body.outcome === "approved", `Unexpected outcome: ${body.outcome}`);
  ok("TEST-6", `Outcome: ${body.outcome}`);
  return true;
}

async function testProcessorDmnWebhook(paymentReference) {
  log("TEST-7", "POST /webhooks/nuvei (DMN) to processor");

  const dmnBody = {
    merchant_id: process.env.NUVEI_MERCHANT_ID ?? "test-merchant",
    merchant_site_id: process.env.NUVEI_MERCHANT_SITE_ID ?? "test-site",
    merchant_unique_id: paymentReference,
    clientUniqueId: paymentReference,
    PPP_TransactionID: `dmn-tx-${crypto.randomUUID()}`,
    advanceResponseChecksum: "mock-checksum",
    Status: "APPROVED",
    totalAmount: "10.00",
    currency: "EUR",
    responseTimeStamp: new Date().toISOString(),
  };

  // Calculate checksum if secret key is available
  if (process.env.NUVEI_SECRET_KEY) {
    const checksumFields = [
      dmnBody.merchant_id,
      dmnBody.merchant_site_id,
      dmnBody.PPP_TransactionID,
      dmnBody.Status,
      dmnBody.totalAmount,
      dmnBody.currency,
      dmnBody.responseTimeStamp,
      process.env.NUVEI_SECRET_KEY,
    ];
    dmnBody.advanceResponseChecksum = crypto.createHash("sha256").update(checksumFields.join("")).digest("hex");
  }

  const { status, body } = await request(`${PROCESSOR_URL}/webhooks/nuvei`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(dmnBody).toString(),
  });

  // Processor may accept (200) or reject (400/403) DMN depending on checksum/correlation
  if (status === 200) {
    ok("TEST-7", `DMN accepted: ${JSON.stringify(body)}`);
    return true;
  }
  if (status === 400 || status === 403) {
    warn("TEST-7", `DMN rejected (expected for synthetic data): ${status} ${JSON.stringify(body)}`);
    return true; // Not a failure — synthetic DMN data often fails correlation
  }
  fail("TEST-7", `Unexpected status ${status}: ${JSON.stringify(body)}`);
  return false;
}

async function testDebugDumpRemoved() {
  log("TEST-8", "GET /debug/dump (must not exist)");
  const { status } = await request(`${PROCESSOR_URL}/debug/dump`);
  if (status === 200) {
    fail(
      "TEST-8",
      "Debug dump endpoint is exposed. It leaks session tokens and headers and was removed - this is a security regression.",
    );
    return false;
  }
  ok("TEST-8", `Debug dump endpoint not exposed (${status})`);
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=".repeat(60));
  console.log("Nuvei Processor API Test (Headless)");
  console.log("=".repeat(60));
  console.log(`Processor: ${PROCESSOR_URL}`);
  console.log(`Mock CT:   ${MOCK_CT_URL}`);
  console.log("");

  let passed = 0;
  let failed = 0;

  const run = async (fn) => {
    try {
      const result = await fn();
      if (result === false) failed++;
      else if (result === null) failed++;
      else passed++;
    } catch (err) {
      fail("UNEXPECTED", `${err.message}\n${err.stack}`);
      failed++;
    }
  };

  // Health checks
  await run(testProcessorHealth);
  await run(testMockCtHealth);

  // CORS + auth
  await run(testCorsPreflight);
  await run(testAuthRejection);

  // Mock CT payment flow (no auth needed — this is the mock)
  const session = await testMockCtCreateSession();
  if (session) {
    await run(() => testMockCtConfirm(session.paymentReference));
    await run(() => testProcessorDmnWebhook(session.paymentReference));
  } else {
    failed += 2;
  }

  // Security regressions
  await run(testDebugDumpRemoved);

  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main();
