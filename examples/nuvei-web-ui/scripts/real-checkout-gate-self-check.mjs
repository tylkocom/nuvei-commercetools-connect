#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_DIR = path.resolve(SCRIPT_DIR, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(EXAMPLE_DIR, 'package.json'), 'utf8'));
const capturePath = path.join(SCRIPT_DIR, 'capture-real-checkout.mjs');
const scenariosPath = path.join(SCRIPT_DIR, 'evidence-scenarios.mjs');
const validatorPath = path.join(SCRIPT_DIR, 'validate-evidence.mjs');

assert.equal(packageJson.scripts['capture:real-checkout'], 'node scripts/capture-real-checkout.mjs');
assert.equal(packageJson.scripts['validate:phase-2-gate'], 'node scripts/capture-real-checkout.mjs --validate');
assert.ok(fs.existsSync(capturePath), 'capture-real-checkout.mjs must exist');

const captureSource = fs.readFileSync(capturePath, 'utf8');
assert.match(captureSource, /commercetools-sandbox-complete-checkout/, 'Complete Checkout must use a real CT sandbox environment label');
assert.match(captureSource, /commercetools-sandbox-payment-only/, 'Payment Only must use a real CT sandbox environment label');
assert.match(captureSource, /--record-blocker/, 'real Checkout capture must support exact blocker recording');
assert.match(captureSource, /mock|local/i, 'real Checkout gate must explicitly reject mock/local proof');
assert.match(captureSource, /proofClasses/, 'real Checkout gate must validate proof classes before pass status');

const scenariosSource = fs.readFileSync(scenariosPath, 'utf8');
assert.match(scenariosSource, /commercetools-sandbox-complete-checkout/, 'scenario catalog must allow Complete Checkout sandbox label');
assert.match(scenariosSource, /commercetools-sandbox-payment-only/, 'scenario catalog must allow Payment Only sandbox label');

const validatorSource = fs.readFileSync(validatorPath, 'utf8');
assert.match(validatorSource, /commercetools-sandbox-complete-checkout/, 'validator must allow detailed real Checkout labels');
assert.match(validatorSource, /commercetools-sandbox-payment-only/, 'validator must allow detailed real Checkout labels');

console.log('real Checkout gate self-check passed');
