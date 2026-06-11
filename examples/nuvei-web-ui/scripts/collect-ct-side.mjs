#!/usr/bin/env node
/**
 * commercetools-side-only evidence collection: observable CT project API
 * behavior with no Nuvei involvement. See ../EVIDENCE-COLLECTION.md.
 *
 * Flows:
 *   C-01-payment-lifecycle  cart → payment (processor shape) → addPayment →
 *                           transaction state transitions → final snapshot
 *   C-02-version-conflict   stale-version update → 409 ConcurrentModification body
 *   C-03-cleanup            delete payment + cart (repeatable project state)
 */
import { randomUUID } from 'node:crypto';
import { createRunContext, missingEnv } from './evidence-side-lib.mjs';
import { createCtClient } from './ct-rest-client.mjs';

const REQUIRED_ENV = ['CTP_PROJECT_KEY', 'CTP_CLIENT_ID', 'CTP_CLIENT_SECRET', 'CTP_AUTH_URL', 'CTP_API_URL'];
const AMOUNT = { currencyCode: 'EUR', centAmount: 1000 };

async function main() {
  const ctx = createRunContext({ side: 'commercetools' });
  const missing = missingEnv(REQUIRED_ENV);

  if (missing.length > 0) {
    for (const flowId of ['C-01-payment-lifecycle', 'C-02-version-conflict', 'C-03-cleanup']) {
      ctx.recordBlocker(`${flowId}/blocked.json`, {
        reason: 'missing-commercetools-credentials',
        missing,
        attempted: 'npm --prefix examples/nuvei-web-ui run evidence:ct',
      });
    }
    const manifest = ctx.finalize();
    console.log(`commercetools side: ${manifest.status} (missing: ${missing.join(', ')})`);
    return;
  }

  const ct = createCtClient({
    projectKey: process.env.CTP_PROJECT_KEY,
    clientId: process.env.CTP_CLIENT_ID,
    clientSecret: process.env.CTP_CLIENT_SECRET,
    authUrl: process.env.CTP_AUTH_URL,
    apiUrl: process.env.CTP_API_URL,
  });

  const authResult = await ct.authenticate();
  ctx.writeFixture('C-01-payment-lifecycle/oauth-token-shape.json', {
    status: authResult.status,
    body: { ...authResult.body, access_token: '[volatile]', scope: authResult.body?.scope ?? null },
  });

  // --- C-01: payment lifecycle (mirrors CtPaymentCreationService shape) ---
  const interfaceId = `side-evidence-${randomUUID()}`;

  const cart = await ct.api('/carts', { method: 'POST', body: { currency: AMOUNT.currencyCode } });
  ctx.writeFixture('C-01-payment-lifecycle/cart-created.json', cart);

  const payment = await ct.api('/payments', {
    method: 'POST',
    body: {
      amountPlanned: AMOUNT,
      interfaceId,
      paymentMethodInfo: { paymentInterface: 'nuvei', method: 'card', name: { en: 'Card' } },
      transactions: [{ type: 'Authorization', amount: AMOUNT, state: 'Initial', interactionId: interfaceId }],
    },
  });
  ctx.writeFixture('C-01-payment-lifecycle/payment-created.json', payment);

  const paymentId = payment.body?.id;
  const cartId = cart.body?.id;
  if (!paymentId || !cartId) {
    ctx.recordBlocker('C-01-payment-lifecycle/blocked.json', {
      reason: 'cart-or-payment-creation-failed',
      missing: [],
      attempted: `cart status ${cart.status}, payment status ${payment.status}`,
    });
    ctx.finalize();
    return;
  }

  const cartWithPayment = await ct.api(`/carts/${cartId}`, {
    method: 'POST',
    body: { version: cart.body.version, actions: [{ action: 'addPayment', payment: { typeId: 'payment', id: paymentId } }] },
  });
  ctx.writeFixture('C-01-payment-lifecycle/cart-after-add-payment.json', cartWithPayment);

  const transactionId = payment.body.transactions?.[0]?.id;
  const stateChanged = await ct.api(`/payments/${paymentId}`, {
    method: 'POST',
    body: {
      version: payment.body.version,
      actions: [
        { action: 'changeTransactionState', transactionId, state: 'Success' },
        { action: 'changeTransactionInteractionId', transactionId, interactionId: 'ppp-evidence-001' },
        { action: 'setStatusInterfaceCode', interfaceCode: 'authorized' },
      ],
    },
  });
  ctx.writeFixture('C-01-payment-lifecycle/payment-after-success-transition.json', stateChanged);

  const chargeAdded = await ct.api(`/payments/${paymentId}`, {
    method: 'POST',
    body: {
      version: stateChanged.body.version,
      actions: [
        { action: 'addTransaction', transaction: { type: 'Charge', amount: AMOUNT, state: 'Success', interactionId: 'ppp-evidence-002' } },
        { action: 'setStatusInterfaceCode', interfaceCode: 'paid' },
      ],
    },
  });
  ctx.writeFixture('C-01-payment-lifecycle/payment-after-charge.json', chargeAdded);

  const finalPayment = await ct.api(`/payments/${paymentId}`);
  ctx.writeFixture('C-01-payment-lifecycle/payment-final.json', finalPayment);

  // --- C-02: version conflict ---------------------------------------------
  const conflict = await ct.api(`/payments/${paymentId}`, {
    method: 'POST',
    body: {
      version: 1, // deliberately stale
      actions: [{ action: 'setStatusInterfaceCode', interfaceCode: 'conflict-test' }],
    },
  });
  ctx.writeFixture('C-02-version-conflict/stale-version-update.json', conflict);

  // --- C-03: cleanup --------------------------------------------------------
  const latestCart = await ct.api(`/carts/${cartId}`);
  const cartDeleted = await ct.api(`/carts/${cartId}?version=${latestCart.body?.version ?? cartWithPayment.body?.version}`, { method: 'DELETE' });
  ctx.writeFixture('C-03-cleanup/cart-deleted.json', cartDeleted);

  const latestPayment = await ct.api(`/payments/${paymentId}`);
  const paymentDeleted = await ct.api(`/payments/${paymentId}?version=${latestPayment.body?.version ?? chargeAdded.body?.version}`, { method: 'DELETE' });
  ctx.writeFixture('C-03-cleanup/payment-deleted.json', paymentDeleted);

  ctx.writeFixture('field-observations.json', {
    observations: [
      { label: 'payment-create-status', value: payment.status },
      { label: 'transaction-initial-state', value: payment.body.transactions?.[0]?.state ?? null },
      { label: 'success-transition-status', value: stateChanged.status },
      { label: 'charge-add-status', value: chargeAdded.status },
      { label: 'stale-version-status', value: conflict.status },
      { label: 'stale-version-error-code', value: conflict.body?.errors?.[0]?.code ?? null },
      { label: 'cleanup-cart-status', value: cartDeleted.status },
      { label: 'cleanup-payment-status', value: paymentDeleted.status },
    ],
  });

  const manifest = ctx.finalize();
  console.log(`commercetools side: ${manifest.status}, ${manifest.fixtures.length} fixtures`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
