#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE_ROOT, RAW_WORKSPACE } from './evidence-scenarios.mjs';
import { sanitizeFile } from './sanitize-evidence.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const RAW_ROOT = path.resolve(REPO_ROOT, RAW_WORKSPACE);
const EVIDENCE_ABS_ROOT = path.resolve(REPO_ROOT, EVIDENCE_ROOT);
const INDEX_PATH = path.join(EVIDENCE_ABS_ROOT, 'index.json');
const FIELD_MATRIX_PATH = path.join(EVIDENCE_ABS_ROOT, 'field-matrix.json');
const FINDINGS_PATH = path.join(EVIDENCE_ABS_ROOT, 'findings.json');
const ALIAS_MAP_PATH = path.join(EVIDENCE_ABS_ROOT, 'aliases/alias-map.json');

const STAGE = 'stage-a-local-processor-mock-ct';
const DEFAULT_SCENARIO = 'NUV-01-success-auth';
const STAGE_A_OPERATION_SCENARIOS = [
  'NUV-05-capture',
  'NUV-05-cancel-authorization',
  'NUV-05-refund',
];
const REQUIRED_REAL_ENV = [
  'PROCESSOR_URL',
  'MOCK_CT_URL',
  'NUVEI_MERCHANT_ID',
  'NUVEI_MERCHANT_SITE_ID',
  'NUVEI_SECRET_KEY',
  'NUVEI_API_BASE_URL',
];
const PLAN_01_ARTIFACTS = [
  INDEX_PATH,
  FIELD_MATRIX_PATH,
  FINDINGS_PATH,
  ALIAS_MAP_PATH,
  path.join(EVIDENCE_ABS_ROOT, 'schema/evidence-index.schema.json'),
  path.join(EVIDENCE_ABS_ROOT, 'schema/field-matrix.schema.json'),
  path.join(EVIDENCE_ABS_ROOT, 'schema/findings.schema.json'),
  path.join(EVIDENCE_ABS_ROOT, 'schema/fixture-metadata.schema.json'),
];

function parseArgs(args) {
  const parsed = {
    scenario: DEFAULT_SCENARIO,
    requireRealNuvei: false,
    recordBlocker: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--scenario') parsed.scenario = args[++index];
    else if (arg === '--require-real-nuvei') parsed.requireRealNuvei = true;
    else if (arg === '--record-blocker') parsed.recordBlocker = true;
  }
  return parsed;
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

function requirePlan01Artifacts() {
  const missing = PLAN_01_ARTIFACTS.filter((filePath) => !fs.existsSync(filePath));
  if (missing.length > 0) {
    throw new Error(`Plan 01 evidence artifacts are missing: ${missing.map((filePath) => path.relative(REPO_ROOT, filePath)).join(', ')}`);
  }
}

function missingRequiredEnv() {
  return REQUIRED_REAL_ENV.filter((name) => !process.env[name] || process.env[name].trim().length === 0);
}

function nowIso() {
  return new Date().toISOString();
}

function commandAttempt(args) {
  return `npm --prefix examples/nuvei-web-ui run capture:stage-a -- ${args.join(' ')}`;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
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
  if (!response.ok) {
    const error = new Error(`${options.method ?? 'GET'} ${url} returned ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function rawPathFor(relativePath) {
  const rawPath = path.resolve(RAW_ROOT, relativePath);
  if (!isInside(rawPath, RAW_ROOT)) {
    throw new Error(`refusing to write raw evidence outside ${RAW_WORKSPACE}: ${relativePath}`);
  }
  return rawPath;
}

function evidencePathFor(relativePath) {
  const evidencePath = path.resolve(EVIDENCE_ABS_ROOT, relativePath);
  if (!isInside(evidencePath, EVIDENCE_ABS_ROOT)) {
    throw new Error(`refusing to write evidence outside ${EVIDENCE_ROOT}: ${relativePath}`);
  }
  return evidencePath;
}

function writeRawAndSanitize(relativePath, value) {
  const rawPath = rawPathFor(relativePath);
  fs.mkdirSync(path.dirname(rawPath), { recursive: true });
  fs.writeFileSync(rawPath, `${JSON.stringify(value, null, 2)}\n`);
  sanitizeFile(rawPath, {
    rawRoot: RAW_ROOT,
    evidenceRoot: EVIDENCE_ABS_ROOT,
    aliasMapPath: ALIAS_MAP_PATH,
  });
  return readJson(evidencePathFor(relativePath));
}

function rowById(document, id) {
  const row = document.scenarios.find((scenario) => scenario.id === id || scenario.scenarioId === id);
  if (!row) throw new Error(`missing scenario row ${id}`);
  return row;
}

function upsertFixture(row, name, source = 'raw-workspace') {
  const pathValue = `${row.id}/${name}`;
  let fixture = row.fixtures.find((candidate) => candidate.name === name);
  if (!fixture) {
    fixture = { name, path: pathValue, required: false };
    row.fixtures.push(fixture);
  }
  fixture.path = pathValue;
  fixture.present = true;
  fixture.source = source;
}

function setConclusion(row, state, summary) {
  row.conclusion = {
    state,
    summary,
    evidenceSatisfiesRequirements: false,
  };
}

function recordStageABlocker({ scenarioId, blocker, index, matrix }) {
  const row = rowById(index, scenarioId);
  row.frontendMode = 'not-captured';
  row.environment = 'local-mock-ct';
  row.status = 'blocked';
  row.synthetic = false;
  row.evidenceClassification = 'stage-a-blocked-missing-nuvei-config';
  setConclusion(row, 'blocked', blocker.message);
  row.blockers = [blocker, ...(row.blockers ?? []).filter((existing) => existing.id !== blocker.id)];

  const matrixRow = rowById(matrix, scenarioId);
  matrixRow.frontendMode = 'not-captured';
  matrixRow.environment = 'local-mock-ct';
  matrixRow.evidenceRefs = [];
  matrixRow.ct = {
    cartId: 'unobserved',
    paymentId: 'unobserved',
    paymentInterfaceId: 'unobserved',
    cartPaymentRefs: [],
    orderId: 'unobserved',
    transactionInteractionIds: [],
  };
  matrixRow.nuvei = {
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
  matrixRow.notes = blocker.message;
}

function recordMissingConfigurationBlockers({ scenario, args, missing }) {
  const index = readJson(INDEX_PATH);
  const matrix = readJson(FIELD_MATRIX_PATH);
  const timestamp = nowIso();
  const blocker = {
    id: `${scenario}-stage-a-missing-config-${timestamp.replace(/[:.]/g, '-')}`,
    stage: STAGE,
    environment: 'local-mock-ct',
    recordedAt: timestamp,
    commandAttempted: commandAttempt(args),
    processorUrl: process.env.PROCESSOR_URL ?? 'missing',
    mockCtUrl: process.env.MOCK_CT_URL ?? 'missing',
    missingEnv: missing,
    requiredConfigNames: REQUIRED_REAL_ENV,
    message: `Stage A real Nuvei openOrder capture blocked; missing required configuration: ${missing.join(', ')}`,
    requiredAction: 'Provide Nuvei sandbox server credentials plus PROCESSOR_URL and MOCK_CT_URL, start the processor with CT URLs pointed at the mock CT ledger, then rerun capture:stage-a without --record-blocker.',
  };

  recordStageABlocker({ scenarioId: scenario, blocker, index, matrix });
  for (const scenarioId of STAGE_A_OPERATION_SCENARIOS) {
    recordStageABlocker({
      scenarioId,
      blocker: {
        ...blocker,
        id: `${scenarioId}-stage-a-missing-config-${timestamp.replace(/[:.]/g, '-')}`,
        message: `Stage A ${scenarioId} operation prerequisite probe blocked; missing required Nuvei/processor configuration: ${missing.join(', ')}`,
      },
      index,
      matrix,
    });
  }

  index.generatedAt = timestamp;
  writeJson(INDEX_PATH, index);
  writeJson(FIELD_MATRIX_PATH, matrix);
  writeJson(path.join(EVIDENCE_ABS_ROOT, scenario, 'metadata.json'), {
    scenarioId: scenario,
    fixtureName: 'stage-a-blocker',
    source: 'manual-note',
    sanitizedAt: timestamp,
    stage: STAGE,
    aliases: {},
    blocker,
  });
  console.log(`stage A blocker recorded for ${scenario}: ${blocker.message}`);
}

function recordCaptureFailureBlockers({ scenario, args, error }) {
  const index = readJson(INDEX_PATH);
  const matrix = readJson(FIELD_MATRIX_PATH);
  const timestamp = nowIso();
  const status = error?.status ? String(error.status) : 'unavailable';
  const blocker = {
    id: `${scenario}-stage-a-capture-failed-${timestamp.replace(/[:.]/g, '-')}`,
    stage: STAGE,
    environment: 'nuvei-sandbox-local-mock-ct',
    recordedAt: timestamp,
    commandAttempted: commandAttempt(args),
    processorUrl: process.env.PROCESSOR_URL ?? 'missing',
    mockCtUrl: process.env.MOCK_CT_URL ?? 'missing',
    responseStatus: status,
    message: `Stage A real Nuvei openOrder capture failed through the local processor; processor response status: ${status}`,
    requiredAction: 'Inspect the processor and Nuvei sandbox account configuration in the raw local run output, then rerun capture:stage-a after credentials/account capability are fixed.',
  };

  recordStageABlocker({ scenarioId: scenario, blocker, index, matrix });
  for (const scenarioId of STAGE_A_OPERATION_SCENARIOS) {
    recordStageABlocker({
      scenarioId,
      blocker: {
        ...blocker,
        id: `${scenarioId}-stage-a-capture-failed-${timestamp.replace(/[:.]/g, '-')}`,
        message: `Stage A ${scenarioId} operation prerequisite probe blocked because server-side openOrder setup failed; processor response status: ${status}`,
      },
      index,
      matrix,
    });
  }

  index.generatedAt = timestamp;
  writeJson(INDEX_PATH, index);
  writeJson(FIELD_MATRIX_PATH, matrix);
  writeJson(path.join(EVIDENCE_ABS_ROOT, scenario, 'metadata.json'), {
    scenarioId: scenario,
    fixtureName: 'stage-a-capture-failure-blocker',
    source: 'manual-note',
    sanitizedAt: timestamp,
    stage: STAGE,
    aliases: {},
    blocker,
  });
  console.log(`stage A capture blocker recorded for ${scenario}: ${blocker.message}`);
}

function updateFieldMatrixForCapture(matrix, scenario, sanitized) {
  const row = rowById(matrix, scenario);
  row.frontendMode = 'not-captured';
  row.environment = 'nuvei-sandbox-local-mock-ct';
  row.evidenceRefs = [
    `${scenario}/openOrder-response.json`,
    `${scenario}/processor-session-response.json`,
    `${scenario}/ct-cart-after-session.json`,
    `${scenario}/ct-payment-after-session.json`,
  ];
  row.ct = {
    cartId: sanitized.cart.id,
    paymentId: sanitized.payment.id,
    paymentInterfaceId: sanitized.payment.interfaceId,
    cartPaymentRefs: (sanitized.cart.paymentInfo?.payments ?? []).map((payment) => payment.id),
    orderId: sanitized.openOrder.orderId ?? 'unobserved',
    transactionInteractionIds: (sanitized.payment.transactions ?? []).map((transaction) => transaction.interactionId).filter(Boolean),
  };
  row.nuvei = {
    sessionToken: sanitized.session.sessionToken,
    pppTransactionId: 'unobserved',
    pppTransactionField: 'unobserved',
    transactionId: 'unobserved',
    transactionIdField: 'unobserved',
    clientUniqueId: sanitized.openOrder.clientUniqueId ?? sanitized.session.cartId,
    merchantUniqueId: sanitized.session.paymentReference,
    amount: { value: sanitized.session.amount, currency: sanitized.session.currency },
    status: { ppp_status: 'unobserved', Status: 'unobserved', transactionStatus: 'unobserved' },
  };
  row.identityModelAssessment = {
    paymentInterfaceIdEqualsSessionToken: sanitized.payment.interfaceId === sanitized.session.sessionToken ? 'confirmed' : 'contradicted',
    terminalInteractionIdEqualsPpp: 'unresolved',
    clientUniqueIdEqualsCartId: row.nuvei.clientUniqueId === row.ct.cartId ? 'confirmed' : 'unresolved',
    transactionIdSecondaryOnly: 'unresolved',
  };
  row.notes = 'Stage A captured processor session/openOrder setup only; terminal PPP, browser authorization, getPaymentStatus, and DMN identity remain unresolved for later stages.';
}

async function captureStageA({ scenario }) {
  const processorUrl = process.env.PROCESSOR_URL.replace(/\/$/, '');
  const mockCtUrl = process.env.MOCK_CT_URL.replace(/\/$/, '');

  await requestJson(`${mockCtUrl}/reset`, { method: 'POST', body: JSON.stringify({}) });
  const session = await requestJson(`${processorUrl}/payments/session`, {
    method: 'POST',
    headers: { 'x-session-id': 'session-local-001' },
    body: JSON.stringify({ paymentMethodOptions: { card: {} } }),
  });
  const cart = await requestJson(`${mockCtUrl}/payment-integration/carts/${session.cartId}`);
  const payment = await requestJson(`${mockCtUrl}/payment-integration/payments/${session.paymentReference}`);

  const openOrder = {
    sessionToken: session.sessionToken,
    orderId: session.orderId,
    clientUniqueId: session.cartId,
    amount: session.amount,
    currency: session.currency,
    source: 'processor-session-response-visible-openOrder-fields',
  };

  const sanitizedSession = writeRawAndSanitize(`${scenario}/processor-session-response.json`, session);
  const sanitizedCart = writeRawAndSanitize(`${scenario}/ct-cart-after-session.json`, { cart }).cart;
  const sanitizedPayment = writeRawAndSanitize(`${scenario}/ct-payment-after-session.json`, { payment }).payment;
  const sanitizedOpenOrder = writeRawAndSanitize(`${scenario}/openOrder-response.json`, openOrder);

  const sanitized = {
    openOrder: sanitizedOpenOrder,
    session: sanitizedSession,
    cart: sanitizedCart,
    payment: sanitizedPayment,
  };

  const index = readJson(INDEX_PATH);
  const row = rowById(index, scenario);
  row.frontendMode = 'not-captured';
  row.environment = 'nuvei-sandbox-local-mock-ct';
  row.status = 'pending-capture';
  row.synthetic = false;
  row.evidenceClassification = 'stage-a-server-captured';
  for (const name of ['openOrder-response.json', 'processor-session-response.json', 'ct-cart-after-session.json', 'ct-payment-after-session.json']) {
    upsertFixture(row, name);
  }
  row.aliases = {
    cartIds: [sanitized.cart.id].filter(Boolean),
    paymentIds: [sanitized.payment.id].filter(Boolean),
    sessionTokens: [sanitized.session.sessionToken].filter(Boolean),
    pppTransactionIds: [],
    transactionIds: [],
    clientUniqueIds: [sanitized.openOrder.clientUniqueId].filter(Boolean),
    merchantUniqueIds: [sanitized.session.paymentReference].filter(Boolean),
  };
  row.blockers = [];
  setConclusion(row, 'stage-a-captured', 'Stage A server-side session/openOrder setup captured through local processor and mock CT; browser authorization and DMN evidence remain pending for later plans.');
  index.generatedAt = nowIso();

  const matrix = readJson(FIELD_MATRIX_PATH);
  updateFieldMatrixForCapture(matrix, scenario, sanitized);

  writeJson(INDEX_PATH, index);
  writeJson(FIELD_MATRIX_PATH, matrix);
  writeJson(path.join(EVIDENCE_ABS_ROOT, scenario, 'metadata.json'), {
    scenarioId: scenario,
    fixtureName: 'stage-a-server-capture',
    source: 'raw-workspace',
    sanitizedAt: nowIso(),
    stage: STAGE,
    aliases: row.aliases,
    fixtures: row.fixtures.filter((fixture) => fixture.present).map((fixture) => fixture.path),
  });

  console.log(`stage A capture complete for ${scenario}`);
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  if (options.scenario !== DEFAULT_SCENARIO) {
    throw new Error(`Stage A runner currently supports ${DEFAULT_SCENARIO}; received ${options.scenario}`);
  }
  requirePlan01Artifacts();

  console.log('Stage A requires a separately started processor: npm --prefix processor run dev');
  console.log('Set CTP_AUTH_URL, CTP_API_URL, and CTP_SESSION_URL to the mock CT URL for local processor capture.');

  const missing = missingRequiredEnv();
  if (options.requireRealNuvei && missing.length > 0) {
    if (!options.recordBlocker) {
      throw new Error(`Missing required Stage A configuration: ${missing.join(', ')}. Rerun with --record-blocker to write exact blocker metadata instead of fake evidence.`);
    }
    recordMissingConfigurationBlockers({ scenario: options.scenario, args, missing });
    return;
  }

  if (!options.requireRealNuvei && missing.length > 0) {
    console.warn(`Running without complete real Nuvei configuration; missing: ${missing.join(', ')}`);
  }

  try {
    await captureStageA(options);
  } catch (error) {
    if (!options.recordBlocker) throw error;
    recordCaptureFailureBlockers({ scenario: options.scenario, args, error });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
