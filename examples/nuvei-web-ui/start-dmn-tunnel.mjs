#!/usr/bin/env node
/**
 * Tunnel setup for receiving real Nuvei DMN webhooks locally.
 *
 * Nuvei sends DMNs to a public HTTPS URL. This script exposes the local
 * Stage C DMN observer, which then records raw requests in the gitignored
 * workspace and forwards them to the processor /webhooks/nuvei route.
 *
 * No tunnel provider is downloaded at runtime. Use an installed ngrok binary
 * or a package-local localtunnel dependency that already exists.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const DMN_OBSERVER_PORT = process.env.DMN_OBSERVER_PORT ?? process.env.PROCESSOR_WEBHOOK_PORT ?? '8090';
const PROCESSOR_URL = process.env.PROCESSOR_URL ?? 'http://localhost:8080';
const TUNNEL_PROVIDER = process.env.TUNNEL_PROVIDER ?? 'ngrok';
const NGROK_BIN = process.env.NGROK_BIN ?? 'ngrok';
const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const DASHBOARD_PATH = 'Nuvei Dashboard > Settings > My Integration Settings > DMN URL';
const LOCAL_OBSERVER_URL = `http://localhost:${DMN_OBSERVER_PORT}`;
const LOCAL_FORWARD_TARGET = new URL('/webhooks/nuvei', PROCESSOR_URL).toString();

function printHeader() {
  console.log('='.repeat(60));
  console.log('Nuvei DMN Tunnel Setup');
  console.log('='.repeat(60));
  console.log(`Provider: ${TUNNEL_PROVIDER}`);
  console.log(`Public tunnel target → ${LOCAL_OBSERVER_URL}`);
  console.log(`Observer forwards → ${LOCAL_FORWARD_TARGET}`);
  console.log('Dashboard DMN URL must end with: /webhooks/nuvei');
  console.log(`Dashboard path: ${DASHBOARD_PATH}`);
  console.log('');
}

function printDryRun(command, publicUrlShape) {
  printHeader();
  console.log('Dry run only; no tunnel process started.');
  console.log(`Command: ${command.join(' ')}`);
  console.log(`Dashboard DMN URL shape: ${publicUrlShape}/webhooks/nuvei`);
  console.log(`Local observer: ${LOCAL_OBSERVER_URL}`);
  console.log(`Processor webhook: ${LOCAL_FORWARD_TARGET}`);
}

function spawnTunnel(command, args) {
  printHeader();
  console.log(`Starting ${TUNNEL_PROVIDER} tunnel with installed binary/dependency...`);
  const child = spawn(command, args, { stdio: 'inherit' });
  child.on('error', (error) => {
    console.error(`Failed to start ${TUNNEL_PROVIDER}: ${error.message}`);
    if (TUNNEL_PROVIDER === 'ngrok') {
      console.error('Install and authenticate ngrok outside this script, or set NGROK_BIN to an existing binary.');
    }
    process.exit(1);
  });
  process.on('SIGINT', () => {
    child.kill();
    process.exit(0);
  });
}

async function runNgrok() {
  const command = [NGROK_BIN, 'http', DMN_OBSERVER_PORT];
  if (DRY_RUN) {
    printDryRun(command, 'https://<ngrok-public-host>');
    return;
  }
  spawnTunnel(NGROK_BIN, ['http', DMN_OBSERVER_PORT]);
}

async function runLocaltunnel() {
  let localtunnel;
  try {
    localtunnel = await import('localtunnel');
  } catch {
    try {
      require.resolve('localtunnel');
      localtunnel = await import('localtunnel');
    } catch {
      throw new Error('localtunnel is not installed in examples/nuvei-web-ui; refusing runtime install or npx download');
    }
  }

  if (DRY_RUN) {
    printDryRun(['localtunnel', '--port', DMN_OBSERVER_PORT], 'https://<localtunnel-public-host>');
    return;
  }

  printHeader();
  const tunnel = await localtunnel.default({
    port: Number(DMN_OBSERVER_PORT),
    subdomain: `nuvei-dmn-${Math.random().toString(36).slice(2, 8)}`,
  });
  console.log('Tunnel established.');
  console.log('='.repeat(60));
  console.log('PASTE THIS URL INTO THE NUVEI DASHBOARD:');
  console.log(`${tunnel.url}/webhooks/nuvei`);
  console.log('='.repeat(60));
  console.log('Press Ctrl+C to stop the tunnel.');

  tunnel.on('close', () => {
    console.log('\nTunnel closed.');
    process.exit(0);
  });
  tunnel.on('error', (error) => {
    console.error(`Tunnel error: ${error.message}`);
  });
  process.on('SIGINT', () => tunnel.close());
}

async function main() {
  if (TUNNEL_PROVIDER === 'ngrok') {
    await runNgrok();
    return;
  }
  if (TUNNEL_PROVIDER === 'localtunnel') {
    await runLocaltunnel();
    return;
  }
  throw new Error(`Unknown tunnel provider: ${TUNNEL_PROVIDER}; use ngrok or localtunnel`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
