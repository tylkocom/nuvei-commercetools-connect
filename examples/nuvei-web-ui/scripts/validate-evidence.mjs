import assert from 'node:assert/strict';
import { sanitizeForEvidence } from './sanitize-evidence.mjs';

async function runSelfCheck() {
  assert.equal(typeof sanitizeForEvidence, 'function');
  sanitizeForEvidence({ cart: { id: 'cart-real-123' }, clientUniqueId: 'cart-real-123' });
}

if (process.argv.includes('--self-check')) {
  await runSelfCheck();
} else {
  throw new Error('validate-evidence not implemented');
}
