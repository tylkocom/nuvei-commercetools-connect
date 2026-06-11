#!/usr/bin/env node
/**
 * Nuvei-side-only evidence collection: observable Nuvei sandbox behavior
 * with no commercetools involvement. See ../EVIDENCE-COLLECTION.md.
 *
 * Flows:
 *   N-01-auth-settle-refund  openOrder → payment(Auth approved) → status → settle → refund
 *   N-02-declined-auth       openOrder → payment(declined card) → status
 *   N-03-auth-void           openOrder → payment(Auth approved) → void
 *   N-04-sale                openOrder → payment(Sale approved) → status
 *
 * DMNs are captured when DMN_PUBLIC_URL points at this machine's receiver
 * port (default 8091). Without it, deterministic blockers are recorded.
 */
import {
  createDmnReceiver,
  createRunContext,
  delay,
  missingEnv,
} from './evidence-side-lib.mjs';
import { createNuveiClient, NUVEI_SANDBOX_BASE_URL, TEST_CARDS, validateDmnChecksum } from './nuvei-rest-client.mjs';

const REQUIRED_ENV = ['NUVEI_MERCHANT_ID', 'NUVEI_MERCHANT_SITE_ID', 'NUVEI_SECRET_KEY'];
const DMN_RECEIVER_PORT = Number(process.env.DMN_RECEIVER_PORT ?? 8091);
const DMN_WAIT_MS = Number(process.env.DMN_WAIT_MS ?? 60_000);
const AMOUNT = '10.00';
const CURRENCY = 'USD';

function summarizeIdentifiers(label, response) {
  return {
    label,
    status: response?.status ?? null,
    transactionStatus: response?.transactionStatus ?? null,
    errCode: response?.errCode ?? null,
    reason: response?.reason ?? null,
    hasSessionToken: typeof response?.sessionToken === 'string' && response.sessionToken.length > 0,
    hasTransactionId: typeof response?.transactionId === 'string' && response.transactionId.length > 0,
    pppFieldPresent: ['PPP_TransactionID', 'PPP_TransactionId', 'ppp_TransactionID'].filter((key) => response?.[key] !== undefined),
    clientUniqueId: response?.clientUniqueId ?? null,
  };
}

function dmnObservations(body, secretKey) {
  return {
    transactionType: body.transactionType ?? null,
    ppp_status: body.ppp_status ?? null,
    Status: body.Status ?? body.status ?? null,
    pppFieldPresent: ['PPP_TransactionID', 'PPP_TransactionId', 'ppp_TransactionID'].filter((key) => body[key] !== undefined),
    merchant_unique_id: body.merchant_unique_id ?? null,
    clientUniqueId: body.clientUniqueId ?? null,
    totalAmount: body.totalAmount ?? null,
    currency: body.currency ?? null,
    checksumFieldPresent: ['advanceResponseChecksum', 'responsechecksum', 'responseChecksum'].filter((key) => body[key] !== undefined),
    checksumValid: validateDmnChecksum(body, secretKey),
  };
}

async function runFlow(ctx, client, flowId, steps) {
  const captured = {};
  for (const step of steps) {
    const result = await step.run(captured);
    captured[step.name] = result;
    ctx.writeFixture(`${flowId}/${step.name}.json`, {
      request: result.request ?? null,
      httpStatus: result.httpStatus,
      response: result.response,
    });
  }
  return captured;
}

async function main() {
  const ctx = createRunContext({ side: 'nuvei' });
  const missing = missingEnv(REQUIRED_ENV);

  if (missing.length > 0) {
    for (const flowId of ['N-01-auth-settle-refund', 'N-02-declined-auth', 'N-03-auth-void', 'N-04-sale']) {
      ctx.recordBlocker(`${flowId}/blocked.json`, {
        reason: 'missing-nuvei-sandbox-credentials',
        missing,
        attempted: 'npm --prefix examples/nuvei-web-ui run evidence:nuvei',
      });
    }
    const manifest = ctx.finalize();
    console.log(`nuvei side: ${manifest.status} (missing: ${missing.join(', ')})`);
    return;
  }

  const client = createNuveiClient({
    merchantId: process.env.NUVEI_MERCHANT_ID,
    merchantSiteId: process.env.NUVEI_MERCHANT_SITE_ID,
    secretKey: process.env.NUVEI_SECRET_KEY,
    baseUrl: process.env.NUVEI_API_BASE_URL ?? NUVEI_SANDBOX_BASE_URL,
  });

  // Optional DMN capture
  const dmnPublicUrl = process.env.DMN_PUBLIC_URL?.replace(/\/$/, '');
  let receiver;
  let urlDetails;
  if (dmnPublicUrl) {
    receiver = createDmnReceiver({ port: DMN_RECEIVER_PORT });
    await receiver.listen();
    urlDetails = { notificationUrl: `${dmnPublicUrl}/dmn` };
  }

  const observations = [];

  // --- N-01: auth → settle → refund -------------------------------------
  const n01 = await runFlow(ctx, client, 'N-01-auth-settle-refund', [
    { name: 'openOrder', run: () => client.openOrder({ amount: AMOUNT, currency: CURRENCY, clientUniqueId: 'side-n01', ...(urlDetails ? { urlDetails } : {}) }) },
    { name: 'payment-auth', run: (prev) => client.payment({ sessionToken: prev.openOrder.response.sessionToken, amount: AMOUNT, currency: CURRENCY, transactionType: 'Auth', card: TEST_CARDS.approvedVisa, clientUniqueId: 'side-n01', ...(urlDetails ? { urlDetails } : {}) }) },
    { name: 'getPaymentStatus', run: (prev) => client.getPaymentStatus(prev.openOrder.response.sessionToken) },
    { name: 'settle', run: (prev) => client.settleTransaction({ amount: AMOUNT, currency: CURRENCY, relatedTransactionId: prev['payment-auth'].response.transactionId, clientUniqueId: 'side-n01' }) },
    { name: 'refund', run: (prev) => client.refundTransaction({ amount: AMOUNT, currency: CURRENCY, relatedTransactionId: prev.settle.response.transactionId, clientUniqueId: 'side-n01' }) },
  ]);
  observations.push(
    summarizeIdentifiers('N-01 payment-auth', n01['payment-auth'].response),
    summarizeIdentifiers('N-01 settle', n01.settle.response),
    summarizeIdentifiers('N-01 refund', n01.refund.response),
  );

  // --- N-02: declined auth ----------------------------------------------
  const n02 = await runFlow(ctx, client, 'N-02-declined-auth', [
    { name: 'openOrder', run: () => client.openOrder({ amount: AMOUNT, currency: CURRENCY, clientUniqueId: 'side-n02', ...(urlDetails ? { urlDetails } : {}) }) },
    { name: 'payment-declined', run: (prev) => client.payment({ sessionToken: prev.openOrder.response.sessionToken, amount: AMOUNT, currency: CURRENCY, transactionType: 'Auth', card: TEST_CARDS.declinedVisa, clientUniqueId: 'side-n02', ...(urlDetails ? { urlDetails } : {}) }) },
    { name: 'getPaymentStatus', run: (prev) => client.getPaymentStatus(prev.openOrder.response.sessionToken) },
  ]);
  observations.push(summarizeIdentifiers('N-02 payment-declined', n02['payment-declined'].response));

  // --- N-03: auth → void -------------------------------------------------
  const n03 = await runFlow(ctx, client, 'N-03-auth-void', [
    { name: 'openOrder', run: () => client.openOrder({ amount: AMOUNT, currency: CURRENCY, clientUniqueId: 'side-n03', ...(urlDetails ? { urlDetails } : {}) }) },
    { name: 'payment-auth', run: (prev) => client.payment({ sessionToken: prev.openOrder.response.sessionToken, amount: AMOUNT, currency: CURRENCY, transactionType: 'Auth', card: TEST_CARDS.approvedVisa, clientUniqueId: 'side-n03', ...(urlDetails ? { urlDetails } : {}) }) },
    { name: 'void', run: (prev) => client.voidTransaction({ amount: AMOUNT, currency: CURRENCY, relatedTransactionId: prev['payment-auth'].response.transactionId, clientUniqueId: 'side-n03' }) },
  ]);
  observations.push(summarizeIdentifiers('N-03 void', n03.void.response));

  // --- N-04: sale ----------------------------------------------------------
  const n04 = await runFlow(ctx, client, 'N-04-sale', [
    { name: 'openOrder', run: () => client.openOrder({ amount: AMOUNT, currency: CURRENCY, clientUniqueId: 'side-n04', ...(urlDetails ? { urlDetails } : {}) }) },
    { name: 'payment-sale', run: (prev) => client.payment({ sessionToken: prev.openOrder.response.sessionToken, amount: AMOUNT, currency: CURRENCY, transactionType: 'Sale', card: TEST_CARDS.approvedVisa, clientUniqueId: 'side-n04', ...(urlDetails ? { urlDetails } : {}) }) },
    { name: 'getPaymentStatus', run: (prev) => client.getPaymentStatus(prev.openOrder.response.sessionToken) },
  ]);
  observations.push(summarizeIdentifiers('N-04 payment-sale', n04['payment-sale'].response));

  // --- DMNs ---------------------------------------------------------------
  if (receiver) {
    console.log(`waiting up to ${DMN_WAIT_MS}ms for DMNs at ${dmnPublicUrl}/dmn ...`);
    await delay(DMN_WAIT_MS);
    const flows = { 'side-n01': 'N-01-auth-settle-refund', 'side-n02': 'N-02-declined-auth', 'side-n03': 'N-03-auth-void', 'side-n04': 'N-04-sale' };
    const counters = {};
    const dmnSummaries = [];
    for (const { body } of receiver.received) {
      const flowId = flows[String(body.clientUniqueId ?? '')] ?? 'unmatched';
      counters[flowId] = (counters[flowId] ?? 0) + 1;
      ctx.writeFixture(`${flowId}/dmn-${String(counters[flowId]).padStart(2, '0')}.json`, body);
      dmnSummaries.push({ flowId, ...dmnObservations(body, process.env.NUVEI_SECRET_KEY) });
    }
    ctx.writeFixture('dmn-observations.json', { receivedCount: receiver.received.length, dmns: dmnSummaries });
    receiver.close();
  } else {
    ctx.recordBlocker('dmn-blocked.json', {
      reason: 'no-dmn-public-url',
      missing: ['DMN_PUBLIC_URL'],
      attempted: 'Set DMN_PUBLIC_URL to a public HTTPS URL forwarding to localhost:8091 (e.g. ngrok http 8091).',
    });
  }

  ctx.writeFixture('field-observations.json', { observations });

  const manifest = ctx.finalize();
  console.log(`nuvei side: ${manifest.status}, ${manifest.fixtures.length} fixtures`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
