#!/usr/bin/env node
import fs from 'node:fs';

const text = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const requiredTokens = [
  'NUV-01-success-auth',
  'NUV-02-decline-auth',
  'NUV-03-3ds-frictionless',
  'NUV-04-3ds-stepup-success',
  'NUV-04-3ds-stepup-failure-or-abandonment',
  'Export Evidence',
  'frontendMode',
  'browserEvents',
  'operatorNotes',
];

for (const token of requiredTokens) {
  if (!text.includes(token)) throw new Error(`index.html missing ${token}`);
}

if (/cardNumber|cvv|CVV|expiry|expMonth|expYear/.test(text)) {
  throw new Error('index.html evidence export mentions card fields');
}

console.log('stage B browser export self-check passed');
