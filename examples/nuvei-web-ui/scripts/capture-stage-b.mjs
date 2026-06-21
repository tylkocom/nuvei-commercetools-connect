#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE_ROOT, RAW_WORKSPACE } from './evidence-scenarios.mjs';
import { sanitizeForEvidence } from './sanitize-evidence.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const RAW_ROOT = path.resolve(REPO_ROOT, RAW_WORKSPACE);
const STAGE_B_RAW_ROOT = path.join(RAW_ROOT, 'stage-b');
const EVIDENCE_ABS_ROOT = path.resolve(REPO_ROOT, EVIDENCE_ROOT);
const INDEX_PATH = path.join(EVIDENCE_ABS_ROOT, 'index.json');
const FIELD_MATRIX_PATH = path.join(EVIDENCE_ABS_ROOT, 'field-matrix.json');
const FINDINGS_PATH = path.join(EVIDENCE_ABS_ROOT, 'findings.json');
const ALIAS_MAP_PATH = path.join(EVIDENCE_ABS_ROOT, 'aliases/alias-map.json');
const STAGE = 'stage-b-local-browser-processor';
const ENVIRONMENT = 'nuvei-sandbox-local-mock-ct';
const SCENARIOS = new Set([
  'NUV-01-success-auth',
  'NUV-02-decline-auth',
  'NUV-03-3ds-frictionless',
  'NUV-04-3ds-stepup-success',
  'NUV-04-3ds-stepup-failure-or-abandonment',
]);
const FRONTEND_MODES = new Set(['checkout-dropin', 'simply-connect', 'web-sdk']);

function parseArgs(args) {
  const parsed = {
    scenario: undefined,
    frontendMode: undefined,
    ingestRawDir: undefined,
    recordBlocker: false,
    blockerReason: undefined,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--scenario') parsed.scenario = args[++index];
    else if (arg === '--frontend-mode') parsed.frontendMode = args[++index];
    else if (arg === '--ingest-raw-dir') parsed.ingestRawDir = args[++index];
    else if (arg === '--record-blocker') parsed.recordBlocker = true;
    else if (arg === '--blocker-reason') parsed.blockerReason = args[++index];
  }
  return parsed;
}

function nowIso() {
  return new Date().toISOString();
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function loadAliasMap() {
  return readJson(ALIAS_MAP_PATH);
}

function saveAliasMap(aliasMap) {
  writeJson(ALIAS_MAP_PATH, aliasMap);
}

function scenarioRow(document, id) {
  const row = document.scenarios.find((scenario) => scenario.id === id || scenario.scenarioId === id);
  if (!row) throw new Error(`unknown evidence scenario ${id}`);
  return row;
}

function fixtureSlot(row, name) {
  let slot = row.fixtures.find((fixture) => fixture.name === name);
  if (!slot) {
    slot = { name, path: `${row.id}/${name}`, required: false, present: false, source: 'not-captured' };
    row.fixtures.push(slot);
  }
  return slot;
}

function markFixture(row, name, source) {
  const slot = fixtureSlot(row, name);
  slot.present = true;
  slot.source = source;
}

function parseRawJson(rawDir, names) {
  for (const name of names) {
    const filePath = path.join(rawDir, name);
    if (fs.existsSync(filePath)) return { name, value: readJson(filePath) };
  }
  return undefined;
}

function writeSanitizedFixture(scenarioId, fixtureName, value) {
  const aliasMap = loadAliasMap();
  const sanitized = sanitizeForEvidence(value, { aliasMap });
  saveAliasMap(sanitized.aliasMap);
  const outputPath = path.join(EVIDENCE_ABS_ROOT, scenarioId, fixtureName);
  writeJson(outputPath, sanitized.value);
  return sanitized.value;
}

function aliasesFromAliasMap(aliasMap) {
  const aliases = Object.keys(aliasMap.aliases ?? {});
  const byPrefix = (prefix) => aliases.filter((alias) => alias.startsWith(`${prefix}-`)).sort();
  return {
    cartIds: byPrefix('cart'),
    paymentIds: byPrefix('payment'),
    sessionTokens: byPrefix('sessionToken'),
    pppTransactionIds: byPrefix('ppp'),
    transactionIds: byPrefix('transaction'),
    clientUniqueIds: byPrefix('clientUniqueId'),
    merchantUniqueIds: byPrefix('merchantUniqueId'),
  };
}

function collectEvidenceRefs(row) {
  return row.fixtures
    .filter((fixture) => fixture.present)
    .map((fixture) => fixture.path);
}

function blockerPayload({ scenarioId, frontendMode, rawDir, reason, args }) {
  return {
    schemaVersion: 'phase-02-stage-b-blocker-v1',
    stage: STAGE,
    scenarioId,
    frontendMode,
    environment: ENVIRONMENT,
    status: 'blocked',
    recordedAt: nowIso(),
    reason,
    attemptedCommand: `npm --prefix examples/nuvei-web-ui run capture:stage-b -- ${args.join(' ')}`,
    expectedRawDir: path.relative(REPO_ROOT, rawDir),
    expectedRawFiles: [
      'browser-export.json',
      'processor-confirm-response.json or getPaymentStatus-response.json',
      'ct-payment-after-confirm.json or ledger.json',
    ],
    finding: 'No browser/Nuvei result is inferred or faked. This fixture records only the unavailable local browser capture path.',
  };
}

function upsertBlocker(row, blocker) {
  row.blockers = (row.blockers ?? []).filter((existing) => existing.id !== blocker.id);
  row.blockers.push(blocker);
}

function upsertFinding(findings, finding) {
  findings.findings = (findings.findings ?? []).filter((existing) => existing.id !== finding.id);
  findings.findings.push(finding);
}

function updateMatrixBlocked(matrixRow, row, frontendMode, reason) {
  matrixRow.frontendMode = row.frontendMode;
  matrixRow.environment = ENVIRONMENT;
  matrixRow.evidenceRefs = collectEvidenceRefs(row);
  matrixRow.identityModelAssessment = {
    paymentInterfaceIdEqualsSessionToken: 'blocked',
    terminalInteractionIdEqualsPpp: 'blocked',
    clientUniqueIdEqualsCartId: 'blocked',
    transactionIdSecondaryOnly: 'blocked',
  };
  matrixRow.notes = `Stage B ${frontendMode} browser capture blocked: ${reason}`;
}

function updateMatrixCaptured(matrixRow, row, frontendMode) {
  const aliases = row.aliases ?? {};
  matrixRow.frontendMode = frontendMode;
  matrixRow.environment = ENVIRONMENT;
  matrixRow.evidenceRefs = collectEvidenceRefs(row);
  matrixRow.ct.cartId = aliases.cartIds?.[0] ?? matrixRow.ct.cartId ?? 'unobserved';
  matrixRow.ct.paymentId = aliases.paymentIds?.[0] ?? matrixRow.ct.paymentId ?? 'unobserved';
  matrixRow.ct.paymentInterfaceId = aliases.sessionTokens?.[0] ?? matrixRow.ct.paymentInterfaceId ?? 'unobserved';
  matrixRow.nuvei.sessionToken = aliases.sessionTokens?.[0] ?? matrixRow.nuvei.sessionToken ?? 'unobserved';
  matrixRow.nuvei.clientUniqueId = aliases.cartIds?.[0] ?? aliases.clientUniqueIds?.[0] ?? matrixRow.nuvei.clientUniqueId ?? 'unobserved';
  matrixRow.nuvei.merchantUniqueId = aliases.paymentIds?.[0] ?? aliases.merchantUniqueIds?.[0] ?? matrixRow.nuvei.merchantUniqueId ?? 'unobserved';
  matrixRow.identityModelAssessment.paymentInterfaceIdEqualsSessionToken = aliases.sessionTokens?.length ? 'confirmed' : 'unresolved';
  matrixRow.identityModelAssessment.clientUniqueIdEqualsCartId = aliases.cartIds?.length ? 'confirmed' : 'unresolved';
  matrixRow.notes = `Stage B ${frontendMode} browser and processor-confirm evidence captured locally. DMN/status terminal identity remains Stage C scope.`;
}

function recordBlocker({ scenarioId, frontendMode, rawDir, reason, args }) {
  const index = readJson(INDEX_PATH);
  const matrix = readJson(FIELD_MATRIX_PATH);
  const findings = readJson(FINDINGS_PATH);
  const row = scenarioRow(index, scenarioId);
  const matrixRow = scenarioRow(matrix, scenarioId);
  const blocker = blockerPayload({ scenarioId, frontendMode, rawDir, reason, args });
  const sanitizedBrowserBlocker = writeSanitizedFixture(scenarioId, 'browser-result.json', blocker);
  const sanitizedStatusBlocker = writeSanitizedFixture(scenarioId, 'getPaymentStatus-response.json', blocker);
  const sanitizedCtBlocker = writeSanitizedFixture(scenarioId, 'ct-payment-after-confirm.json', blocker);
  writeSanitizedFixture(scenarioId, 'metadata.json', {
    scenarioId,
    frontendMode,
    stage: STAGE,
    environment: ENVIRONMENT,
    status: 'blocked',
    recordedAt: blocker.recordedAt,
    blocker: sanitizedBrowserBlocker,
  });
  row.frontendMode = row.frontendMode === 'not-captured' || frontendMode === 'checkout-dropin' ? frontendMode : row.frontendMode;
  row.environment = ENVIRONMENT;
  row.status = 'blocked';
  row.evidenceClassification = 'stage-b-browser-blocked';
  row.conclusion = {
    state: 'blocked',
    summary: `Stage B ${frontendMode} browser capture blocked: ${reason}`,
    evidenceSatisfiesRequirements: false,
  };
  row.aliases = aliasesFromAliasMap(loadAliasMap());
  markFixture(row, 'metadata.json', 'blocker-record');
  markFixture(row, 'browser-result.json', 'blocker-record');
  markFixture(row, 'getPaymentStatus-response.json', 'blocker-record');
  markFixture(row, 'ct-payment-after-confirm.json', 'blocker-record');
  upsertBlocker(row, {
    id: `stage-b-${scenarioId}-${frontendMode}-browser-capture-blocked`,
    stage: STAGE,
    frontendMode,
    reason,
    recordedAt: blocker.recordedAt,
    evidenceRefs: [
      `${scenarioId}/metadata.json`,
      `${scenarioId}/browser-result.json`,
      `${scenarioId}/getPaymentStatus-response.json`,
      `${scenarioId}/ct-payment-after-confirm.json`,
    ],
  });
  if (frontendMode === 'simply-connect') {
    upsertBlocker(row, {
      id: `stage-b-${scenarioId}-web-sdk-browser-capture-blocked`,
      stage: STAGE,
      frontendMode: 'web-sdk',
      reason: `Web SDK was not exercised separately because ${reason}`,
      recordedAt: blocker.recordedAt,
      evidenceRefs: [
        `${scenarioId}/metadata.json`,
        `${scenarioId}/browser-result.json`,
        `${scenarioId}/getPaymentStatus-response.json`,
        `${scenarioId}/ct-payment-after-confirm.json`,
      ],
    });
  }
  if (frontendMode === 'simply-connect') {
    upsertFinding(findings, {
      id: `stage-b-${scenarioId}-web-sdk-not-exercised`,
      scenarioId,
      severity: 'medium',
      observed: 'No local Web SDK browser export was available during Stage B execution; Web SDK lifecycle evidence was not inferred from Simply Connect.',
      expected: 'A Web SDK browser export or an exact Web SDK blocker must be recorded for local dual-mode evidence.',
      targetPhase: 'Phase 2 Plan 02-03',
      evidenceRefs: [`${scenarioId}/metadata.json`, `${scenarioId}/browser-result.json`],
      status: 'open',
    });
  }
  updateMatrixBlocked(matrixRow, row, frontendMode, reason);
  writeJson(INDEX_PATH, index);
  writeJson(FIELD_MATRIX_PATH, matrix);
  writeJson(FINDINGS_PATH, findings);
  return { status: 'blocked', sanitizedBrowserBlocker, sanitizedStatusBlocker, sanitizedCtBlocker };
}

function captureRaw({ scenarioId, frontendMode, rawDir }) {
  const browser = parseRawJson(rawDir, [
    'browser-export.json',
    'browser-result.json',
    `${scenarioId}-${frontendMode}-browser-export.json`,
  ]);
  if (!browser) throw new Error(`missing raw browser export in ${path.relative(REPO_ROOT, rawDir)}`);
  const confirm = parseRawJson(rawDir, ['getPaymentStatus-response.json', 'processor-confirm-response.json']);
  const ct = parseRawJson(rawDir, ['ct-payment-after-confirm.json', 'ledger.json', 'ct-payment.json']);
  const index = readJson(INDEX_PATH);
  const matrix = readJson(FIELD_MATRIX_PATH);
  const row = scenarioRow(index, scenarioId);
  const matrixRow = scenarioRow(matrix, scenarioId);
  const sanitizedBrowser = writeSanitizedFixture(scenarioId, 'browser-result.json', browser.value);
  writeSanitizedFixture(scenarioId, 'metadata.json', {
    scenarioId,
    frontendMode,
    stage: STAGE,
    environment: ENVIRONMENT,
    capturedAt: nowIso(),
    rawFiles: [browser.name, confirm?.name, ct?.name].filter(Boolean),
  });
  markFixture(row, 'metadata.json', 'raw-workspace');
  markFixture(row, 'browser-result.json', 'raw-workspace');
  if (confirm) {
    const target = confirm.name === 'processor-confirm-response.json' ? 'processor-confirm-response.json' : 'getPaymentStatus-response.json';
    writeSanitizedFixture(scenarioId, target, confirm.value);
    markFixture(row, target, 'raw-workspace');
  }
  if (ct) {
    const value = ct.name === 'ledger.json' && ct.value?.payment ? ct.value.payment : ct.value;
    writeSanitizedFixture(scenarioId, 'ct-payment-after-confirm.json', value);
    markFixture(row, 'ct-payment-after-confirm.json', 'raw-workspace');
  }
  row.frontendMode = frontendMode;
  row.environment = ENVIRONMENT;
  row.status = 'pending-capture';
  row.evidenceClassification = 'stage-b-browser-captured';
  row.conclusion = {
    state: 'stage-b-captured',
    summary: `Stage B ${frontendMode} browser evidence captured locally; DMN evidence remains Stage C scope.`,
    evidenceSatisfiesRequirements: false,
  };
  row.aliases = aliasesFromAliasMap(loadAliasMap());
  updateMatrixCaptured(matrixRow, row, frontendMode);
  writeJson(INDEX_PATH, index);
  writeJson(FIELD_MATRIX_PATH, matrix);
  return { status: 'captured', sanitizedBrowser };
}

function main() {
  const rawArgs = process.argv.slice(2);
  const args = parseArgs(rawArgs);
  const scenarioId = args.scenario;
  const frontendMode = args.frontendMode;
  if (!SCENARIOS.has(scenarioId)) throw new Error(`--scenario must be one of ${Array.from(SCENARIOS).join(', ')}`);
  if (!FRONTEND_MODES.has(frontendMode)) throw new Error('--frontend-mode must be checkout-dropin, simply-connect, or web-sdk');
  const rawDir = path.resolve(REPO_ROOT, args.ingestRawDir ?? path.join(RAW_WORKSPACE, 'stage-b', scenarioId, frontendMode));
  if (!isInside(rawDir, STAGE_B_RAW_ROOT)) throw new Error(`refusing to ingest outside ${path.relative(REPO_ROOT, STAGE_B_RAW_ROOT)}: ${rawDir}`);
  const reason = args.blockerReason ?? 'No raw browser export and processor/CT confirmation snapshots were available in the Stage B raw workspace for this non-interactive execution environment.';
  let result;
  if (args.recordBlocker) result = recordBlocker({ scenarioId, frontendMode, rawDir, reason, args: rawArgs });
  else result = captureRaw({ scenarioId, frontendMode, rawDir });
  console.log(`stage B ${result.status} for ${scenarioId} (${frontendMode})`);
}

main();
