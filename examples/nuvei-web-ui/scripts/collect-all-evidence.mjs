#!/usr/bin/env node
/**
 * Orchestrator: runs all three evidence sides in order (Nuvei-only →
 * commercetools-only → end-to-end combined), then writes a combined manifest.
 * Each side records deterministic blockers instead of failing when its
 * prerequisites are missing, so this always completes.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIDES_EVIDENCE_ROOT, stableStringify, sha256Hex } from './evidence-side-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const SIDES = [
  { side: 'nuvei', script: 'collect-nuvei-side.mjs' },
  { side: 'commercetools', script: 'collect-ct-side.mjs' },
  { side: 'e2e', script: 'collect-e2e.mjs' },
];

function readManifest(side) {
  const manifestPath = path.join(SIDES_EVIDENCE_ROOT, side, 'run-manifest.json');
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return { side, status: 'failed', fixtures: [], blockers: [] };
  }
}

function main() {
  const results = [];
  for (const { side, script } of SIDES) {
    console.log(`\n=== collecting ${side} side ===`);
    const run = spawnSync(process.execPath, [path.join(SCRIPT_DIR, script)], {
      stdio: 'inherit',
      env: process.env,
    });
    const manifest = readManifest(side);
    results.push({
      side,
      exitCode: run.status ?? 1,
      status: run.status === 0 ? manifest.status : 'failed',
      fixtureCount: manifest.fixtures.length,
      blockerCount: manifest.blockers.length,
      manifestSha256: sha256Hex(stableStringify(manifest)),
    });
  }

  const combined = { sides: results.map(({ exitCode: _exitCode, ...rest }) => rest) };
  fs.mkdirSync(SIDES_EVIDENCE_ROOT, { recursive: true });
  fs.writeFileSync(path.join(SIDES_EVIDENCE_ROOT, 'run-manifest.json'), stableStringify(combined));

  console.log('\n=== evidence collection summary ===');
  for (const result of results) {
    console.log(`${result.side}: ${result.status} (${result.fixtureCount} fixtures, ${result.blockerCount} blockers)`);
  }
  console.log(`combined manifest: ${path.join(SIDES_EVIDENCE_ROOT, 'run-manifest.json')}`);
  console.log('Determinism check: rerun and `git diff -- .planning/phases/02-*/evidence/sides`');

  if (results.some((result) => result.exitCode !== 0)) {
    process.exitCode = 1;
  }
}

main();
