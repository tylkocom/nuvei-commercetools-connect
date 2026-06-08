import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { EVIDENCE_ROOT, RAW_WORKSPACE } from './evidence-scenarios.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const RAW_ROOT = path.resolve(REPO_ROOT, RAW_WORKSPACE);
const EVIDENCE_ABS_ROOT = path.resolve(REPO_ROOT, EVIDENCE_ROOT);
const ALIAS_MAP_PATH = path.join(EVIDENCE_ABS_ROOT, 'aliases/alias-map.json');

const REDACTIONS = {
  checksum: '[redacted-checksum]',
  secret: '[redacted-secret]',
  cardData: '[redacted-card-data]',
  pii: '[redacted-pii]',
  rawBody: '[redacted-raw-body]',
};

const ALIAS_PREFIX = {
  cartId: 'cart',
  paymentId: 'payment',
  sessionToken: 'sessionToken',
  pppTransactionId: 'ppp',
  transactionId: 'transaction',
  orderId: 'order',
  requestId: 'request',
  clientUniqueId: 'clientUniqueId',
  merchantUniqueId: 'merchantUniqueId',
};

const ALIAS_CLASSES = Object.keys(ALIAS_PREFIX);
const PPP_FIELDS = new Set(['PPP_TransactionID', 'PPP_TransactionId', 'ppp_TransactionID']);
const TRANSACTION_FIELDS = new Set(['TransactionID', 'TransactionId', 'transactionId']);
const CHECKSUM_FIELDS = new Set(['checksum', 'advanceResponseChecksum', 'responseChecksum', 'responsechecksum']);
const CARD_FIELDS = new Set(['cardNumber', 'ccCardNumber', 'bin', 'last4', 'last4Digits', 'uniqueCC', 'Token', 'token', 'tokenId', 'userPaymentOptionId', 'userPaymentOption', 'PAR', 'nameOnCard', 'expMonth', 'expYear', 'expirationMonth', 'expirationYear', 'cvv', 'cvv2', 'cvc', 'avs']);
const PII_FIELDS = new Set(['email', 'billingEmail', 'phone', 'phoneNumber', 'ip', 'ipAddress', 'clientIp', 'firstName', 'lastName', 'name', 'address', 'billingAddress', 'shippingAddress', 'city', 'street', 'postalCode', 'zip']);
const SECRET_FIELD_PATTERN = /(?:secret|password|private[_-]?key|client[_-]?secret|NUVEI_SECRET_KEY|CTP_CLIENT_SECRET|CTP_CLIENT_ID|CTP_PROJECT_KEY)/i;

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function createEmptyAliasMap() {
  const classes = {};
  const counters = {};
  for (const aliasClass of ALIAS_CLASSES) {
    classes[aliasClass] = {};
    counters[aliasClass] = 0;
  }
  return {
    version: 'phase-02-v1',
    rawWorkspace: RAW_WORKSPACE,
    hashAlgorithm: 'sha256',
    classes,
    counters,
    aliases: {},
    redactions: REDACTIONS,
  };
}

function normalizeAliasMap(map) {
  const normalized = { ...createEmptyAliasMap(), ...map };
  normalized.classes = { ...createEmptyAliasMap().classes, ...(map?.classes ?? {}) };
  normalized.counters = { ...createEmptyAliasMap().counters, ...(map?.counters ?? {}) };
  normalized.aliases = map?.aliases ?? {};
  normalized.redactions = { ...REDACTIONS, ...(map?.redactions ?? {}) };
  for (const aliasClass of ALIAS_CLASSES) {
    normalized.classes[aliasClass] ??= {};
    normalized.counters[aliasClass] ??= 0;
  }
  return normalized;
}

function loadAliasMap(aliasMapPath = ALIAS_MAP_PATH) {
  try {
    return normalizeAliasMap(JSON.parse(fs.readFileSync(aliasMapPath, 'utf8')));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return createEmptyAliasMap();
  }
}

function saveAliasMap(aliasMap, aliasMapPath = ALIAS_MAP_PATH) {
  fs.mkdirSync(path.dirname(aliasMapPath), { recursive: true });
  fs.writeFileSync(aliasMapPath, `${JSON.stringify(aliasMap, null, 2)}\n`);
}

function aliasValue(aliasMap, aliasClass, rawValue) {
  const value = String(rawValue);
  const hash = sha256(value);
  const existing = aliasMap.classes[aliasClass]?.[hash];
  if (existing) return existing;
  aliasMap.counters[aliasClass] = (aliasMap.counters[aliasClass] ?? 0) + 1;
  const alias = `${ALIAS_PREFIX[aliasClass]}-${String(aliasMap.counters[aliasClass]).padStart(3, '0')}`;
  aliasMap.classes[aliasClass][hash] = alias;
  aliasMap.aliases[alias] = { class: aliasClass, rawSha256: hash };
  return alias;
}

function existingAliasForRaw(aliasMap, rawValue, preferredClasses) {
  const hash = sha256(rawValue);
  for (const aliasClass of preferredClasses) {
    const alias = aliasMap.classes[aliasClass]?.[hash];
    if (alias) return alias;
  }
  return undefined;
}

function semanticAliasClass(key, parents, value, aliasMap) {
  if (PPP_FIELDS.has(key)) return 'pppTransactionId';
  if (TRANSACTION_FIELDS.has(key)) return 'transactionId';
  if (key === 'orderId') return 'orderId';
  if (key === 'clientRequestId' || key === 'internalRequestId' || key === 'requestId') return 'requestId';
  if (key === 'sessionToken') return 'sessionToken';
  if (key === 'interfaceId' || key === 'paymentInterfaceId') return 'sessionToken';
  if ((key === 'id' && parents.at(-1) === 'cart') || key === 'cartId') return 'cartId';
  if ((key === 'id' && parents.at(-1) === 'payment') || key === 'paymentId' || key === 'paymentReference') return 'paymentId';
  if (key === 'clientUniqueId') {
    const existing = existingAliasForRaw(aliasMap, value, ['cartId']);
    return existing ? { existing } : 'clientUniqueId';
  }
  if (key === 'merchant_unique_id' || key === 'merchantUniqueId' || key === 'merchantUniqueID') {
    const existing = existingAliasForRaw(aliasMap, value, ['paymentId', 'cartId']);
    return existing ? { existing } : 'merchantUniqueId';
  }
  return undefined;
}

function redactOrAliasScalar(key, value, parents, aliasMap) {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
  const stringValue = String(value);
  if (CHECKSUM_FIELDS.has(key) || /checksum/i.test(key)) return REDACTIONS.checksum;
  if (SECRET_FIELD_PATTERN.test(key)) return REDACTIONS.secret;
  if (CARD_FIELDS.has(key)) return REDACTIONS.cardData;
  if (PII_FIELDS.has(key)) return REDACTIONS.pii;
  if (key === 'rawBody' || key === 'rawDmnBody' || key === 'unsanitizedBody') return REDACTIONS.rawBody;
  const aliasClass = semanticAliasClass(key, parents, stringValue, aliasMap);
  if (typeof aliasClass === 'object' && aliasClass.existing) return aliasClass.existing;
  if (typeof aliasClass === 'string') return aliasValue(aliasMap, aliasClass, stringValue);
  return sanitizeText(stringValue, aliasMap);
}

function sanitizeObject(value, aliasMap, parents = []) {
  if (Array.isArray(value)) return value.map((item) => sanitizeObject(item, aliasMap, parents));
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === 'object') {
      if (SECRET_FIELD_PATTERN.test(key)) {
        output[key] = REDACTIONS.secret;
      } else if (CARD_FIELDS.has(key)) {
        output[key] = REDACTIONS.cardData;
      } else if (PII_FIELDS.has(key)) {
        output[key] = REDACTIONS.pii;
      } else if (key === 'rawBody' || key === 'rawDmnBody' || key === 'unsanitizedBody') {
        output[key] = REDACTIONS.rawBody;
      } else {
        output[key] = sanitizeObject(child, aliasMap, [...parents, key]);
      }
    } else {
      output[key] = redactOrAliasScalar(key, child, parents, aliasMap);
    }
  }
  return output;
}

function sanitizeText(input, aliasMap) {
  let output = String(input);
  output = output.replace(/((?:PPP_TransactionID|PPP_TransactionId|ppp_TransactionID)["'\s:=]+)([A-Za-z0-9_-]{6,})/g, (_match, prefix, raw) => `${prefix}${aliasValue(aliasMap, 'pppTransactionId', raw)}`);
  output = output.replace(/((?:TransactionID|TransactionId|transactionId)["'\s:=]+)([A-Za-z0-9_-]{6,})/g, (_match, prefix, raw) => `${prefix}${aliasValue(aliasMap, 'transactionId', raw)}`);
  output = output.replace(/(sessionToken["'\s:=]+)([A-Za-z0-9._-]{10,})/g, (_match, prefix, raw) => `${prefix}${aliasValue(aliasMap, 'sessionToken', raw)}`);
  output = output.replace(/(clientUniqueId["'\s:=]+)([A-Za-z0-9._:-]{6,})/g, (_match, prefix, raw) => `${prefix}${aliasValue(aliasMap, 'clientUniqueId', raw)}`);
  output = output.replace(/(merchant_unique_id["'\s:=]+)([A-Za-z0-9._:-]{6,})/g, (_match, prefix, raw) => `${prefix}${aliasValue(aliasMap, 'merchantUniqueId', raw)}`);
  output = output.replace(/((?:advanceResponseChecksum|responseChecksum|responsechecksum|checksum)["'\s:=]+)([A-Fa-f0-9]{16,}|[A-Za-z0-9+/=]{16,})/g, `$1${REDACTIONS.checksum}`);
  output = output.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTIONS.pii);
  output = output.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, REDACTIONS.pii);
  output = output.replace(/\b(?:\d[ -]*?){13,19}\b/g, REDACTIONS.cardData);
  output = output.replace(/(NUVEI_SECRET_KEY|CTP_CLIENT_SECRET|CTP_CLIENT_ID|CTP_PROJECT_KEY|secret|clientSecret|password)(["'\s:=]+)([^\s,"']+)/gi, `$1$2${REDACTIONS.secret}`);
  return output;
}

function parseRaw(content, filePath) {
  const trimmed = content.trim();
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.json' || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return { kind: 'json', value: JSON.parse(content) };
  }
  if (extension === '.ndjson') {
    return { kind: 'ndjson', value: content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)) };
  }
  if (extension === '.form' || (/^[^\s=&]+=[\s\S]*&/.test(trimmed) && !trimmed.includes('\n'))) {
    return { kind: 'form', value: Object.fromEntries(new URLSearchParams(trimmed)) };
  }
  return { kind: 'text', value: content };
}

function serializeSanitized(parsed) {
  if (parsed.kind === 'text') return parsed.value.endsWith('\n') ? parsed.value : `${parsed.value}\n`;
  if (parsed.kind === 'ndjson') return `${parsed.value.map((line) => JSON.stringify(line)).join('\n')}\n`;
  return `${JSON.stringify(parsed.value, null, 2)}\n`;
}

function outputPathForRaw(rawPath, rawRoot = RAW_ROOT, evidenceRoot = EVIDENCE_ABS_ROOT) {
  const relative = path.relative(rawRoot, rawPath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`raw input outside raw workspace: ${rawPath}`);
  return path.join(evidenceRoot, relative);
}

function collectFiles(root) {
  if (!fs.existsSync(root)) return [];
  const entries = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current)) stack.push(path.join(current, name));
    } else if (stat.isFile()) {
      entries.push(current);
    }
  }
  return entries.sort();
}

export function sanitizeForEvidence(value, options = {}) {
  const aliasMap = normalizeAliasMap(options.aliasMap ?? createEmptyAliasMap());
  const sanitized = typeof value === 'string' ? sanitizeText(value, aliasMap) : sanitizeObject(value, aliasMap);
  return { value: sanitized, aliasMap };
}

export function sanitizeFile(rawFilePath, options = {}) {
  const rawRoot = path.resolve(options.rawRoot ?? RAW_ROOT);
  const evidenceRoot = path.resolve(options.evidenceRoot ?? EVIDENCE_ABS_ROOT);
  const absoluteRawFilePath = path.resolve(rawFilePath);
  if (!isInside(absoluteRawFilePath, rawRoot)) throw new Error(`refusing to read outside ${RAW_WORKSPACE}: ${rawFilePath}`);
  const outputPath = options.outputPath ? path.resolve(options.outputPath) : outputPathForRaw(absoluteRawFilePath, rawRoot, evidenceRoot);
  if (!isInside(outputPath, evidenceRoot)) throw new Error(`refusing to write outside ${EVIDENCE_ROOT}: ${outputPath}`);
  const aliasMapPath = options.aliasMapPath ?? ALIAS_MAP_PATH;
  const aliasMap = normalizeAliasMap(options.aliasMap ?? loadAliasMap(aliasMapPath));
  const parsed = parseRaw(fs.readFileSync(absoluteRawFilePath, 'utf8'), absoluteRawFilePath);
  if (parsed.kind === 'text') parsed.value = sanitizeText(parsed.value, aliasMap);
  else parsed.value = sanitizeObject(parsed.value, aliasMap);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serializeSanitized(parsed));
  saveAliasMap(aliasMap, aliasMapPath);
  return { outputPath, aliasMap };
}

export function sanitizeRawWorkspace(options = {}) {
  const rawRoot = path.resolve(options.rawRoot ?? RAW_ROOT);
  const files = collectFiles(rawRoot);
  return files.map((file) => sanitizeFile(file, options));
}

function parseArgs(args) {
  const parsed = { input: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--input') parsed.input = args[++index];
  }
  return parsed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const results = args.input ? [sanitizeFile(path.resolve(REPO_ROOT, args.input))] : sanitizeRawWorkspace();
  console.log(`sanitized ${results.length} evidence file(s)`);
}
