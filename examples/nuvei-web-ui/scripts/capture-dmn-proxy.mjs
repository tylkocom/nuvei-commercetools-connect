#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAW_WORKSPACE } from './evidence-scenarios.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const DEFAULT_PORT = 8090;
const DEFAULT_PROCESSOR_URL = 'http://localhost:8080';
const RAW_DMN_ROOT = path.resolve(REPO_ROOT, RAW_WORKSPACE, 'stage-c/dmn');

function parseArgs(args) {
  return {
    selfCheck: args.includes('--self-check'),
    once: args.includes('--once'),
    port: Number(valueAfter(args, '--port') ?? process.env.DMN_OBSERVER_PORT ?? DEFAULT_PORT),
    processorUrl: valueAfter(args, '--processor-url') ?? process.env.PROCESSOR_URL ?? DEFAULT_PROCESSOR_URL,
    rawRoot: valueAfter(args, '--raw-root') ?? RAW_DMN_ROOT,
  };
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function headersToForward(headers) {
  const output = { ...headers };
  delete output.host;
  delete output.connection;
  delete output['content-length'];
  return output;
}

function requestIdFor(sequence) {
  return `${nowStamp()}-${String(sequence).padStart(3, '0')}`;
}

function writeRawJson(rawRoot, fileName, value) {
  const target = path.resolve(rawRoot, fileName);
  if (!isInside(target, rawRoot)) throw new Error(`refusing to write outside raw DMN root: ${target}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  return target;
}

function writeRawBody(rawRoot, fileName, body) {
  const target = path.resolve(rawRoot, fileName);
  if (!isInside(target, rawRoot)) throw new Error(`refusing to write outside raw DMN root: ${target}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
  return target;
}

async function forwardToProcessor({ processorUrl, method, headers, body }) {
  const target = new URL('/webhooks/nuvei', processorUrl);
  const response = await fetch(target, {
    method,
    headers: headersToForward(headers),
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  });
  const responseBody = Buffer.from(await response.arrayBuffer());
  return {
    target: target.toString(),
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: responseBody,
  };
}

export function createDmnProxyServer({ processorUrl, rawRoot, once = false } = {}) {
  const resolvedRawRoot = path.resolve(rawRoot ?? RAW_DMN_ROOT);
  let sequence = 0;
  let server;
  server = http.createServer(async (req, res) => {
    const id = requestIdFor((sequence += 1));
    const body = await readRequestBody(req);
    const requestMeta = {
      schemaVersion: 'phase-02-stage-c-dmn-proxy-raw-v1',
      id,
      observedAt: new Date().toISOString(),
      method: req.method,
      url: req.url,
      headers: req.headers,
      bodyFile: `${id}-request.body`,
      forwardTarget: new URL('/webhooks/nuvei', processorUrl ?? DEFAULT_PROCESSOR_URL).toString(),
    };
    writeRawJson(resolvedRawRoot, `${id}-request.json`, requestMeta);
    writeRawBody(resolvedRawRoot, requestMeta.bodyFile, body);

    try {
      const processorResponse = await forwardToProcessor({
        processorUrl: processorUrl ?? DEFAULT_PROCESSOR_URL,
        method: req.method ?? 'POST',
        headers: req.headers,
        body,
      });
      writeRawJson(resolvedRawRoot, `${id}-processor-response.json`, {
        schemaVersion: 'phase-02-stage-c-dmn-proxy-response-raw-v1',
        id,
        observedAt: new Date().toISOString(),
        target: processorResponse.target,
        status: processorResponse.status,
        statusText: processorResponse.statusText,
        headers: processorResponse.headers,
        bodyFile: `${id}-processor-response.body`,
      });
      writeRawBody(resolvedRawRoot, `${id}-processor-response.body`, processorResponse.body);
      res.writeHead(processorResponse.status, Object.fromEntries(
        Object.entries(processorResponse.headers).filter(([key]) => !['content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase())),
      ));
      res.end(processorResponse.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeRawJson(resolvedRawRoot, `${id}-processor-error.json`, {
        schemaVersion: 'phase-02-stage-c-dmn-proxy-error-raw-v1',
        id,
        observedAt: new Date().toISOString(),
        error: message,
      });
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'DMN proxy forward failed' }));
    } finally {
      if (once) server.close();
    }
  });
  return server;
}

async function runSelfCheck() {
  const selfCheckRawRoot = path.join(RAW_DMN_ROOT, 'self-check');
  fs.rmSync(selfCheckRawRoot, { recursive: true, force: true });
  let received;
  const processor = http.createServer(async (req, res) => {
    const body = await readRequestBody(req);
    received = {
      method: req.method,
      url: req.url,
      contentType: req.headers['content-type'],
      body: body.toString('utf8'),
    };
    res.writeHead(202, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, observed: received.url }));
  });
  await new Promise((resolve) => processor.listen(0, '127.0.0.1', resolve));
  const processorPort = processor.address().port;
  const proxy = createDmnProxyServer({
    processorUrl: `http://127.0.0.1:${processorPort}`,
    rawRoot: selfCheckRawRoot,
    once: true,
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const proxyPort = proxy.address().port;
  const response = await fetch(`http://127.0.0.1:${proxyPort}/incoming-dmn`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'merchant_id=merchant-test&totalAmount=10.00&currency=EUR',
  });
  const body = await response.text();
  await new Promise((resolve) => processor.close(resolve));
  if (proxy.listening) await new Promise((resolve) => proxy.close(resolve));
  if (response.status !== 202) throw new Error(`expected proxy to return processor status 202, got ${response.status}`);
  if (body !== '{"ok":true,"observed":"/webhooks/nuvei"}') throw new Error(`unexpected processor body: ${body}`);
  if (received?.method !== 'POST' || received?.url !== '/webhooks/nuvei') throw new Error('proxy did not preserve method or target webhook path');
  if (received?.contentType !== 'application/x-www-form-urlencoded') throw new Error('proxy did not preserve content-type');
  if (!received?.body.includes('merchant_id=merchant-test')) throw new Error('proxy did not preserve body');
  const rawFiles = fs.readdirSync(selfCheckRawRoot);
  for (const expected of ['request.json', 'request.body', 'processor-response.json', 'processor-response.body']) {
    if (!rawFiles.some((file) => file.endsWith(expected))) throw new Error(`missing raw ${expected}`);
  }
  console.log('stage C DMN proxy self-check passed');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfCheck) {
    await runSelfCheck();
    return;
  }
  const rawRoot = path.resolve(args.rawRoot);
  if (!isInside(rawRoot, path.resolve(REPO_ROOT, RAW_WORKSPACE))) {
    throw new Error(`refusing to write raw DMNs outside ${RAW_WORKSPACE}: ${rawRoot}`);
  }
  const server = createDmnProxyServer({
    processorUrl: args.processorUrl,
    rawRoot,
    once: args.once,
  });
  await new Promise((resolve) => server.listen(args.port, resolve));
  console.log(`DMN observer listening on http://localhost:${args.port}`);
  console.log(`Forwarding DMNs to ${new URL('/webhooks/nuvei', args.processorUrl).toString()}`);
  console.log(`Writing raw captures under ${path.relative(REPO_ROOT, rawRoot)}/`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
