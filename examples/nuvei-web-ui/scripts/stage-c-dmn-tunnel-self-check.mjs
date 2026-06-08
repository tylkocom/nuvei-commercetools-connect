#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_DIR = path.resolve(SCRIPT_DIR, '..');
const tunnelScript = fs.readFileSync(path.join(EXAMPLE_DIR, 'start-dmn-tunnel.mjs'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(EXAMPLE_DIR, 'package.json'), 'utf8'));
const proxyPath = path.join(SCRIPT_DIR, 'capture-dmn-proxy.mjs');

assert.equal(packageJson.scripts['capture:dmn-proxy'], 'node scripts/capture-dmn-proxy.mjs');
assert.ok(fs.existsSync(proxyPath), 'capture-dmn-proxy.mjs must exist');
assert.match(tunnelScript, /--dry-run|DRY_RUN/i, 'tunnel script must support dry-run verification');
assert.match(tunnelScript, /NGROK_BIN/, 'tunnel script must support configured ngrok binary');
assert.doesNotMatch(tunnelScript, /spawn\(["']npx["']|\bnpx\b/, 'tunnel script must not invoke npx');
assert.match(tunnelScript, /\/webhooks\/nuvei/, 'dry-run output must include DMN webhook suffix');

console.log('stage C DMN tunnel self-check passed');
