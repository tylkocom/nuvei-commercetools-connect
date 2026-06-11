#!/usr/bin/env node
/**
 * End-to-end combined evidence collection: local processor + mock CT ledger +
 * Nuvei sandbox (+ DMNs through a tunnel). See ../EVIDENCE-COLLECTION.md.
 *
 * The collector stands in for the browser: it calls Nuvei payment.do with the
 * sessionToken issued by the processor — the same gateway call the Simply
 * Connect / Web SDK widgets perform.
 *
 * Flows:
 *   E-01-auth-confirm     processor session → Nuvei payment → processor confirm → ledger
 *   E-02-capture-intent   /payment-intents capturePayment → ledger
 *   E-03-refund-intent    /payment-intents refundPayment → ledger
 *   E-04-cancel-intent    fresh auth → /payment-intents cancelPayment → ledger
 *   E-05-duplicate-dmn    replay a really-received DMN → expect dedup
 *   E-06-mismatch-dmn     tampered amount, recomputed checksum → expect rejection
 *
 * Modes:
 *   default      spawns mock CT + processor dist locally
 *   --deployed   only pulls /evidence/captures from PROCESSOR_URL (token-gated)
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  createDmnReceiver,
  createRunContext,
  delay,
  httpJson,
  missingEnv,
  waitFor,
  REPO_ROOT,
} from './evidence-side-lib.mjs';
import { createNuveiClient, NUVEI_SANDBOX_BASE_URL, TEST_CARDS } from './nuvei-rest-client.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_ROOT = path.resolve(SCRIPT_DIR, '..');
const PROCESSOR_DIST = path.resolve(REPO_ROOT, 'processor/dist/index.js');

const REQUIRED_ENV = ['NUVEI_MERCHANT_ID', 'NUVEI_MERCHANT_SITE_ID', 'NUVEI_SECRET_KEY'];
const MOCK_CT_PORT = Number(process.env.MOCK_CT_PORT ?? 8089);
const PROCESSOR_PORT = Number(process.env.E2E_PROCESSOR_PORT ?? 8088);
const DMN_RECEIVER_PORT = Number(process.env.DMN_RECEIVER_PORT ?? 8091);
const DMN_WAIT_MS = Number(process.env.DMN_WAIT_MS ?? 60_000);
const MOCK_CT_URL = `http://127.0.0.1:${MOCK_CT_PORT}`;
const PROCESSOR_URL = `http://127.0.0.1:${PROCESSOR_PORT}`;
const SESSION_HEADERS = { 'content-type': 'application/json', 'x-session-id': 'session-local-001' };
const OAUTH_HEADERS = { 'content-type': 'application/json', authorization: 'Bearer mock-ct-access-token' };
const AMOUNT_CENT = 1000;
const AMOUNT = '10.00';
const CURRENCY = 'EUR';

function spawnChild(label, command, args, env) {
  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => (logs += chunk.toString()));
  child.stderr.on('data', (chunk) => (logs += chunk.toString()));
  return {
    label,
    child,
    getLogs: () => logs,
    kill() {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
      }, 300).unref();
    },
  };
}

async function startStack(dmnPublicUrl) {
  const mockCt = spawnChild('mock-ct', process.execPath, [path.resolve(EXAMPLE_ROOT, 'mock-commercetools-server.mjs')], {
    PORT: String(MOCK_CT_PORT),
  });
  await waitFor(async () => (await httpJson(`${MOCK_CT_URL}/health`)).status === 200, { label: 'mock CT' });

  const processor = spawnChild('processor', process.execPath, [PROCESSOR_DIST], {
    PORT: String(PROCESSOR_PORT),
    LOGGER_LEVEL: 'info',
    PHASE_02_STAGE_A_LOCAL_MOCK_CT: 'true',
    CTP_PROJECT_KEY: 'payment-integration',
    CTP_CLIENT_ID: 'evidence-client-id',
    CTP_CLIENT_SECRET: 'evidence-client-secret',
    CTP_AUTH_URL: MOCK_CT_URL,
    CTP_API_URL: MOCK_CT_URL,
    CTP_SESSION_URL: MOCK_CT_URL,
    CTP_CHECKOUT_URL: 'https://checkout.europe-west1.gcp.commercetools.com',
    CTP_JWKS_URL: 'https://mc-api.europe-west1.gcp.commercetools.com/.well-known/jwks.json',
    CTP_JWT_ISSUER: 'https://mc-api.europe-west1.gcp.commercetools.com',
    NUVEI_ENV: 'test',
    NUVEI_MERCHANT_ID: process.env.NUVEI_MERCHANT_ID,
    NUVEI_MERCHANT_SITE_ID: process.env.NUVEI_MERCHANT_SITE_ID,
    NUVEI_SECRET_KEY: process.env.NUVEI_SECRET_KEY,
    NUVEI_API_BASE_URL: process.env.NUVEI_API_BASE_URL ?? NUVEI_SANDBOX_BASE_URL,
    ...(dmnPublicUrl ? { CONNECT_SERVICE_URL: dmnPublicUrl } : {}),
  });
  await waitFor(async () => (await httpJson(`${PROCESSOR_URL}/operations/health`)).status === 200, {
    label: 'processor',
  });

  return { mockCt, processor };
}

async function ledgerPayment(paymentId) {
  return httpJson(`${MOCK_CT_URL}/payment-integration/payments/${paymentId}`);
}

async function createSessionAndPay(ctx, nuvei, flowId, { transactionType = 'Auth', urlDetails } = {}) {
  await httpJson(`${MOCK_CT_URL}/reset`, { method: 'POST', body: {} });
  const session = await httpJson(`${PROCESSOR_URL}/payments/session`, {
    method: 'POST',
    headers: SESSION_HEADERS,
    body: { paymentMethodOptions: { card: {} } },
  });
  ctx.writeFixture(`${flowId}/processor-session-response.json`, session);
  if (session.status !== 200) throw new Error(`session creation failed with ${session.status}`);

  const { sessionToken, paymentReference } = session.body;
  const payment = await nuvei.payment({
    sessionToken,
    amount: AMOUNT,
    currency: CURRENCY,
    transactionType,
    card: TEST_CARDS.approvedVisa,
    ...(urlDetails ? { urlDetails } : {}),
  });
  ctx.writeFixture(`${flowId}/nuvei-payment-response.json`, payment);

  const confirm = await httpJson(`${PROCESSOR_URL}/payments/confirm/${paymentReference}`, {
    method: 'POST',
    headers: SESSION_HEADERS,
    body: { sessionToken },
  });
  ctx.writeFixture(`${flowId}/processor-confirm-response.json`, confirm);
  ctx.writeFixture(`${flowId}/ct-payment-after-confirm.json`, await ledgerPayment(paymentReference));

  return { paymentReference, sessionToken };
}

async function paymentIntent(ctx, flowId, paymentReference, action) {
  const response = await httpJson(`${PROCESSOR_URL}/payment-intents/${paymentReference}`, {
    method: 'POST',
    headers: OAUTH_HEADERS,
    body: { actions: [action] },
  });
  ctx.writeFixture(`${flowId}/payment-intent-response.json`, { request: { actions: [action] }, ...response });
  ctx.writeFixture(`${flowId}/ct-payment-after-intent.json`, await ledgerPayment(paymentReference));
  return response;
}

async function collectDeployedCaptures(ctx) {
  const processorUrl = process.env.PROCESSOR_URL?.replace(/\/$/, '');
  const token = process.env.EVIDENCE_CAPTURE_TOKEN;
  if (!processorUrl || !token) {
    ctx.recordBlocker('deployed-captures-blocked.json', {
      reason: 'missing-deployed-capture-configuration',
      missing: ['PROCESSOR_URL', 'EVIDENCE_CAPTURE_TOKEN'].filter((name) => !process.env[name]),
      attempted: 'node scripts/collect-e2e.mjs --deployed',
    });
    return;
  }
  const captures = await httpJson(`${processorUrl}/evidence/captures`, {
    headers: { authorization: `Bearer ${token}` },
  });
  ctx.writeFixture('deployed-captures.json', captures);
}

async function main() {
  const deployedOnly = process.argv.includes('--deployed');
  const ctx = createRunContext({ side: 'e2e' });

  if (deployedOnly) {
    await collectDeployedCaptures(ctx);
    const manifest = ctx.finalize();
    console.log(`e2e (deployed captures): ${manifest.status}`);
    return;
  }

  const missing = missingEnv(REQUIRED_ENV);
  const flows = ['E-01-auth-confirm', 'E-02-capture-intent', 'E-03-refund-intent', 'E-04-cancel-intent', 'E-05-duplicate-dmn', 'E-06-mismatch-dmn'];

  if (missing.length > 0) {
    for (const flowId of flows) {
      ctx.recordBlocker(`${flowId}/blocked.json`, {
        reason: 'missing-nuvei-sandbox-credentials',
        missing,
        attempted: 'npm --prefix examples/nuvei-web-ui run evidence:e2e',
      });
    }
    const manifest = ctx.finalize();
    console.log(`e2e: ${manifest.status} (missing: ${missing.join(', ')})`);
    return;
  }

  const fsExists = await import('node:fs').then((fs) => fs.existsSync(PROCESSOR_DIST));
  if (!fsExists) {
    throw new Error(`processor build missing at ${PROCESSOR_DIST}; run: npm --prefix processor run build`);
  }

  // Optional DMN tunnel: the receiver records DMNs and forwards them to the processor.
  const dmnPublicUrl = process.env.DMN_PUBLIC_URL?.replace(/\/$/, '');
  let receiver;
  if (dmnPublicUrl) {
    receiver = createDmnReceiver({ port: DMN_RECEIVER_PORT });
    await receiver.listen();
  }

  const stack = await startStack(dmnPublicUrl);
  const nuvei = createNuveiClient({
    merchantId: process.env.NUVEI_MERCHANT_ID,
    merchantSiteId: process.env.NUVEI_MERCHANT_SITE_ID,
    secretKey: process.env.NUVEI_SECRET_KEY,
    baseUrl: process.env.NUVEI_API_BASE_URL ?? NUVEI_SANDBOX_BASE_URL,
  });

  try {
    // --- E-01: auth + confirm -------------------------------------------
    const e01 = await createSessionAndPay(ctx, nuvei, 'E-01-auth-confirm');

    // --- E-02/E-03: capture then refund on the same payment ---------------
    await paymentIntent(ctx, 'E-02-capture-intent', e01.paymentReference, {
      action: 'capturePayment',
      amount: { centAmount: AMOUNT_CENT, currencyCode: CURRENCY },
    });
    await paymentIntent(ctx, 'E-03-refund-intent', e01.paymentReference, {
      action: 'refundPayment',
      amount: { centAmount: AMOUNT_CENT, currencyCode: CURRENCY },
    });

    // --- E-04: fresh auth, then cancel -------------------------------------
    const e04 = await createSessionAndPay(ctx, nuvei, 'E-04-cancel-intent');
    await paymentIntent(ctx, 'E-04-cancel-intent', e04.paymentReference, { action: 'cancelPayment' });

    // --- E-05/E-06: DMN replay + tamper (only from really-received DMNs) ---
    if (receiver) {
      console.log(`waiting up to ${DMN_WAIT_MS}ms for forwarded DMNs ...`);
      await delay(DMN_WAIT_MS);
      for (const [i, entry] of receiver.received.entries()) {
        ctx.writeFixture(`dmn-received-${String(i + 1).padStart(2, '0')}.json`, entry.body);
        // forward to processor (the receiver records; the processor reconciles)
        const forwarded = await httpJson(`${PROCESSOR_URL}/webhooks/nuvei`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: entry.body,
        });
        ctx.writeFixture(`dmn-forwarded-${String(i + 1).padStart(2, '0')}.json`, forwarded);
      }

      const realDmn = receiver.received[0]?.body;
      if (realDmn) {
        const duplicate = await httpJson(`${PROCESSOR_URL}/webhooks/nuvei`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: realDmn,
        });
        ctx.writeFixture('E-05-duplicate-dmn/processor-duplicate-response.json', duplicate);

        // synthetic-derived-from-real-dmn: tamper amount, recompute checksum
        const tampered = { ...realDmn, totalAmount: '999.99' };
        const input =
          process.env.NUVEI_SECRET_KEY +
          String(tampered.totalAmount) +
          String(tampered.currency ?? '') +
          String(tampered.responseTimeStamp ?? '') +
          String(tampered.PPP_TransactionID ?? tampered.PPP_TransactionId ?? tampered.ppp_TransactionID ?? '') +
          String(tampered.Status ?? tampered.status ?? '') +
          String(tampered.productId ?? '');
        tampered.advanceResponseChecksum = createHash('sha256').update(input).digest('hex');
        const mismatch = await httpJson(`${PROCESSOR_URL}/webhooks/nuvei`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: tampered,
        });
        ctx.writeFixture('E-06-mismatch-dmn/processor-mismatch-response.json', {
          label: 'synthetic-derived-from-real-dmn',
          ...mismatch,
        });
      } else {
        ctx.recordBlocker('E-05-duplicate-dmn/blocked.json', { reason: 'no-real-dmn-received', missing: [], attempted: `waited ${DMN_WAIT_MS}ms` });
        ctx.recordBlocker('E-06-mismatch-dmn/blocked.json', { reason: 'no-real-dmn-received', missing: [], attempted: `waited ${DMN_WAIT_MS}ms` });
      }
    } else {
      for (const flowId of ['E-05-duplicate-dmn', 'E-06-mismatch-dmn']) {
        ctx.recordBlocker(`${flowId}/blocked.json`, {
          reason: 'no-dmn-public-url',
          missing: ['DMN_PUBLIC_URL'],
          attempted: 'Set DMN_PUBLIC_URL to a public HTTPS URL forwarding to localhost:8091.',
        });
      }
    }
  } finally {
    stack.processor.kill();
    stack.mockCt.kill();
    receiver?.close();
  }

  const manifest = ctx.finalize();
  console.log(`e2e: ${manifest.status}, ${manifest.fixtures.length} fixtures`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
