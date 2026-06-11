#!/usr/bin/env node
/**
 * Offline self-check for side-based evidence collection. No credentials, no
 * network. Verifies:
 *   1. Blocked-mode collectors are deterministic (two runs → identical bytes).
 *   2. normalizeForDeterminism removes volatile values and aliases UUIDs stably.
 *   3. Fixture pipeline output passes the forbidden-evidence scanner.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createRunContext,
  normalizeForDeterminism,
  stableStringify,
} from './evidence-side-lib.mjs';
import { scanForbiddenEvidence } from './validate-evidence.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function snapshotDir(root) {
  const entries = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else entries[path.relative(root, full)] = fs.readFileSync(full, 'utf8');
    }
  };
  if (fs.existsSync(root)) walk(root);
  return entries;
}

function runBlockedCollectors(targetRoot) {
  const rawRoot = path.join(targetRoot, 'raw');
  const evidenceRoot = path.join(targetRoot, 'evidence');
  const cleanEnv = { ...process.env };
  for (const name of Object.keys(cleanEnv)) {
    if (/^(NUVEI_|CTP_|DMN_|PROCESSOR_URL|EVIDENCE_CAPTURE_TOKEN)/.test(name)) delete cleanEnv[name];
  }
  for (const script of ['collect-nuvei-side.mjs', 'collect-ct-side.mjs', 'collect-e2e.mjs']) {
    const run = spawnSync(process.execPath, [path.join(SCRIPT_DIR, script)], {
      env: { ...cleanEnv, SIDES_RAW_ROOT_OVERRIDE: rawRoot, SIDES_EVIDENCE_ROOT_OVERRIDE: evidenceRoot },
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, `${script} blocked-mode run failed:\n${run.stdout}\n${run.stderr}`);
  }
  return snapshotDir(evidenceRoot);
}

function checkNormalization() {
  const input = {
    timeStamp: '20260611121314',
    createdAt: '2026-06-11T12:13:14.000Z',
    lastModifiedBy: { clientId: 'should-be-dropped' },
    nested: { id: '0f6f9a44-3c61-4a37-8a3d-111111111111', other: '0f6f9a44-3c61-4a37-8a3d-111111111111' },
    second: '2e7c1b9a-0000-4a37-8a3d-222222222222',
    keep: 42,
  };
  const aliases = new Map();
  const first = normalizeForDeterminism(input, aliases);
  assert.equal(first.timeStamp, '[volatile]');
  assert.equal(first.createdAt, '[volatile]');
  assert.equal(first.lastModifiedBy, undefined);
  assert.equal(first.nested.id, 'uuid-001');
  assert.equal(first.nested.other, 'uuid-001');
  assert.equal(first.second, 'uuid-002');
  assert.equal(first.keep, 42);
  const again = normalizeForDeterminism(input, new Map());
  assert.equal(stableStringify(first), stableStringify(again), 'normalization is not stable across fresh alias maps');
  console.log('normalization: OK');
}

function checkRunContextPipeline(targetRoot) {
  const rawRoot = path.join(targetRoot, 'ctx-raw');
  const evidenceRoot = path.join(targetRoot, 'ctx-evidence');
  const make = () => {
    const ctx = createRunContext({ side: 'self-check', rawRoot, evidenceRoot });
    ctx.writeFixture('flow/sample.json', {
      sessionToken: 'tok_ABCDEFGH12345678',
      PPP_TransactionID: '7110000000001234',
      checksum: 'deadbeefdeadbeefdeadbeefdeadbeef',
      cardNumber: '4761344136141390',
      email: 'shopper@example.com',
      timeStamp: '20260611121314',
      cartId: 'b29cf6a0-9436-4d54-92bd-333333333333',
    });
    return ctx.finalize();
  };
  const first = make();
  const firstBytes = snapshotDir(evidenceRoot);
  const second = make();
  const secondBytes = snapshotDir(evidenceRoot);
  assert.deepEqual(first, second, 'run manifests differ between identical runs');
  assert.deepEqual(firstBytes, secondBytes, 'fixture bytes differ between identical runs');

  const sample = JSON.parse(firstBytes[path.join('self-check', 'flow', 'sample.json')]);
  assert.equal(sample.checksum, '[redacted-checksum]');
  assert.equal(sample.cardNumber, '[redacted-card-data]');
  assert.equal(sample.email, '[redacted-pii]');
  assert.equal(sample.timeStamp, '[volatile]');
  assert.match(sample.sessionToken, /^sessionToken-\d{3}$/);
  assert.match(sample.PPP_TransactionID, /^ppp-\d{3}$/);
  assert.match(sample.cartId, /^cart-\d{3}$/);

  const scan = scanForbiddenEvidence(evidenceRoot);
  assert.deepEqual(scan, [], `forbidden evidence found: ${JSON.stringify(scan)}`);
  console.log('run-context pipeline: OK');
}

function checkBlockedDeterminism(targetRoot) {
  const first = runBlockedCollectors(path.join(targetRoot, 'run1'));
  const second = runBlockedCollectors(path.join(targetRoot, 'run2'));
  assert.deepEqual(first, second, 'blocked-mode collector output differs between runs');
  assert.ok(Object.keys(first).length >= 3, 'expected blocker fixtures from all three sides');
  console.log(`blocked-mode determinism: OK (${Object.keys(first).length} files identical across runs)`);
}

function main() {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sides-self-check-'));
  try {
    checkNormalization();
    checkRunContextPipeline(targetRoot);
    checkBlockedDeterminism(targetRoot);
    console.log('sides self-check passed');
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
}

main();
