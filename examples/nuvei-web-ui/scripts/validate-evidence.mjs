import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE_ROOT, EVIDENCE_SCENARIOS, ENVIRONMENTS, FRONTEND_MODES, RAW_WORKSPACE, SCENARIO_IDS, STAGES } from './evidence-scenarios.mjs';
import { sanitizeForEvidence } from './sanitize-evidence.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const EVIDENCE_ABS_ROOT = path.resolve(REPO_ROOT, EVIDENCE_ROOT);
const RAW_ABS_ROOT = path.resolve(REPO_ROOT, RAW_WORKSPACE);

const REDACTED_VALUES = new Set(['[redacted-checksum]', '[redacted-secret]', '[redacted-card-data]', '[redacted-pii]', '[redacted-raw-body]', 'unobserved', 'not-captured']);
const CHECKSUM_KEY_PATTERN = /checksum/i;
const SECRET_KEY_PATTERN = /(?:NUVEI_SECRET_KEY|CTP_CLIENT_SECRET|CTP_CLIENT_ID|CTP_PROJECT_KEY|secret|password|private[_-]?key|client[_-]?secret)/i;
const CARD_KEYS = new Set(['cardNumber', 'ccCardNumber', 'bin', 'last4', 'last4Digits', 'uniqueCC', 'Token', 'token', 'tokenId', 'userPaymentOptionId', 'userPaymentOption', 'PAR', 'nameOnCard', 'expMonth', 'expYear', 'expirationMonth', 'expirationYear', 'cvv', 'cvv2', 'cvc', 'avs']);
const PII_KEYS = new Set(['email', 'billingEmail', 'phone', 'phoneNumber', 'ip', 'ipAddress', 'clientIp', 'firstName', 'lastName', 'address', 'billingAddress', 'shippingAddress', 'city', 'street', 'postalCode', 'zip']);
const SESSION_KEYS = new Set(['sessionToken', 'paymentInterfaceId', 'interfaceId']);
const PPP_KEYS = new Set(['PPP_TransactionID', 'PPP_TransactionId', 'ppp_TransactionID', 'pppTransactionId']);
const TRANSACTION_KEYS = new Set(['TransactionID', 'TransactionId', 'transactionId']);
const INTERACTION_KEYS = new Set(['interactionId']);
const ALLOWED_STATUSES = new Set(['pending-capture', 'passed', 'blocked', 'failed', 'not-applicable']);
const ALLOWED_ASSESSMENTS = new Set(['confirmed', 'contradicted', 'unresolved', 'blocked']);

function parseArgs(args) {
  return {
    emptyOk: args.includes('--empty-ok'),
    selfCheck: args.includes('--self-check'),
    evidenceRoot: valueAfter(args, '--evidence-root') ?? EVIDENCE_ABS_ROOT,
    stage: normalizeStage(valueAfter(args, '--stage')),
  };
}

function normalizeStage(value) {
  if (!value) return undefined;
  if (value === 'stage-a') return 'stage-a-local-processor-mock-ct';
  if (value === 'stage-b') return 'stage-b-local-browser-processor';
  if (value === 'stage-c') return 'stage-c-local-browser-processor-dmn';
  if (value === 'stage-d') return 'stage-d-real-commercetools-checkout';
  return value;
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function collectFiles(root) {
  if (!fs.existsSync(root)) return [];
  const output = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current)) stack.push(path.join(current, name));
    } else if (stat.isFile()) {
      output.push(current);
    }
  }
  return output.sort();
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function addError(errors, filePath, forbiddenClass, message) {
  errors.push({ path: filePath, forbiddenClass, message });
}

function safeString(value) {
  return typeof value === 'string' ? value : String(value ?? '');
}

function isAlias(value, prefix) {
  return new RegExp(`^${prefix}-\\d{3}$`).test(safeString(value));
}

function isAllowedPlaceholder(value) {
  return REDACTED_VALUES.has(safeString(value));
}

function scanParsedValue(value, filePath, errors, parents = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanParsedValue(item, filePath, errors, [...parents, String(index)]));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const location = [...parents, key].join('.');
    if (parents[0] !== 'redactions' && SECRET_KEY_PATTERN.test(key)) {
      addError(errors, filePath, 'secret', `${location} uses a secret-like field name`);
      continue;
    }
    if (CHECKSUM_KEY_PATTERN.test(key) && !isAllowedPlaceholder(child)) addError(errors, filePath, 'checksum', `${location} contains an unredacted checksum`);
    if (CARD_KEYS.has(key) && !isAllowedPlaceholder(child)) addError(errors, filePath, 'card-data', `${location} contains card-adjacent data`);
    if (PII_KEYS.has(key) && !isAllowedPlaceholder(child)) addError(errors, filePath, 'pii', `${location} contains shopper PII`);
    if ((key === 'rawBody' || key === 'rawDmnBody' || key === 'unsanitizedBody') && !isAllowedPlaceholder(child)) addError(errors, filePath, 'raw-body', `${location} contains an unsanitized raw body`);
    if (SESSION_KEYS.has(key) && typeof child === 'string' && !isAllowedPlaceholder(child) && !isAlias(child, 'sessionToken')) addError(errors, filePath, 'session-token', `${location} contains a raw session token or interfaceId`);
    if (PPP_KEYS.has(key) && typeof child === 'string' && !isAllowedPlaceholder(child) && !isAlias(child, 'ppp')) addError(errors, filePath, 'ppp-transaction', `${location} contains a raw PPP transaction id`);
    if (TRANSACTION_KEYS.has(key) && typeof child === 'string' && !isAllowedPlaceholder(child) && !isAlias(child, 'transaction')) addError(errors, filePath, 'transaction-id', `${location} contains a raw fiscal transaction id`);
    if (INTERACTION_KEYS.has(key) && typeof child === 'string' && !isAllowedPlaceholder(child) && !isAlias(child, 'sessionToken') && !isAlias(child, 'ppp') && !isAlias(child, 'transaction')) addError(errors, filePath, 'interaction-id', `${location} contains a raw interaction id`);
    scanParsedValue(child, filePath, errors, [...parents, key]);
  }
}

function scanTextValue(text, filePath, errors) {
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) addError(errors, filePath, 'pii', 'text contains email-like PII');
  if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(text)) addError(errors, filePath, 'pii', 'text contains IP address PII');
  if (/\b(?:\d[ -]*?){13,19}\b/.test(text)) addError(errors, filePath, 'card-data', 'text contains PAN-like digits');
  if (/(NUVEI_SECRET_KEY|CTP_CLIENT_SECRET|CTP_CLIENT_ID|CTP_PROJECT_KEY|clientSecret|secret|password)\s*[=:]/i.test(text)) addError(errors, filePath, 'secret', 'text contains secret-like env material');
  if (/(?:advanceResponseChecksum|responseChecksum|responsechecksum|checksum)\s*[=:]\s*(?!\[redacted-checksum\])/i.test(text)) addError(errors, filePath, 'checksum', 'text contains unredacted checksum material');
  if (/sessionToken\s*[=:]\s*(?!sessionToken-\d{3}|\[redacted-raw-body\]|not-captured|unobserved)/i.test(text)) addError(errors, filePath, 'session-token', 'text contains raw sessionToken material');
}

export function scanForbiddenEvidence(evidenceRoot = EVIDENCE_ABS_ROOT) {
  const errors = [];
  for (const filePath of collectFiles(evidenceRoot)) {
    const relative = path.relative(evidenceRoot, filePath);
    if (relative.startsWith('schema/')) continue;
    const text = fs.readFileSync(filePath, 'utf8');
    try {
      scanParsedValue(JSON.parse(text), relative, errors);
    } catch {
      scanTextValue(text, relative, errors);
    }
  }
  return errors;
}

function validateSchemasExist(evidenceRoot, errors) {
  for (const rel of ['index.json', 'field-matrix.json', 'findings.json', 'aliases/alias-map.json', 'schema/evidence-index.schema.json', 'schema/fixture-metadata.schema.json', 'schema/field-matrix.schema.json', 'schema/findings.schema.json']) {
    const filePath = path.join(evidenceRoot, rel);
    if (!fs.existsSync(filePath)) errors.push(`missing evidence file: ${rel}`);
    else {
      try { readJson(filePath); }
      catch (error) { errors.push(`invalid JSON in ${rel}: ${error.message}`); }
    }
  }
}

function validateIndex(index, evidenceRoot, { emptyOk, stage }) {
  const errors = [];
  if (!index || typeof index !== 'object') return ['index is not an object'];
  if (index.rawWorkspace !== RAW_WORKSPACE) errors.push(`index.rawWorkspace must be ${RAW_WORKSPACE}`);
  if (!Array.isArray(index.scenarios)) errors.push('index.scenarios must be an array');
  const rows = new Map((index.scenarios ?? []).map((scenario) => [scenario.id, scenario]));
  for (const scenario of EVIDENCE_SCENARIOS) {
    const row = rows.get(scenario.id);
    if (!row) {
      errors.push(`missing index scenario ${scenario.id}`);
      continue;
    }
    if (row.scenarioFolder !== scenario.id) errors.push(`${scenario.id}: scenarioFolder must equal scenario id`);
    for (const requirement of scenario.requirements) if (!row.requirements?.includes(requirement)) errors.push(`${scenario.id}: missing requirement ${requirement}`);
    if (!STAGES.includes(row.requiredStage)) errors.push(`${scenario.id}: invalid requiredStage ${row.requiredStage}`);
    if (!FRONTEND_MODES.includes(row.frontendMode)) errors.push(`${scenario.id}: invalid frontendMode ${row.frontendMode}`);
    if (!ENVIRONMENTS.includes(row.environment)) errors.push(`${scenario.id}: invalid environment ${row.environment}`);
    if (!ALLOWED_STATUSES.has(row.status)) errors.push(`${scenario.id}: invalid status ${row.status}`);
    if (!Array.isArray(row.fixtures)) errors.push(`${scenario.id}: fixtures must be an array`);
    for (const fixtureName of scenario.fixtureNames) {
      const slot = row.fixtures?.find((fixture) => fixture.name === fixtureName);
      if (!slot) {
        errors.push(`${scenario.id}: missing fixture slot ${fixtureName}`);
        continue;
      }
      if (slot.path !== `${scenario.id}/${fixtureName}`) errors.push(`${scenario.id}: fixture ${fixtureName} must stay under its scenario folder`);
      if (slot.present && !fs.existsSync(path.join(evidenceRoot, slot.path))) errors.push(`${scenario.id}: fixture marked present but missing: ${slot.path}`);
      if (!slot.present && !emptyOk && !stage && row.status !== 'blocked') errors.push(`${scenario.id}: fixture ${fixtureName} missing; use --empty-ok only before capture`);
    }
    if ((scenario.id.startsWith('NUV-07') || scenario.id.startsWith('NUV-08')) && row.status === 'passed') {
      if (row.environment !== 'real-commercetools-checkout') errors.push(`${scenario.id}: passed real Checkout row must use real-commercetools-checkout environment`);
      if (row.requiredStage !== 'stage-d-real-commercetools-checkout') errors.push(`${scenario.id}: passed real Checkout row must use stage-d-real-commercetools-checkout`);
    }
    if (row.status === 'passed' && row.conclusion?.evidenceSatisfiesRequirements !== true) errors.push(`${scenario.id}: passed row must set conclusion.evidenceSatisfiesRequirements=true`);
    if (!emptyOk && !stage && row.status === 'pending-capture') errors.push(`${scenario.id}: pending-capture is only valid with --empty-ok`);
  }
  if (stage === 'stage-a-local-processor-mock-ct') {
    const stageRow = rows.get('NUV-01-success-auth');
    const hasStageACapture = stageRow?.evidenceClassification === 'stage-a-server-captured';
    const hasStageABlocker = stageRow?.status === 'blocked' && Array.isArray(stageRow.blockers) && stageRow.blockers.length > 0;
    if (!hasStageACapture && !hasStageABlocker) errors.push('stage-a: NUV-01-success-auth must be captured or blocked with blocker metadata');
  }
  return errors;
}

function validateFieldMatrix(matrix) {
  const errors = [];
  if (!Array.isArray(matrix?.scenarios)) return ['field-matrix.scenarios must be an array'];
  const rows = new Map(matrix.scenarios.map((row) => [row.scenarioId, row]));
  for (const id of SCENARIO_IDS) {
    const row = rows.get(id);
    if (!row) {
      errors.push(`missing field matrix scenario ${id}`);
      continue;
    }
    if (!FRONTEND_MODES.includes(row.frontendMode)) errors.push(`${id}: invalid field matrix frontendMode ${row.frontendMode}`);
    if (!ENVIRONMENTS.includes(row.environment)) errors.push(`${id}: invalid field matrix environment ${row.environment}`);
    for (const [key, assessment] of Object.entries(row.identityModelAssessment ?? {})) {
      if (!ALLOWED_ASSESSMENTS.has(assessment)) errors.push(`${id}: invalid assessment ${key}=${assessment}`);
    }
    for (const key of ['paymentInterfaceIdEqualsSessionToken', 'terminalInteractionIdEqualsPpp', 'clientUniqueIdEqualsCartId', 'transactionIdSecondaryOnly']) {
      if (!ALLOWED_ASSESSMENTS.has(row.identityModelAssessment?.[key])) errors.push(`${id}: missing identity assessment ${key}`);
    }
  }
  return errors;
}

function validateFindings(findings) {
  const errors = [];
  if (!Array.isArray(findings?.findings)) return ['findings.findings must be an array'];
  for (const finding of findings.findings) {
    for (const key of ['id', 'scenarioId', 'severity', 'observed', 'expected', 'targetPhase', 'evidenceRefs', 'status']) {
      if (!(key in finding)) errors.push(`${finding.id ?? 'finding'}: missing ${key}`);
    }
    if (!SCENARIO_IDS.includes(finding.scenarioId)) errors.push(`${finding.id}: invalid scenarioId ${finding.scenarioId}`);
  }
  return errors;
}

function validateRawWorkspaceIgnored(errors) {
  const gitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
  if (!gitignore.includes(RAW_WORKSPACE)) errors.push(`${RAW_WORKSPACE} is not gitignored`);
  if (fs.existsSync(RAW_ABS_ROOT)) {
    for (const filePath of collectFiles(RAW_ABS_ROOT)) {
      if (!isInside(filePath, RAW_ABS_ROOT)) errors.push(`raw workspace traversal detected: ${filePath}`);
    }
  }
}

export function validateEvidence(options = {}) {
  const evidenceRoot = path.resolve(options.evidenceRoot ?? EVIDENCE_ABS_ROOT);
  const errors = [];
  validateRawWorkspaceIgnored(errors);
  validateSchemasExist(evidenceRoot, errors);
  if (errors.length) return errors;
  errors.push(...validateIndex(readJson(path.join(evidenceRoot, 'index.json')), evidenceRoot, options));
  errors.push(...validateFieldMatrix(readJson(path.join(evidenceRoot, 'field-matrix.json'))));
  errors.push(...validateFindings(readJson(path.join(evidenceRoot, 'findings.json'))));
  for (const forbidden of scanForbiddenEvidence(evidenceRoot)) errors.push(`${forbidden.path}: ${forbidden.forbiddenClass}: ${forbidden.message}`);
  return errors;
}

async function runSelfCheck() {
  const cartRaw = 'cart-real-123';
  const result = sanitizeForEvidence({ cart: { id: cartRaw }, clientUniqueId: cartRaw });
  assert.equal(result.value.cart.id, 'cart-001');
  assert.equal(result.value.clientUniqueId, 'cart-001');

  const txResult = sanitizeForEvidence({
    PPP_TransactionID: 'ppp-raw-a',
    PPP_TransactionId: 'ppp-raw-b',
    ppp_TransactionID: 'ppp-raw-c',
    TransactionID: 'fiscal-raw-a',
    TransactionId: 'fiscal-raw-b',
    transactionId: 'fiscal-raw-c',
  });
  assert.deepEqual(Object.keys(txResult.value), ['PPP_TransactionID', 'PPP_TransactionId', 'ppp_TransactionID', 'TransactionID', 'TransactionId', 'transactionId']);
  assert.match(txResult.value.PPP_TransactionID, /^ppp-\d{3}$/);
  assert.match(txResult.value.PPP_TransactionId, /^ppp-\d{3}$/);
  assert.match(txResult.value.ppp_TransactionID, /^ppp-\d{3}$/);
  assert.match(txResult.value.TransactionID, /^transaction-\d{3}$/);
  assert.match(txResult.value.TransactionId, /^transaction-\d{3}$/);
  assert.match(txResult.value.transactionId, /^transaction-\d{3}$/);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-02-evidence-check-'));
  fs.writeFileSync(path.join(tempRoot, 'bad.json'), JSON.stringify({
    checksum: 'abcdef1234567890abcdef1234567890',
    sessionToken: 'raw-session-token-12345',
    NUVEI_SECRET_KEY: 'merchant-secret',
    cardNumber: '4111111111111111',
    bin: '411111',
    last4: '1111',
    token: 'raw-card-token',
    userPaymentOptionId: 'upo-raw',
    PAR: 'par-raw',
    nameOnCard: 'Jane Shopper',
    expMonth: '12',
    email: 'shopper@example.com',
    address: 'Main Street 1',
    phone: '+4912345678',
    ip: '203.0.113.10',
    rawBody: 'Status=APPROVED&checksum=raw',
  }));
  const forbiddenClasses = new Set(scanForbiddenEvidence(tempRoot).map((failure) => failure.forbiddenClass));
  for (const expected of ['checksum', 'session-token', 'secret', 'card-data', 'pii', 'raw-body']) assert.ok(forbiddenClasses.has(expected), `missing forbidden class ${expected}`);

  const badIndexErrors = validateIndex({
    rawWorkspace: RAW_WORKSPACE,
    scenarios: EVIDENCE_SCENARIOS.map((scenario) => ({
      id: scenario.id,
      scenarioFolder: scenario.id,
      requirements: scenario.requirements,
      requiredStage: scenario.requiredStage,
      frontendMode: 'not-captured',
      environment: scenario.id.startsWith('NUV-07') ? 'local-mock-ct' : 'not-captured',
      status: scenario.id.startsWith('NUV-07') ? 'passed' : 'blocked',
      fixtures: scenario.fixtureNames.map((name) => ({ name, path: `${scenario.id}/${name}`, present: false })),
      aliases: {},
      conclusion: { evidenceSatisfiesRequirements: scenario.id.startsWith('NUV-07') },
      blockers: [],
      findings: [],
    })),
  }, tempRoot, { emptyOk: true });
  assert.ok(badIndexErrors.some((error) => error.includes('NUV-07-complete-checkout-success') && error.includes('real-commercetools-checkout')));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfCheck) {
    await runSelfCheck();
    console.log('evidence self-check passed');
  } else {
    const errors = validateEvidence(args);
    if (errors.length) {
      console.error(errors.join('\n'));
      process.exitCode = 1;
    } else {
      console.log('evidence validation passed');
    }
  }
}
