#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const port = Number(process.env.MOCK_CT_SELF_CHECK_PORT ?? 8091);
const baseUrl = `http://127.0.0.1:${port}`;
const projectKey = 'payment-integration';

function spawnMockServer() {
  return spawn(process.execPath, ['mock-commercetools-server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForHealth(child) {
  const deadline = Date.now() + 5_000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`mock server exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`mock server did not become healthy: ${lastError?.message ?? 'timeout'}`);
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

async function assertOk(pathname, options) {
  const { response, body } = await request(pathname, options);
  assert.ok(response.status === 200 || response.status === 201, `${pathname} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  const child = spawnMockServer();
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  try {
    await waitForHealth(child);
    await assertOk('/reset', { method: 'POST', body: JSON.stringify({}) });

    const session = await assertOk(`/${projectKey}/sessions/session-local-001`);
    assert.equal(session.state, 'ACTIVE');
    assert.equal(session.activeCart.cartRef.id, 'cart-local-001');
    assert.equal(session.metadata.paymentInterface, 'nuvei');
    assert.equal(session.metadata.merchantReturnUrl, 'http://localhost:8089/return');
    assert.ok(session.metadata.processorUrl);
    assert.ok(session.metadata.correlationId);
    assert.deepEqual(session.metadata.allowedPaymentMethods, ['card']);

    const cartBefore = await assertOk(`/${projectKey}/carts/cart-local-001`);
    assert.equal(cartBefore.id, 'cart-local-001');
    assert.equal(typeof cartBefore.version, 'number');
    assert.equal(cartBefore.totalPrice.centAmount, 1000);
    assert.ok(Array.isArray(cartBefore.paymentInfo.payments));

    const payment = await assertOk(`/${projectKey}/payments`, {
      method: 'POST',
      body: JSON.stringify({
        amountPlanned: cartBefore.totalPrice,
        interfaceId: 'session-token-local-001',
        paymentMethodInfo: { paymentInterface: 'nuvei', method: 'card' },
      }),
    });
    assert.ok(payment.id);
    assert.equal(typeof payment.version, 'number');
    assert.equal(payment.interfaceId, 'session-token-local-001');
    assert.equal(payment.amountPlanned.centAmount, 1000);
    assert.equal(payment.paymentMethodInfo.paymentInterface, 'nuvei');
    assert.equal(payment.paymentStatus.interfaceCode, 'pending');
    assert.deepEqual(payment.transactions, []);

    const updatedCart = await assertOk(`/${projectKey}/carts/cart-local-001`, {
      method: 'POST',
      body: JSON.stringify({
        version: cartBefore.version,
        actions: [{ action: 'addPayment', payment: { typeId: 'payment', id: payment.id } }],
      }),
    });
    assert.ok(updatedCart.version > cartBefore.version);
    assert.ok(updatedCart.paymentInfo.payments.some((ref) => ref.id === payment.id));

    const token = await assertOk('/oauth/token', { method: 'POST', body: JSON.stringify({}) });
    assert.equal(token.token_type, 'Bearer');
    assert.ok(token.access_token);
    assert.ok(String(token.scope).includes('manage_checkout_payment_intents'));

    const introspection = await assertOk('/oauth/introspect', { method: 'POST', body: JSON.stringify({ token: token.access_token }) });
    assert.equal(introspection.active, true);
    assert.ok(String(introspection.scope).includes('manage_checkout_transactions'));

    console.log('mock CT self-check passed');
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    child.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
