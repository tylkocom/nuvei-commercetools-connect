#!/usr/bin/env node
/**
 * Tunnel setup for receiving real Nuvei DMN webhooks locally.
 *
 * Nuvei sends DMNs to a public HTTPS URL. This script creates a tunnel
 * from a public URL to your local processor webhook endpoint,
 * then prints the URL you need to paste into the Nuvei dashboard.
 *
 * Prerequisites:
 *   npm install --prefix examples/nuvei-web-ui ngrok
 *   # OR use localtunnel (free, no account):
 *   npm install --prefix examples/nuvei-web-ui localtunnel
 *
 * Usage:
 *   node examples/nuvei-web-ui/start-dmn-tunnel.mjs
 *
 * Then copy the printed HTTPS URL into:
 *   Nuvei Dashboard > Settings > My Integration Settings > DMN URL
 */

import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EXAMPLE_DIR = dirname(fileURLToPath(import.meta.url));

const PROCESSOR_WEBHOOK_PORT = process.env.PROCESSOR_WEBHOOK_PORT ?? "8080";
const TUNNEL_PROVIDER = process.env.TUNNEL_PROVIDER ?? "localtunnel"; // "ngrok" or "localtunnel"

console.log("=".repeat(60));
console.log("Nuvei DMN Tunnel Setup");
console.log("=".repeat(60));
console.log(`Forwarding public URL → http://localhost:${PROCESSOR_WEBHOOK_PORT}/webhooks/nuvei`);
console.log("");

if (TUNNEL_PROVIDER === "ngrok") {
  console.log("Starting ngrok tunnel...");
  console.log("(Make sure you ran: npm install --prefix examples/nuvei-web-ui ngrok)");
  console.log("");

  const ngrok = spawn("npx", ["ngrok", "http", PROCESSOR_WEBHOOK_PORT, "--url", "nuvei-dmn-test"], {
    cwd: EXAMPLE_DIR,
    stdio: "inherit",
  });

  ngrok.on("error", (err) => {
    console.error("Failed to start ngrok:", err.message);
    console.error("\nInstall it with:");
    console.error("  npm install --prefix examples/nuvei-web-ui ngrok");
    console.error("\nOr use localtunnel instead:");
    console.error("  TUNNEL_PROVIDER=localtunnel node examples/nuvei-web-ui/start-dmn-tunnel.mjs");
    process.exit(1);
  });

  process.on("SIGINT", () => {
    ngrok.kill();
    process.exit(0);
  });
} else if (TUNNEL_PROVIDER === "localtunnel") {
  console.log("Starting localtunnel...");
  console.log("(Make sure you ran: npm install --prefix examples/nuvei-web-ui localtunnel)");
  console.log("");

  try {
    const localtunnel = await import("localtunnel");
    const tunnel = await localtunnel.default({
      port: Number(PROCESSOR_WEBHOOK_PORT),
      subdomain: `nuvei-dmn-${Math.random().toString(36).slice(2, 8)}`,
    });

    const dmnUrl = `${tunnel.url}/webhooks/nuvei`;

    console.log("✅ Tunnel established!");
    console.log("");
    console.log("=".repeat(60));
    console.log("PASTE THIS URL INTO THE NUVEI DASHBOARD:");
    console.log(dmnUrl);
    console.log("=".repeat(60));
    console.log("");
    console.log("Dashboard path:");
    console.log("  Settings > My Integration Settings > DMN URL");
    console.log("");
    console.log("Press Ctrl+C to stop the tunnel.");

    tunnel.on("close", () => {
      console.log("\nTunnel closed.");
      process.exit(0);
    });

    tunnel.on("error", (err) => {
      console.error("Tunnel error:", err.message);
    });

    process.on("SIGINT", () => {
      tunnel.close();
    });
  } catch (err) {
    console.error("Failed to start localtunnel:", err.message);
    console.error("\nInstall it with:");
    console.error("  npm install --prefix examples/nuvei-web-ui localtunnel");
    process.exit(1);
  }
} else {
  console.error(`Unknown tunnel provider: ${TUNNEL_PROVIDER}`);
  console.error("Use 'ngrok' or 'localtunnel'");
  process.exit(1);
}
