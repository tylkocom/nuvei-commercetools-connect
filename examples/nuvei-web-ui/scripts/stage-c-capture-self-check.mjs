#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_DIR = path.resolve(SCRIPT_DIR, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(EXAMPLE_DIR, 'package.json'), 'utf8'));
const capturePath = path.join(SCRIPT_DIR, 'capture-stage-c.mjs');
const validatorPath = path.join(SCRIPT_DIR, 'validate-evidence.mjs');

assert.equal(packageJson.scripts['capture:stage-c'], 'node scripts/capture-stage-c.mjs');
assert.ok(fs.existsSync(capturePath), 'capture-stage-c.mjs must exist');
const captureSource = fs.readFileSync(capturePath, 'utf8');
assert.match(captureSource, /--record-blocker/, 'Stage C capture must support exact blocker recording');
assert.match(captureSource, /synthetic-derived-from-real-dmn/, 'Stage C capture must label synthetic mismatch evidence');
assert.match(captureSource, /NUV-05-duplicate-dmn/, 'Stage C capture must cover duplicate DMN scenario');
const validatorSource = fs.readFileSync(validatorPath, 'utf8');
assert.match(validatorSource, /stage-c-local-browser-processor-dmn/, 'validator must understand Stage C');
assert.match(validatorSource, /stage-c: .*must have DMN\/operation evidence or exact blocker metadata/s, 'validator must enforce Stage C required scenarios when requested');

console.log('stage C capture self-check passed');
