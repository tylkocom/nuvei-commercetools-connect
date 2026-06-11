#!/usr/bin/env node
/**
 * Shared helpers for side-based phase-2 evidence collection.
 *
 * Determinism contract: for identical observable behavior, two runs produce
 * byte-identical committed fixtures and manifests. Achieved by:
 *   raw capture (gitignored) → sanitize with a run-scoped alias map →
 *   volatile-key normalization + UUID aliasing → sorted-key serialization.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { EVIDENCE_ROOT, RAW_WORKSPACE } from './evidence-scenarios.mjs';
import { sanitizeForEvidence } from './sanitize-evidence.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
export const SIDES_RAW_ROOT = path.resolve(REPO_ROOT, RAW_WORKSPACE, 'sides');
export const SIDES_EVIDENCE_ROOT = path.resolve(REPO_ROOT, EVIDENCE_ROOT, 'sides');

const VOLATILE_KEYS = new Set([
  'timeStamp',
  'responseTimeStamp',
  'createdAt',
  'versionModifiedAt',
  // Numeric ids escape the string-only alias classes in sanitize-evidence.mjs.
  'internalRequestId',
  'orderId',
  // Per-transaction gateway artifacts.
  'authCode',
  'paymentAccountReference',
  'lastModifiedAt',
  'expiresAt',
  'expires_in',
  'access_token',
  'refresh_token',
  'token',
  'capturedAt',
  'startedAt',
  'completedAt',
  'durationMs',
  'responseTimeMs',
  'date',
  'Date',
]);
const DROPPED_KEYS = new Set(['createdBy', 'lastModifiedBy']);
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function stableStringify(value) {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const key of Object.keys(value).sort()) {
    output[key] = sortKeysDeep(value[key]);
  }
  return output;
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Replace volatile values and alias leftover UUIDs deterministically
 * (first-seen order within a run).
 */
export function normalizeForDeterminism(value, uuidAliases = new Map()) {
  const aliasUuids = (text) =>
    text.replace(UUID_PATTERN, (raw) => {
      const key = raw.toLowerCase();
      if (!uuidAliases.has(key)) {
        uuidAliases.set(key, `uuid-${String(uuidAliases.size + 1).padStart(3, '0')}`);
      }
      return uuidAliases.get(key);
    });

  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const output = {};
      for (const [key, child] of Object.entries(node)) {
        if (DROPPED_KEYS.has(key)) continue;
        if (VOLATILE_KEYS.has(key)) {
          output[key] = '[volatile]';
          continue;
        }
        output[key] = walk(child);
      }
      return output;
    }
    if (typeof node === 'string') return aliasUuids(node);
    return node;
  };

  return walk(value);
}

/**
 * Per-run, per-side evidence context.
 */
export function createRunContext({
  side,
  rawRoot = process.env.SIDES_RAW_ROOT_OVERRIDE ?? SIDES_RAW_ROOT,
  evidenceRoot = process.env.SIDES_EVIDENCE_ROOT_OVERRIDE ?? SIDES_EVIDENCE_ROOT,
}) {
  const sideRawRoot = path.resolve(rawRoot, side);
  const sideEvidenceRoot = path.resolve(evidenceRoot, side);
  // Run-scoped alias map: fresh every run so alias numbering is first-seen
  // deterministic. Never persisted into committed evidence.
  let aliasMap;
  const uuidAliases = new Map();
  const fixtures = [];
  const blockers = [];

  fs.rmSync(sideRawRoot, { recursive: true, force: true });
  fs.rmSync(sideEvidenceRoot, { recursive: true, force: true });
  fs.mkdirSync(sideRawRoot, { recursive: true });
  fs.mkdirSync(sideEvidenceRoot, { recursive: true });

  function writeFile(root, relativePath, content) {
    const target = path.resolve(root, relativePath);
    if (!isInside(target, root)) throw new Error(`refusing to write outside ${root}: ${relativePath}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    return target;
  }

  function writeFixture(relativePath, rawValue) {
    writeFile(sideRawRoot, relativePath, `${JSON.stringify(rawValue, null, 2)}\n`);
    const { value: sanitized, aliasMap: nextMap } = sanitizeForEvidence(rawValue, { aliasMap });
    aliasMap = nextMap;
    const normalized = normalizeForDeterminism(sanitized, uuidAliases);
    const serialized = stableStringify(normalized);
    writeFile(sideEvidenceRoot, relativePath, serialized);
    fixtures.push({ name: relativePath, sha256: sha256Hex(serialized) });
    return normalized;
  }

  function recordBlocker(relativePath, blocker) {
    const value = { kind: 'blocker', ...blocker };
    const serialized = stableStringify(value);
    writeFile(sideEvidenceRoot, relativePath, serialized);
    fixtures.push({ name: relativePath, sha256: sha256Hex(serialized) });
    blockers.push({ fixture: relativePath, reason: blocker.reason });
    return value;
  }

  function finalize() {
    const status = blockers.length === 0 ? 'captured' : fixtures.length > blockers.length ? 'partially-blocked' : 'blocked';
    const manifest = {
      side,
      status,
      fixtures: [...fixtures].sort((a, b) => a.name.localeCompare(b.name)),
      blockers: [...blockers].sort((a, b) => a.fixture.localeCompare(b.fixture)),
    };
    writeFile(sideEvidenceRoot, 'run-manifest.json', stableStringify(manifest));
    return manifest;
  }

  return { side, sideRawRoot, sideEvidenceRoot, writeFixture, recordBlocker, finalize };
}

export function missingEnv(names) {
  return names.filter((name) => !process.env[name] || process.env[name].trim().length === 0);
}

export async function httpJson(url, { method = 'GET', headers = {}, body, timeoutMs = 15_000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed };
  } finally {
    clearTimeout(timeout);
  }
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(probe, { timeoutMs = 15_000, intervalMs = 250, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await probe();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
}

/**
 * Minimal DMN receiver: records every POSTed DMN body (urlencoded or JSON).
 * Expose it publicly via DMN_PUBLIC_URL (tunnel) for Nuvei-side capture.
 */
export function createDmnReceiver({ port = 8091 } = {}) {
  const received = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      let body;
      const contentType = req.headers['content-type'] ?? '';
      if (contentType.includes('json')) {
        try {
          body = JSON.parse(text);
        } catch {
          body = { unparsed: text };
        }
      } else {
        body = Object.fromEntries(new URLSearchParams(text));
      }
      received.push({ url: req.url, body });
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('OK');
    });
  });

  return {
    received,
    async listen() {
      await new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(port, '127.0.0.1', resolve);
      });
      return `http://127.0.0.1:${port}`;
    },
    async waitForDmn(predicate, timeoutMs = 60_000) {
      return waitFor(() => received.find((entry) => predicate(entry.body)), {
        timeoutMs,
        label: 'DMN',
      });
    },
    close() {
      server.close();
    },
  };
}
