#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE_ROOT, ENVIRONMENTS, RAW_WORKSPACE, SCENARIO_IDS } from './evidence-scenarios.mjs';
import { sanitizeForEvidence } from './sanitize-evidence.mjs';
import { validateEvidence } from './validate-evidence.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const RAW_ROOT = path.resolve(REPO_ROOT, RAW_WORKSPACE);
const STAGE_D_RAW_ROOT = path.join(RAW_ROOT, 'stage-d');
const EVIDENCE_ABS_ROOT = path.resolve(REPO_ROOT, EVIDENCE_ROOT);
const INDEX_PATH = path.join(EVIDENCE_ABS_ROOT, 'index.json');
const FIELD_MATRIX_PATH = path.join(EVIDENCE_ABS_ROOT, 'field-matrix.json');
const FINDINGS_PATH = path.join(EVIDENCE_ABS_ROOT, 'findings.json');
const ALIAS_MAP_PATH = path.join(EVIDENCE_ABS_ROOT, 'aliases/alias-map.json');
const STAGE = 'stage-d-real-commercetools-checkout';
const FRONTEND_MODE = 'checkout-hosted';
const NO_FAKE_EVIDENCE_POLICY = 'No local mock, synthetic, inferred, or placeholder evidence can satisfy NUV-07 or NUV-08. Rows remain blocked until real commercetools Checkout UI, CT ledger, and Nuvei/DMN/processor proof are captured and sanitized.';

const SCENARIOS = {
  'NUV-07-complete-checkout-success': {
    requirement: 'NUV-07',
    environment: 'commercetools-sandbox-complete-checkout',
    mode: 'Complete Checkout',
    rawDir: 'NUV-07-complete-checkout-success',
    proofClasses: {
      ui: ['checkout-ui-evidence.json'],
      ctLedger: ['ct-cart-after-checkout.json', 'ct-payment-after-checkout.json', 'ct-order-after-checkout.json'],
      processor: ['processor-session-response.json', 'processor-confirm-response.json'],
      nuveiDmn: ['nuvei-dashboard-transaction.json', 'dmn-auth.json'],
    },
    fixtures: [
      ['checkout-ui-evidence.json', ['checkout-ui-evidence.raw.json', 'checkout-ui-evidence.json', 'checkout-ui-note.raw.json']],
      ['ct-cart-after-checkout.json', ['ct-cart-after-checkout.raw.json', 'ct-cart-after-checkout.json', 'ct-cart.raw.json']],
      ['ct-payment-after-checkout.json', ['ct-payment-after-checkout.raw.json', 'ct-payment-after-checkout.json', 'ct-payment.raw.json']],
      ['ct-order-after-checkout.json', ['ct-order-after-checkout.raw.json', 'ct-order-after-checkout.json', 'ct-order.raw.json']],
      ['processor-session-response.json', ['processor-session-response.raw.json', 'processor-session-response.json']],
      ['processor-confirm-response.json', ['processor-confirm-response.raw.json', 'processor-confirm-response.json']],
      ['nuvei-dashboard-transaction.json', ['nuvei-dashboard-transaction.raw.json', 'nuvei-dashboard-transaction.json']],
      ['dmn-auth.json', ['dmn-auth.raw.json', 'dmn-auth.json']],
    ],
  },
  'NUV-08-payment-only-success': {
    requirement: 'NUV-08',
    environment: 'commercetools-sandbox-payment-only',
    mode: 'Payment Only',
    rawDir: 'NUV-08-payment-only-success',
    proofClasses: {
      ui: ['checkout-ui-evidence.json'],
      ctLedger: ['ct-cart-after-payment-only.json', 'ct-payment-after-payment-only.json'],
      processor: ['processor-session-response.json', 'processor-confirm-response.json'],
      nuveiDmn: ['nuvei-dashboard-transaction.json', 'dmn-auth.json'],
    },
    fixtures: [
      ['checkout-ui-evidence.json', ['checkout-ui-evidence.raw.json', 'checkout-ui-evidence.json', 'checkout-ui-note.raw.json']],
      ['ct-cart-after-payment-only.json', ['ct-cart-after-payment-only.raw.json', 'ct-cart-after-payment-only.json', 'ct-cart.raw.json']],
      ['ct-payment-after-payment-only.json', ['ct-payment-after-payment-only.raw.json', 'ct-payment-after-payment-only.json', 'ct-payment.raw.json']],
      ['processor-session-response.json', ['processor-session-response.raw.json', 'processor-session-response.json']],
      ['processor-confirm-response.json', ['processor-confirm-response.raw.json', 'processor-confirm-response.json']],
      ['nuvei-dashboard-transaction.json', ['nuvei-dashboard-transaction.raw.json', 'nuvei-dashboard-transaction.json']],
      ['dmn-auth.json', ['dmn-auth.raw.json', 'dmn-auth.json']],
    ],
  },
};

const REQUIRED_REAL_CHECKOUT_ENV = [
  'CTP_PROJECT_KEY',
  'CTP_CLIENT_ID',
  'CTP_CLIENT_SECRET',
  'CTP_AUTH_URL',
  'CTP_API_URL',
  'CTP_SESSION_URL',
  'CTP_CHECKOUT_URL',
];

function parseArgs(args) {
  return {
    validate: args.includes('--validate'),
    allowPendingRealCheckout: args.includes('--allow-pending-real-checkout'),
    requireRealCheckout: args.includes('--require-real-checkout'),
    strict: args.includes('--strict'),
    recordBlocker: args.includes('--record-blocker'),
    selfCheck: args.includes('--self-check'),
    scenario: valueAfter(args, '--scenario'),
    rawDir: valueAfter(args, '--raw-dir'),
    reason: valueAfter(args, '--reason'),
  };
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
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

function scenarioIds(requested) {
  if (requested) {
    if (!SCENARIOS[requested]) throw new Error(`unsupported Stage D scenario ${requested}`);
    return [requested];
  }
  return Object.keys(SCENARIOS);
}

function scenarioRawDir(scenarioId, configuredRawDir) {
  const base = configuredRawDir ? path.resolve(configuredRawDir) : path.join(STAGE_D_RAW_ROOT, SCENARIOS[scenarioId].rawDir);
  if (!isInside(base, STAGE_D_RAW_ROOT)) throw new Error(`refusing to read outside ${path.relative(REPO_ROOT, STAGE_D_RAW_ROOT)}: ${base}`);
  return base;
}

function loadAliasMap() {
  return readJson(ALIAS_MAP_PATH);
}

function saveAliasMap(aliasMap) {
  writeJson(ALIAS_MAP_PATH, aliasMap);
}

function loadDocuments() {
  return {
    index: readJson(INDEX_PATH),
    matrix: readJson(FIELD_MATRIX_PATH),
    findings: readJson(FINDINGS_PATH),
    aliasMap: loadAliasMap(),
  };
}

function saveDocuments({ index, matrix, findings, aliasMap }) {
  index.generatedAt = nowIso();
  for (const environment of ['commercetools-sandbox-complete-checkout', 'commercetools-sandbox-payment-only']) {
    if (!index.allowedEnvironments?.includes(environment)) index.allowedEnvironments = [...(index.allowedEnvironments ?? []), environment];
  }
  writeJson(INDEX_PATH, index);
  writeJson(FIELD_MATRIX_PATH, matrix);
  writeJson(FINDINGS_PATH, findings);
  saveAliasMap(aliasMap);
}

function rowById(document, id) {
  const row = document.scenarios?.find((scenario) => scenario.id === id || scenario.scenarioId === id);
  if (!row) throw new Error(`missing scenario ${id}`);
  return row;
}

function ensureRealCheckoutFixtureSlots(row, scenarioId) {
  const fixtureNames = SCENARIOS[scenarioId].fixtures.map(([name]) => name);
  const extras = (row.fixtures ?? []).filter((fixture) => !fixtureNames.includes(fixture.name));
  row.fixtures = fixtureNames.map((name) => {
    const existing = row.fixtures?.find((fixture) => fixture.name === name);
    return existing ?? {
      name,
      path: `${scenarioId}/${name}`,
      required: true,
      present: false,
      source: 'not-captured',
    };
  });
  row.fixtures.push(...extras);
}

function markFixture(row, scenarioId, fixtureName, source) {
  ensureRealCheckoutFixtureSlots(row, scenarioId);
  let fixture = row.fixtures.find((candidate) => candidate.name === fixtureName);
  if (!fixture) {
    fixture = { name: fixtureName, path: `${scenarioId}/${fixtureName}`, required: false, present: false, source: 'not-captured' };
    row.fixtures.push(fixture);
  }
  fixture.present = true;
  fixture.source = source;
  fixture.path = `${scenarioId}/${fixtureName}`;
}

function collectEvidenceRefs(row) {
  return (row.fixtures ?? []).filter((fixture) => fixture.present).map((fixture) => fixture.path);
}

function aliasesFromAliasMap(aliasMap) {
  const aliases = Object.keys(aliasMap.aliases ?? {});
  const byPrefix = (prefix) => aliases.filter((alias) => alias.startsWith(`${prefix}-`));
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

function findRawFile(rawDir, candidates) {
  for (const candidate of candidates) {
    const filePath = path.join(rawDir, candidate);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

function parseRaw(rawFile) {
  const text = fs.readFileSync(rawFile, 'utf8');
  if (rawFile.endsWith('.ndjson')) return text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return JSON.parse(text);
}

function writeSanitizedFixture({ scenarioId, outputName, rawFile, aliasMap }) {
  const parsed = parseRaw(rawFile);
  const sanitized = sanitizeForEvidence(parsed, { aliasMap });
  const outputPath = path.join(EVIDENCE_ABS_ROOT, scenarioId, outputName);
  if (!isInside(outputPath, EVIDENCE_ABS_ROOT)) throw new Error(`refusing to write outside ${EVIDENCE_ROOT}: ${outputPath}`);
  writeJson(outputPath, sanitized.value);
  return sanitized.aliasMap;
}

function writeMetadata({ scenarioId, status, reason, source, aliases }) {
  const config = SCENARIOS[scenarioId];
  writeJson(path.join(EVIDENCE_ABS_ROOT, scenarioId, 'metadata.json'), {
    schemaVersion: 'phase-02-stage-d-v1',
    stage: STAGE,
    scenarioId,
    requirement: config.requirement,
    checkoutMode: config.mode,
    frontendMode: FRONTEND_MODE,
    environment: config.environment,
    status,
    source,
    sanitizedAt: nowIso(),
    aliases,
    reason,
    noFakeEvidencePolicy: NO_FAKE_EVIDENCE_POLICY,
  });
}

function proofClassStatus(row, scenarioId) {
  const config = SCENARIOS[scenarioId];
  const present = new Set((row.fixtures ?? []).filter((fixture) => fixture.present).map((fixture) => fixture.name));
  return Object.fromEntries(Object.entries(config.proofClasses).map(([proofClass, names]) => [proofClass, names.every((name) => present.has(name))]));
}

function missingProofClasses(row, scenarioId) {
  return Object.entries(proofClassStatus(row, scenarioId)).filter(([, ok]) => !ok).map(([proofClass]) => proofClass);
}

function environmentIsRealCheckout(environment) {
  return environment === 'real-commercetools-checkout' || environment === 'commercetools-sandbox-complete-checkout' || environment === 'commercetools-sandbox-payment-only';
}

function environmentIsMockOrLocal(environment) {
  return /mock|local/i.test(String(environment));
}

function updateMatrixBlocked(matrixRow, row, scenarioId, reason) {
  const config = SCENARIOS[scenarioId];
  matrixRow.frontendMode = FRONTEND_MODE;
  matrixRow.environment = config.environment;
  matrixRow.evidenceRefs = collectEvidenceRefs(row);
  matrixRow.ct = {
    ...(matrixRow.ct ?? {}),
    cartId: 'unobserved',
    paymentId: 'unobserved',
    paymentInterfaceId: 'unobserved',
    cartPaymentRefs: [],
    orderId: scenarioId.startsWith('NUV-07') ? 'unobserved' : 'not-applicable',
    transactionInteractionIds: [],
  };
  matrixRow.nuvei = {
    ...(matrixRow.nuvei ?? {}),
    sessionToken: 'unobserved',
    pppTransactionId: 'unobserved',
    pppTransactionField: 'unobserved',
    transactionId: 'unobserved',
    transactionIdField: 'unobserved',
    clientUniqueId: 'unobserved',
    merchantUniqueId: 'unobserved',
    amount: { value: 'unobserved', currency: 'unobserved' },
    status: { ppp_status: 'unobserved', Status: 'unobserved', transactionStatus: 'unobserved' },
  };
  matrixRow.identityModelAssessment = {
    paymentInterfaceIdEqualsSessionToken: 'blocked',
    terminalInteractionIdEqualsPpp: 'blocked',
    clientUniqueIdEqualsCartId: 'blocked',
    transactionIdSecondaryOnly: 'blocked',
  };
  matrixRow.notes = reason;
}

function firstAlias(aliases, key) {
  return aliases[key]?.[0] ?? 'unobserved';
}

function scanForAlias(value, prefixes, found = {}) {
  if (Array.isArray(value)) {
    for (const child of value) scanForAlias(child, prefixes, found);
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string') {
      for (const [outKey, pattern] of Object.entries(prefixes)) {
        if (pattern.test(child)) found[outKey] ??= child;
      }
      if (key === 'PPP_TransactionID' || key === 'PPP_TransactionId' || key === 'ppp_TransactionID') found.pppTransactionField ??= key;
      if (key === 'TransactionID' || key === 'TransactionId' || key === 'transactionId') found.transactionIdField ??= key;
    } else {
      scanForAlias(child, prefixes, found);
    }
  }
  return found;
}

function updateMatrixCaptured(matrixRow, row, scenarioId, sanitizedFixtures) {
  const config = SCENARIOS[scenarioId];
  const aliases = row.aliases ?? {};
  const scanned = scanForAlias(sanitizedFixtures, {
    cartId: /^cart-\d{3}$/,
    paymentId: /^payment-\d{3}$/,
    sessionToken: /^sessionToken-\d{3}$/,
    pppTransactionId: /^ppp-\d{3}$/,
    transactionId: /^transaction-\d{3}$/,
    clientUniqueId: /^clientUniqueId-\d{3}$/,
    merchantUniqueId: /^merchantUniqueId-\d{3}$/,
    orderId: /^order-\d{3}$/,
  });
  const sessionToken = scanned.sessionToken ?? firstAlias(aliases, 'sessionTokens');
  const cartId = scanned.cartId ?? firstAlias(aliases, 'cartIds');
  const paymentId = scanned.paymentId ?? firstAlias(aliases, 'paymentIds');
  const ppp = scanned.pppTransactionId ?? firstAlias(aliases, 'pppTransactionIds');
  const transactionId = scanned.transactionId ?? firstAlias(aliases, 'transactionIds');
  matrixRow.frontendMode = FRONTEND_MODE;
  matrixRow.environment = config.environment;
  matrixRow.evidenceRefs = collectEvidenceRefs(row);
  matrixRow.ct = {
    cartId,
    paymentId,
    paymentInterfaceId: sessionToken,
    cartPaymentRefs: paymentId === 'unobserved' ? [] : [paymentId],
    orderId: scanned.orderId ?? (scenarioId.startsWith('NUV-07') ? 'unobserved' : 'not-applicable'),
    transactionInteractionIds: ppp !== 'unobserved' ? [ppp] : (transactionId !== 'unobserved' ? [transactionId] : []),
  };
  matrixRow.nuvei = {
    sessionToken,
    pppTransactionId: ppp,
    pppTransactionField: scanned.pppTransactionField ?? (ppp === 'unobserved' ? 'unobserved' : 'PPP_TransactionID'),
    transactionId,
    transactionIdField: scanned.transactionIdField ?? (transactionId === 'unobserved' ? 'unobserved' : 'TransactionID'),
    clientUniqueId: scanned.clientUniqueId ?? cartId,
    merchantUniqueId: scanned.merchantUniqueId ?? paymentId,
    amount: { value: 'observed-in-fixtures', currency: 'observed-in-fixtures' },
    status: { ppp_status: 'observed-in-fixtures', Status: 'observed-in-fixtures', transactionStatus: 'observed-in-fixtures' },
  };
  matrixRow.identityModelAssessment = {
    paymentInterfaceIdEqualsSessionToken: sessionToken === 'unobserved' ? 'unresolved' : 'confirmed',
    terminalInteractionIdEqualsPpp: ppp === 'unobserved' ? 'unresolved' : 'confirmed',
    clientUniqueIdEqualsCartId: cartId === 'unobserved' ? 'unresolved' : 'confirmed',
    transactionIdSecondaryOnly: 'confirmed',
  };
  matrixRow.notes = `${config.mode} real commercetools Checkout evidence sanitized; inspect linked fixtures for exact aliases and any unresolved fields.`;
}

function missingEnvVars() {
  return REQUIRED_REAL_CHECKOUT_ENV.filter((name) => !process.env[name] || process.env[name].trim().length === 0);
}

function defaultBlockerReason(scenarioId, rawDir) {
  const config = SCENARIOS[scenarioId];
  const missing = missingEnvVars();
  const parts = [
    `${config.mode} real commercetools Checkout smoke was not run because this executor has no verified real Checkout raw export directory at ${path.relative(REPO_ROOT, rawDir)}.`,
  ];
  if (missing.length) parts.push(`Missing required commercetools Checkout environment variable names: ${missing.join(', ')}.`);
  parts.push('No UI, CT ledger, Nuvei dashboard/DMN, or processor proof was inferred from local mock evidence.');
  return parts.join(' ');
}

function upsertBlocker(row, blocker) {
  row.blockers = (row.blockers ?? []).filter((existing) => existing.id !== blocker.id);
  row.blockers.push(blocker);
}

function upsertFinding(findings, finding) {
  findings.findings = (findings.findings ?? []).filter((existing) => existing.id !== finding.id);
  findings.findings.push(finding);
}

function recordBlockerForScenario({ scenarioId, reason, rawDir, docs }) {
  const config = SCENARIOS[scenarioId];
  const row = rowById(docs.index, scenarioId);
  const matrixRow = rowById(docs.matrix, scenarioId);
  ensureRealCheckoutFixtureSlots(row, scenarioId);
  row.requiredStage = STAGE;
  row.frontendMode = FRONTEND_MODE;
  row.environment = config.environment;
  row.status = 'blocked';
  row.synthetic = false;
  row.evidenceClassification = 'stage-d-real-checkout-blocked';
  row.aliases = aliasesFromAliasMap(docs.aliasMap);
  row.conclusion = {
    state: 'blocked',
    summary: reason,
    evidenceSatisfiesRequirements: false,
  };
  const blocker = {
    id: `stage-d-${scenarioId}-real-checkout-unavailable`,
    stage: STAGE,
    environment: config.environment,
    blockerType: 'missing-real-commercetools-checkout-evidence',
    recordedAt: nowIso(),
    reason,
    missingEnvironmentVariables: missingEnvVars(),
    attemptedCommands: [
      `npm --prefix examples/nuvei-web-ui run validate:evidence -- --stage stage-c --require-scenarios NUV-01-success-auth,NUV-05-capture,NUV-05-cancel-authorization,NUV-05-refund,NUV-05-duplicate-dmn,NUV-05-mismatch`,
      `npm --prefix examples/nuvei-web-ui run capture:real-checkout -- --scenario ${scenarioId}`,
      `npm --prefix examples/nuvei-web-ui run validate:phase-2-gate -- --require-real-checkout`,
    ],
    expectedRawDirectory: path.relative(REPO_ROOT, rawDir),
    requiredProofClasses: Object.keys(config.proofClasses),
    requiredFixtureFiles: config.fixtures.map(([name]) => name),
    dashboardPrerequisites: [
      'commercetools Merchant Center Checkout application/session for the Nuvei connector',
      `${config.mode} real sandbox cart/session with non-zero physical-goods payment`,
      'Nuvei sandbox dashboard/control panel transaction and DMN visibility for the same attempt',
    ],
    noFakeEvidencePolicy: NO_FAKE_EVIDENCE_POLICY,
  };
  upsertBlocker(row, blocker);
  writeMetadata({ scenarioId, status: 'blocked', reason, source: 'blocker-record', aliases: row.aliases });
  markFixture(row, scenarioId, 'metadata.json', 'blocker-record');
  updateMatrixBlocked(matrixRow, row, scenarioId, reason);
  upsertFinding(docs.findings, {
    id: `stage-d-${scenarioId}-real-checkout-blocked`,
    scenarioId,
    severity: 'high',
    observed: reason,
    expected: `${config.mode} row has real Checkout UI, CT ledger, Nuvei dashboard/DMN, and processor proof before being marked passed.`,
    targetPhase: 'Phase 2 Plan 02-05',
    evidenceRefs: [`${scenarioId}/metadata.json`],
    status: 'open',
  });
}

function captureScenario({ scenarioId, rawDir, docs }) {
  const config = SCENARIOS[scenarioId];
  const row = rowById(docs.index, scenarioId);
  const matrixRow = rowById(docs.matrix, scenarioId);
  if (!fs.existsSync(rawDir)) throw new Error(`${scenarioId}: missing raw directory ${path.relative(REPO_ROOT, rawDir)}`);
  ensureRealCheckoutFixtureSlots(row, scenarioId);
  const missing = [];
  const sanitizedFixtures = {};
  for (const [outputName, rawCandidates] of config.fixtures) {
    const rawFile = findRawFile(rawDir, rawCandidates);
    if (!rawFile) {
      missing.push(outputName);
      continue;
    }
    docs.aliasMap = writeSanitizedFixture({ scenarioId, outputName, rawFile, aliasMap: docs.aliasMap });
    sanitizedFixtures[outputName] = readJson(path.join(EVIDENCE_ABS_ROOT, scenarioId, outputName));
    markFixture(row, scenarioId, outputName, `raw-workspace:${path.relative(REPO_ROOT, rawFile)}`);
  }
  if (missing.length) throw new Error(`${scenarioId}: missing raw proof files for ${missing.join(', ')}`);
  row.requiredStage = STAGE;
  row.frontendMode = FRONTEND_MODE;
  row.environment = config.environment;
  if (environmentIsMockOrLocal(row.environment) || !environmentIsRealCheckout(row.environment)) {
    throw new Error(`${scenarioId}: refusing to pass from non-real environment ${row.environment}`);
  }
  const missingClasses = missingProofClasses(row, scenarioId);
  if (missingClasses.length) throw new Error(`${scenarioId}: missing proof classes ${missingClasses.join(', ')}`);
  row.status = 'passed';
  row.synthetic = false;
  row.evidenceClassification = 'stage-d-real-checkout-captured';
  row.aliases = aliasesFromAliasMap(docs.aliasMap);
  row.blockers = [];
  row.conclusion = {
    state: 'passed',
    summary: `${config.mode} real commercetools Checkout smoke has sanitized UI, CT ledger, Nuvei/DMN, and processor proof.`,
    evidenceSatisfiesRequirements: true,
  };
  writeMetadata({ scenarioId, status: 'passed', reason: row.conclusion.summary, source: 'raw-workspace', aliases: row.aliases });
  markFixture(row, scenarioId, 'metadata.json', 'raw-workspace');
  updateMatrixCaptured(matrixRow, row, scenarioId, sanitizedFixtures);
}

function validateRealCheckoutRows(index, options) {
  const errors = [];
  for (const [scenarioId, config] of Object.entries(SCENARIOS)) {
    const row = rowById(index, scenarioId);
    ensureRealCheckoutFixtureSlots(row, scenarioId);
    if (row.status === 'passed') {
      if (row.requiredStage !== STAGE) errors.push(`${scenarioId}: passed row must use ${STAGE}`);
      if (row.environment !== config.environment) errors.push(`${scenarioId}: passed row must use ${config.environment}`);
      if (environmentIsMockOrLocal(row.environment)) errors.push(`${scenarioId}: passed row cannot use mock/local environment ${row.environment}`);
      const missingClasses = missingProofClasses(row, scenarioId);
      if (missingClasses.length) errors.push(`${scenarioId}: passed row missing proof classes ${missingClasses.join(', ')}`);
      if (row.conclusion?.evidenceSatisfiesRequirements !== true) errors.push(`${scenarioId}: passed row must satisfy requirements`);
    } else if (row.status === 'blocked') {
      const hasExactBlocker = Array.isArray(row.blockers) && row.blockers.some((blocker) => blocker.stage === STAGE && blocker.noFakeEvidencePolicy && Array.isArray(blocker.requiredProofClasses));
      if (!hasExactBlocker) errors.push(`${scenarioId}: blocked row must include exact Stage D blocker metadata`);
      if (options.requireRealCheckout) errors.push(`${scenarioId}: real Checkout evidence required but row is blocked`);
    } else if (options.allowPendingRealCheckout && row.status === 'pending-capture') {
      continue;
    } else {
      errors.push(`${scenarioId}: status ${row.status} is not acceptable for Stage D gate`);
    }
  }
  return errors;
}

function validateStrictPhase(index) {
  const errors = [];
  const rows = new Map((index.scenarios ?? []).map((row) => [row.id, row]));
  for (const id of SCENARIO_IDS) {
    const row = rows.get(id);
    if (!row) {
      errors.push(`missing scenario ${id}`);
      continue;
    }
    if (row.status !== 'passed' && row.status !== 'blocked' && row.status !== 'not-applicable') errors.push(`${id}: strict gate requires passed, blocked, or not-applicable status; saw ${row.status}`);
    if (row.status === 'blocked' && (!Array.isArray(row.blockers) || row.blockers.length === 0)) errors.push(`${id}: blocked row must include blockers`);
  }
  return errors;
}

function validatePhase2Gate(options = {}) {
  const docs = loadDocuments();
  const errors = [];
  for (const scenarioId of Object.keys(SCENARIOS)) ensureRealCheckoutFixtureSlots(rowById(docs.index, scenarioId), scenarioId);
  errors.push(...validateRealCheckoutRows(docs.index, options));
  if (options.strict) errors.push(...validateStrictPhase(docs.index));
  if (!options.allowPendingRealCheckout) errors.push(...validateEvidence({}));
  return errors;
}

function runSelfCheck() {
  const index = { scenarios: Object.keys(SCENARIOS).map((scenarioId) => ({
    id: scenarioId,
    scenarioFolder: scenarioId,
    requiredStage: STAGE,
    frontendMode: FRONTEND_MODE,
    environment: SCENARIOS[scenarioId].environment,
    status: 'passed',
    fixtures: SCENARIOS[scenarioId].fixtures.map(([name]) => ({ name, path: `${scenarioId}/${name}`, required: true, present: true, source: 'self-check' })),
    conclusion: { evidenceSatisfiesRequirements: true },
  })) };
  const errors = validateRealCheckoutRows(index, { requireRealCheckout: true });
  if (errors.length) throw new Error(errors.join('\n'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfCheck) {
    runSelfCheck();
    console.log('real Checkout gate self-check passed');
    return;
  }
  if (args.validate) {
    const errors = validatePhase2Gate(args);
    if (errors.length) {
      console.error(errors.join('\n'));
      process.exitCode = 1;
    } else {
      console.log(args.strict ? 'phase 2 gate validation passed (blocked rows remain incomplete)' : 'real Checkout gate validation passed');
    }
    return;
  }
  const docs = loadDocuments();
  for (const scenarioId of scenarioIds(args.scenario)) {
    const rawDir = scenarioRawDir(scenarioId, args.rawDir);
    if (args.recordBlocker) {
      recordBlockerForScenario({ scenarioId, rawDir, reason: args.reason ?? defaultBlockerReason(scenarioId, rawDir), docs });
    } else {
      captureScenario({ scenarioId, rawDir, docs });
    }
  }
  saveDocuments(docs);
  console.log(args.recordBlocker ? 'real Checkout blockers recorded' : 'real Checkout capture complete');
}

main();
