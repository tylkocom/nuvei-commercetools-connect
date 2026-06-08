#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE_ROOT, RAW_WORKSPACE } from './evidence-scenarios.mjs';
import { sanitizeForEvidence } from './sanitize-evidence.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const RAW_ROOT = path.resolve(REPO_ROOT, RAW_WORKSPACE);
const STAGE_C_RAW_ROOT = path.join(RAW_ROOT, 'stage-c');
const RAW_DMN_ROOT = path.join(STAGE_C_RAW_ROOT, 'dmn');
const EVIDENCE_ABS_ROOT = path.resolve(REPO_ROOT, EVIDENCE_ROOT);
const INDEX_PATH = path.join(EVIDENCE_ABS_ROOT, 'index.json');
const FIELD_MATRIX_PATH = path.join(EVIDENCE_ABS_ROOT, 'field-matrix.json');
const FINDINGS_PATH = path.join(EVIDENCE_ABS_ROOT, 'findings.json');
const ALIAS_MAP_PATH = path.join(EVIDENCE_ABS_ROOT, 'aliases/alias-map.json');
const STAGE = 'stage-c-local-browser-processor-dmn';
const ENVIRONMENT = 'nuvei-sandbox-local-mock-ct';
const DEFAULT_FRONTEND_MODE = 'simply-connect';
const SYNTHETIC_DERIVED = 'synthetic-derived-from-real-dmn';

const STAGE_C_SCENARIOS = [
  'NUV-01-success-auth',
  'NUV-02-decline-auth',
  'NUV-03-3ds-frictionless',
  'NUV-04-3ds-stepup-success',
  'NUV-04-3ds-stepup-failure-or-abandonment',
  'NUV-05-capture',
  'NUV-05-cancel-authorization',
  'NUV-05-refund',
  'NUV-05-duplicate-dmn',
  'NUV-05-mismatch',
];

const REQUIRED_VALIDATION_SCENARIOS = [
  'NUV-01-success-auth',
  'NUV-05-capture',
  'NUV-05-cancel-authorization',
  'NUV-05-refund',
  'NUV-05-duplicate-dmn',
  'NUV-05-mismatch',
];

const BLOCKER_FIXTURES = {
  'NUV-01-success-auth': ['dmn-auth.json', 'ct-payment-after-dmn.json'],
  'NUV-02-decline-auth': ['dmn-decline.json'],
  'NUV-03-3ds-frictionless': ['dmn-3ds-frictionless.json', 'ct-payment-after-dmn.json'],
  'NUV-04-3ds-stepup-success': ['dmn-3ds-stepup-success.json', 'ct-payment-after-dmn.json'],
  'NUV-04-3ds-stepup-failure-or-abandonment': ['dmn-3ds-stepup-failure.json', 'ct-payment-after-dmn.json'],
  'NUV-05-capture': ['payment-intent-capture-request.json', 'payment-intent-capture-response.json', 'nuvei-settle-response.json', 'dmn-capture.json', 'ct-payment-after-capture.json'],
  'NUV-05-cancel-authorization': ['payment-intent-cancel-request.json', 'payment-intent-cancel-response.json', 'nuvei-void-response.json', 'dmn-cancel.json', 'ct-payment-after-cancel.json'],
  'NUV-05-refund': ['payment-intent-refund-request.json', 'payment-intent-refund-response.json', 'nuvei-refund-response.json', 'dmn-refund.json', 'ct-payment-after-refund.json'],
  'NUV-05-duplicate-dmn': ['dmn-original.json', 'dmn-replay.json', 'processor-duplicate-response.json', 'ct-payment-after-duplicate.json'],
  'NUV-05-mismatch': ['dmn-mismatch-request.json', 'processor-mismatch-response.json', 'ct-payment-after-mismatch.json'],
};

const DMN_FIXTURE_BY_SCENARIO = {
  'NUV-01-success-auth': 'dmn-auth.json',
  'NUV-02-decline-auth': 'dmn-decline.json',
  'NUV-03-3ds-frictionless': 'dmn-3ds-frictionless.json',
  'NUV-04-3ds-stepup-success': 'dmn-3ds-stepup-success.json',
  'NUV-04-3ds-stepup-failure-or-abandonment': 'dmn-3ds-stepup-failure.json',
};

function parseArgs(args) {
  return {
    scenario: valueAfter(args, '--scenario'),
    frontendMode: valueAfter(args, '--frontend-mode') ?? DEFAULT_FRONTEND_MODE,
    ingestDmnDir: valueAfter(args, '--ingest-dmn-dir'),
    recordBlocker: args.includes('--record-blocker'),
    blockerReason: valueAfter(args, '--blocker-reason'),
    requireRealDmn: args.includes('--require-real-dmn'),
    selfCheck: args.includes('--self-check'),
  };
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertInsideRaw(rawDir) {
  const resolved = path.resolve(rawDir);
  if (!isInside(resolved, STAGE_C_RAW_ROOT)) throw new Error(`refusing to ingest outside ${path.relative(REPO_ROOT, STAGE_C_RAW_ROOT)}: ${resolved}`);
  return resolved;
}

function scenarioRow(document, id) {
  const row = (document.scenarios ?? []).find((scenario) => scenario.id === id || scenario.scenarioId === id);
  if (!row) throw new Error(`missing scenario ${id}`);
  return row;
}

function loadAliasMap() {
  return readJson(ALIAS_MAP_PATH);
}

function saveAliasMap(aliasMap) {
  writeJson(ALIAS_MAP_PATH, aliasMap);
}

function aliasesFromAliasMap(aliasMap) {
  const aliases = Object.keys(aliasMap.aliases ?? {});
  return {
    cartIds: aliases.filter((alias) => alias.startsWith('cart-')),
    paymentIds: aliases.filter((alias) => alias.startsWith('payment-')),
    sessionTokens: aliases.filter((alias) => alias.startsWith('sessionToken-')),
    pppTransactionIds: aliases.filter((alias) => alias.startsWith('ppp-')),
    transactionIds: aliases.filter((alias) => alias.startsWith('transaction-')),
    clientUniqueIds: aliases.filter((alias) => alias.startsWith('clientUniqueId-')),
    merchantUniqueIds: aliases.filter((alias) => alias.startsWith('merchantUniqueId-')),
  };
}

function sanitizeValue(value) {
  const aliasMap = loadAliasMap();
  const result = sanitizeForEvidence(value, { aliasMap });
  saveAliasMap(result.aliasMap);
  return result.value;
}

function writeSanitizedFixture(scenarioId, fixtureName, value) {
  const sanitized = sanitizeValue(value);
  const target = path.join(EVIDENCE_ABS_ROOT, scenarioId, fixtureName);
  if (!isInside(target, EVIDENCE_ABS_ROOT)) throw new Error(`refusing to write outside evidence root: ${target}`);
  writeJson(target, sanitized);
  return `${scenarioId}/${fixtureName}`;
}

function ensureFixtureSlot(row, fixtureName) {
  let slot = (row.fixtures ?? []).find((fixture) => fixture.name === fixtureName);
  if (!slot) {
    slot = {
      name: fixtureName,
      path: `${row.id}/${fixtureName}`,
      required: false,
      present: false,
      source: 'not-captured',
    };
    row.fixtures = row.fixtures ?? [];
    row.fixtures.push(slot);
  }
  return slot;
}

function markFixture(row, fixtureName, source) {
  const slot = ensureFixtureSlot(row, fixtureName);
  slot.present = true;
  slot.source = source;
}

function collectEvidenceRefs(row) {
  return (row.fixtures ?? []).filter((fixture) => fixture.present).map((fixture) => fixture.path);
}

function upsertBlocker(row, blocker) {
  row.blockers = (row.blockers ?? []).filter((existing) => existing.id !== blocker.id);
  row.blockers.push(blocker);
}

function upsertFinding(findings, finding) {
  findings.findings = (findings.findings ?? []).filter((existing) => existing.id !== finding.id);
  findings.findings.push(finding);
}

function stageCReason(defaultReason) {
  return defaultReason ?? 'Nuvei dashboard/control panel access and live browser/DMN delivery were unavailable in this non-interactive execution environment; no real Stage C DMN observer payload exists under the raw workspace, so real DMN, duplicate, operation, and mismatch evidence is not inferred or faked.';
}

function blockerPayload({ scenarioId, reason, synthetic = false }) {
  return {
    schemaVersion: 'phase-02-stage-c-blocker-v1',
    stage: STAGE,
    scenarioId,
    frontendMode: scenarioId.startsWith('NUV-05-') ? 'not-captured' : DEFAULT_FRONTEND_MODE,
    environment: ENVIRONMENT,
    status: 'blocked',
    evidenceClassification: synthetic ? 'stage-c-synthetic-blocked' : 'stage-c-blocked',
    syntheticLabel: synthetic ? SYNTHETIC_DERIVED : 'not-synthetic',
    recordedAt: nowIso(),
    reason,
    attemptedCommands: [
      'npm --prefix examples/nuvei-web-ui run capture:dmn-proxy',
      'TUNNEL_PROVIDER=ngrok npm --prefix examples/nuvei-web-ui run tunnel:dmn',
      'npm --prefix examples/nuvei-web-ui run capture:stage-c -- --require-real-dmn',
    ],
    attemptedDashboardPath: 'Nuvei Dashboard > Settings > My Integration Settings > DMN URL',
    attemptedPublicDmnUrlShape: 'https://<ngrok-public-host>/webhooks/nuvei',
    expectedRawDmnDir: path.relative(REPO_ROOT, RAW_DMN_ROOT),
    missingPrerequisite: 'Nuvei sandbox dashboard permission plus live browser payment attempt that emits a real DMN to the current tunnel URL',
    noFakeEvidencePolicy: 'No real Nuvei DMN, operation response, duplicate replay, or mismatch result is fabricated. Synthetic mismatch evidence is only allowed when derived from a real raw DMN; none was available for this blocker row.',
  };
}

function writeDashboardAttemptRaw(reason) {
  const attemptPath = path.join(STAGE_C_RAW_ROOT, 'dmn-dashboard-attempt.json');
  fs.mkdirSync(path.dirname(attemptPath), { recursive: true });
  fs.writeFileSync(attemptPath, `${JSON.stringify({
    schemaVersion: 'phase-02-stage-c-dashboard-attempt-raw-v1',
    attemptedAt: nowIso(),
    dashboardPath: 'Nuvei Dashboard > Settings > My Integration Settings > DMN URL',
    attemptedPublicDmnUrlShape: 'https://<ngrok-public-host>/webhooks/nuvei',
    observerPort: process.env.DMN_OBSERVER_PORT ?? '8090',
    processorUrl: process.env.PROCESSOR_URL ?? 'http://localhost:8080',
    outcome: 'blocked',
    reason,
  }, null, 2)}\n`);
}

function updateMatrixBlocked(matrixRow, row, reason) {
  matrixRow.frontendMode = row.frontendMode;
  matrixRow.environment = ENVIRONMENT;
  matrixRow.evidenceRefs = collectEvidenceRefs(row);
  matrixRow.identityModelAssessment = {
    paymentInterfaceIdEqualsSessionToken: 'blocked',
    terminalInteractionIdEqualsPpp: 'blocked',
    clientUniqueIdEqualsCartId: 'blocked',
    transactionIdSecondaryOnly: 'blocked',
  };
  matrixRow.notes = `Stage C DMN/operation capture blocked: ${reason}`;
}

function recordBlockerForScenario({ scenarioId, reason }) {
  const index = readJson(INDEX_PATH);
  const matrix = readJson(FIELD_MATRIX_PATH);
  const findings = readJson(FINDINGS_PATH);
  const row = scenarioRow(index, scenarioId);
  const matrixRow = scenarioRow(matrix, scenarioId);
  const isSyntheticOnly = scenarioId === 'NUV-05-mismatch';
  const payload = blockerPayload({ scenarioId, reason, synthetic: isSyntheticOnly });

  const evidenceRefs = [];
  markFixture(row, 'metadata.json', 'blocker-record');
  evidenceRefs.push(writeSanitizedFixture(scenarioId, 'metadata.json', payload));
  for (const fixtureName of BLOCKER_FIXTURES[scenarioId] ?? []) {
    markFixture(row, fixtureName, 'blocker-record');
    evidenceRefs.push(writeSanitizedFixture(scenarioId, fixtureName, payload));
  }

  row.frontendMode = scenarioId.startsWith('NUV-05-') ? 'not-captured' : DEFAULT_FRONTEND_MODE;
  row.environment = ENVIRONMENT;
  row.status = 'blocked';
  row.synthetic = isSyntheticOnly ? false : row.synthetic;
  row.evidenceClassification = 'stage-c-blocked';
  row.conclusion = {
    state: 'blocked',
    summary: `Stage C ${scenarioId} capture blocked: ${reason}`,
    evidenceSatisfiesRequirements: false,
  };
  row.aliases = aliasesFromAliasMap(loadAliasMap());
  upsertBlocker(row, {
    id: `stage-c-${scenarioId}-dmn-operation-capture-blocked`,
    stage: STAGE,
    frontendMode: row.frontendMode,
    reason,
    recordedAt: payload.recordedAt,
    evidenceRefs,
  });
  upsertFinding(findings, {
    id: `stage-c-${scenarioId}-capture-blocked`,
    scenarioId,
    severity: 'high',
    observed: `Stage C could not capture real DMN/operation evidence: ${reason}`,
    expected: 'A real Nuvei sandbox DMN reaches the local observer through the tunnel, then operation, duplicate, and mismatch evidence is derived from real raw material or blocked precisely.',
    targetPhase: 'Phase 2 Plan 02-04',
    evidenceRefs,
    status: 'open',
  });
  updateMatrixBlocked(matrixRow, row, reason);
  writeJson(INDEX_PATH, index);
  writeJson(FIELD_MATRIX_PATH, matrix);
  writeJson(FINDINGS_PATH, findings);
  return { scenarioId, status: 'blocked', evidenceRefs };
}

function collectFiles(root) {
  if (!fs.existsSync(root)) return [];
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...collectFiles(fullPath));
    else output.push(fullPath);
  }
  return output;
}

function parseRawDmnFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const trimmed = content.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  if (trimmed.includes('=') && !trimmed.includes('\n')) return Object.fromEntries(new URLSearchParams(trimmed));
  return { rawDmnBody: content };
}

function firstRealRawDmn(rawDir) {
  const files = collectFiles(rawDir)
    .filter((file) => !file.includes(`${path.sep}self-check${path.sep}`))
    .filter((file) => /request\.(body|json|form|txt)$/.test(file));
  for (const file of files) {
    const value = parseRawDmnFile(file);
    if (value) return { file, value };
  }
  return undefined;
}

function updateMatrixCaptured(matrixRow, row, sanitizedDmn, sourceFile) {
  const aliases = row.aliases ?? aliasesFromAliasMap(loadAliasMap());
  matrixRow.frontendMode = row.frontendMode;
  matrixRow.environment = ENVIRONMENT;
  matrixRow.evidenceRefs = collectEvidenceRefs(row);
  matrixRow.ct.cartId = aliases.cartIds?.[0] ?? matrixRow.ct.cartId ?? 'unobserved';
  matrixRow.ct.paymentId = aliases.paymentIds?.[0] ?? matrixRow.ct.paymentId ?? 'unobserved';
  matrixRow.ct.paymentInterfaceId = aliases.sessionTokens?.[0] ?? matrixRow.ct.paymentInterfaceId ?? 'unobserved';
  matrixRow.nuvei.sessionToken = sanitizedDmn.sessionToken ?? matrixRow.nuvei.sessionToken ?? 'unobserved';
  matrixRow.nuvei.pppTransactionId = sanitizedDmn.PPP_TransactionID ?? sanitizedDmn.PPP_TransactionId ?? sanitizedDmn.ppp_TransactionID ?? matrixRow.nuvei.pppTransactionId ?? 'unobserved';
  matrixRow.nuvei.transactionId = sanitizedDmn.TransactionID ?? sanitizedDmn.TransactionId ?? sanitizedDmn.transactionId ?? matrixRow.nuvei.transactionId ?? 'unobserved';
  matrixRow.nuvei.clientUniqueId = sanitizedDmn.clientUniqueId ?? matrixRow.nuvei.clientUniqueId ?? 'unobserved';
  matrixRow.nuvei.merchantUniqueId = sanitizedDmn.merchant_unique_id ?? matrixRow.nuvei.merchantUniqueId ?? 'unobserved';
  matrixRow.nuvei.amount = {
    value: sanitizedDmn.totalAmount ?? matrixRow.nuvei.amount?.value ?? 'unobserved',
    currency: sanitizedDmn.currency ?? matrixRow.nuvei.amount?.currency ?? 'unobserved',
  };
  matrixRow.nuvei.status = {
    ppp_status: sanitizedDmn.ppp_status ?? matrixRow.nuvei.status?.ppp_status ?? 'unobserved',
    Status: sanitizedDmn.Status ?? matrixRow.nuvei.status?.Status ?? 'unobserved',
    transactionStatus: sanitizedDmn.transactionStatus ?? matrixRow.nuvei.status?.transactionStatus ?? 'unobserved',
  };
  matrixRow.identityModelAssessment.paymentInterfaceIdEqualsSessionToken = matrixRow.nuvei.sessionToken !== 'unobserved' ? 'confirmed' : 'unresolved';
  matrixRow.identityModelAssessment.terminalInteractionIdEqualsPpp = matrixRow.nuvei.pppTransactionId !== 'unobserved' ? 'confirmed' : 'unresolved';
  matrixRow.identityModelAssessment.clientUniqueIdEqualsCartId = matrixRow.nuvei.clientUniqueId !== 'unobserved' ? 'confirmed' : 'unresolved';
  matrixRow.identityModelAssessment.transactionIdSecondaryOnly = matrixRow.nuvei.transactionId !== 'unobserved' ? 'confirmed' : 'unresolved';
  matrixRow.notes = `Stage C real raw DMN ingested from ${path.relative(REPO_ROOT, sourceFile)}; operation/duplicate/mismatch capture still requires matching processor and CT snapshots.`;
}

function captureDmnForScenario({ scenarioId, rawDir, frontendMode }) {
  if (!DMN_FIXTURE_BY_SCENARIO[scenarioId]) throw new Error(`raw DMN ingest supports NUV-01..NUV-04 scenarios only, got ${scenarioId}`);
  const rawDmn = firstRealRawDmn(rawDir);
  if (!rawDmn) throw new Error(`no real raw DMN request body found under ${path.relative(REPO_ROOT, rawDir)}`);
  const index = readJson(INDEX_PATH);
  const matrix = readJson(FIELD_MATRIX_PATH);
  const row = scenarioRow(index, scenarioId);
  const matrixRow = scenarioRow(matrix, scenarioId);
  const fixtureName = DMN_FIXTURE_BY_SCENARIO[scenarioId];
  const evidenceRef = writeSanitizedFixture(scenarioId, fixtureName, {
    schemaVersion: 'phase-02-stage-c-real-dmn-v1',
    stage: STAGE,
    scenarioId,
    frontendMode,
    environment: ENVIRONMENT,
    sourceRawFile: path.relative(REPO_ROOT, rawDmn.file),
    dmn: rawDmn.value,
  });
  markFixture(row, fixtureName, 'raw-workspace');
  row.frontendMode = frontendMode;
  row.environment = ENVIRONMENT;
  row.status = 'pending-capture';
  row.evidenceClassification = 'stage-c-dmn-captured';
  row.conclusion = {
    state: 'stage-c-dmn-captured',
    summary: `Stage C real DMN captured for ${scenarioId}; remaining CT/operation fixture slots still govern requirement completion.`,
    evidenceSatisfiesRequirements: false,
  };
  row.aliases = aliasesFromAliasMap(loadAliasMap());
  updateMatrixCaptured(matrixRow, row, sanitizeValue(rawDmn.value), rawDmn.file);
  writeJson(INDEX_PATH, index);
  writeJson(FIELD_MATRIX_PATH, matrix);
  return { scenarioId, status: 'captured', evidenceRef };
}

async function runSelfCheck() {
  const source = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  for (const token of ['--record-blocker', SYNTHETIC_DERIVED, 'NUV-05-duplicate-dmn', 'NUV-05-mismatch']) {
    if (!source.includes(token)) throw new Error(`missing ${token}`);
  }
  console.log('stage C capture self-check passed');
}

function main() {
  const rawArgs = process.argv.slice(2);
  const args = parseArgs(rawArgs);
  if (args.selfCheck) return runSelfCheck();
  const rawDir = assertInsideRaw(args.ingestDmnDir ?? RAW_DMN_ROOT);
  const reason = stageCReason(args.blockerReason);

  if (args.recordBlocker) {
    writeDashboardAttemptRaw(reason);
    const scenarios = args.scenario ? [args.scenario] : STAGE_C_SCENARIOS;
    const results = scenarios.map((scenarioId) => recordBlockerForScenario({ scenarioId, reason }));
    console.log(`stage C blockers recorded for ${results.map((result) => result.scenarioId).join(', ')}`);
    return;
  }

  const scenarioId = args.scenario ?? 'NUV-01-success-auth';
  if (!STAGE_C_SCENARIOS.includes(scenarioId)) throw new Error(`--scenario must be one of ${STAGE_C_SCENARIOS.join(', ')}`);
  if (args.requireRealDmn && !firstRealRawDmn(rawDir)) {
    throw new Error(`--require-real-dmn set but no real raw DMN exists under ${path.relative(REPO_ROOT, rawDir)}; run --record-blocker with the exact missing dashboard/browser prerequisite instead`);
  }
  const result = captureDmnForScenario({ scenarioId, rawDir, frontendMode: args.frontendMode });
  if (args.requireRealDmn && !REQUIRED_VALIDATION_SCENARIOS.includes(scenarioId)) {
    throw new Error(`--require-real-dmn must be followed by operation/duplicate/mismatch capture or blocker rows for ${REQUIRED_VALIDATION_SCENARIOS.join(', ')}`);
  }
  console.log(`stage C ${result.status} for ${scenarioId}`);
}

main();
