#!/usr/bin/env node
/**
 * Full release pipeline for the Nuvei commercetools Connect connector.
 *
 * Steps:
 *   1. Reads the latest git tag from the current repository.
 *   2. Updates (or creates) the ConnectorStaged with the new tag and integration type.
 *   3. Publishes the staged connector and waits for it to be Published.
 *   4. Lists existing deployments and deletes those referencing the old connector version.
 *   5. Creates a new sandbox deployment with the published connector.
 *   6. Polls the deployment status every 20s until terminal.
 *   7. Reports total elapsed time.
 *
 * Usage:
 *   node scripts/release-connector.mjs
 *   node scripts/release-connector.mjs --deploy-only
 *
 * Prerequisites:
 *   npm install -g @commercetools/cli
 *   The working directory must be inside a git repository with at least one tag.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

// ─── Configuration ───────────────────────────────────────────────────────────

const CONNECTOR_KEY = "nuvei";
const CREATOR_EMAIL = "nuvei@tylko.dev";
const CONNECTOR_NAME = "Nuvei";
const INTEGRATION_TYPES = "psp";
const DEPLOYMENT_TYPE = "sandbox";
const POLL_INTERVAL_SECONDS = 20;
const MAX_POLL_ATTEMPTS = 60; // 20 minutes

// ─── Helpers ───────────────────────────────────────────────────────────────

function loadEnv(path = ".env") {
  const envPath = resolve(path);
  const content = readFileSync(envPath, "utf8");
  const env = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function extractRegion(authUrl) {
  try {
    const url = new URL(authUrl);
    const parts = url.hostname.split(".");
    if (parts.length >= 4) {
      return parts.slice(1, -2).join(".");
    }
  } catch {
    // ignore
  }
  return null;
}

function sleepSync(seconds) {
  try {
    execSync(`sleep ${seconds}`, { stdio: "ignore" });
  } catch {
    const end = Date.now() + seconds * 1000;
    while (Date.now() < end) {
      // busy wait
    }
  }
}

function run(command, options = {}) {
  console.log(`\n> ${command}\n`);
  try {
    return execSync(command, { encoding: "utf8", stdio: "inherit", ...options });
  } catch (e) {
    if (options.ignoreError) {
      console.log(`Command failed (ignored): ${e.message || ""}`);
      return null;
    }
    throw e;
  }
}

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}

function runSilent(command) {
  try {
    const output = execSync(command, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return stripAnsi(output);
  } catch {
    return null;
  }
}

function deleteDeployment(deleteFlag) {
  const command = `printf "y\\n" | commercetools connect deployment delete ${deleteFlag}`;
  console.log(`\n> ${command}\n`);
  try {
    const output = execSync(command, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const clean = stripAnsi(output);
    // Print only the success line if present
    const successLine = clean.match(/Deployment .* has been successfully deleted/);
    if (successLine) {
      console.log(successLine[0]);
    }
    return true;
  } catch (e) {
    const clean = stripAnsi(e.stdout || "");
    const errMatch = clean.match(/Error:\s*(.+)/);
    const reason = errMatch ? errMatch[1].trim() : (e.message || "unknown error");
    console.log(`Command failed (ignored): ${reason}`);
    return false;
  }
}

function getLatestGitTag() {
  const output = runSilent("git describe --tags --abbrev=0");
  if (!output) {
    console.error("Error: Could not determine latest git tag. Ensure the repository has at least one tag.");
    process.exit(1);
  }
  return output.trim();
}

function getGitRemoteUrl() {
  const output = runSilent("git remote get-url origin");
  if (!output) {
    console.error("Error: Could not determine git remote URL. Ensure 'origin' remote is configured.");
    process.exit(1);
  }
  return output.trim();
}

function listDeploymentsViaCli() {
  const output = runSilent("commercetools connect deployment list");
  if (!output) return [];

  const deployments = [];
  const lines = output.split("\n");

  for (const line of lines) {
    // Parse table rows like:
    // 667e1513-1972-4efd-954c-ecfc49b9f3a3        4    Deployed
    // ID                                   KEY VERSION STATUS
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("ID") || trimmed.startsWith("Showing")) continue;

    // First 36 chars (or first token) is the UUID
    const idMatch = trimmed.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
    if (idMatch) {
      deployments.push({ id: idMatch[1] });
    }
  }

  return deployments;
}

function getDeploymentConnectorKey(deploymentId) {
  const output = runSilent(`commercetools connect deployment describe --id ${deploymentId}`);
  if (!output) return null;

  const connectorKeyMatch = output.match(/connector:\s*\{[\s\S]*?key:\s*'([^']+)'/);
  if (connectorKeyMatch) return connectorKeyMatch[1];

  const altMatch = output.match(/"key":\s*"([^"]+)"/);
  if (altMatch) return altMatch[1];

  return null;
}

function findDeploymentsByConnector(connectorKey, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    const deployments = listDeploymentsViaCli();
    const matching = [];

    for (const dep of deployments) {
      const depConnectorKey = getDeploymentConnectorKey(dep.id);
      if (depConnectorKey === connectorKey) {
        // Get full status
        const output = runSilent(`commercetools connect deployment describe --id ${dep.id}`);
        const statusMatch = output?.match(/status:\s*['"]?(\w+)['"]?/i);
        matching.push({
          id: dep.id,
          key: null,
          status: statusMatch ? statusMatch[1] : "unknown",
        });
      }
    }

    if (matching.length > 0) {
      return matching;
    }

    if (i < maxRetries - 1) {
      console.log(`No deployments for connector '${connectorKey}' found yet, retrying in ${POLL_INTERVAL_SECONDS}s...`);
      sleepSync(POLL_INTERVAL_SECONDS);
    }
  }

  return [];
}

function buildConfigFlags(env) {
  const flags = [];
  const configKeys = [
    "CTP_PROJECT_KEY",
    "CTP_AUTH_URL",
    "CTP_API_URL",
    "CTP_SESSION_URL",
    "CTP_JWKS_URL",
    "CTP_JWT_ISSUER",
    "CTP_CHECKOUT_URL",
    "NUVEI_ENV",
    "NUVEI_MERCHANT_ID",
    "NUVEI_MERCHANT_SITE_ID",
    "NUVEI_API_BASE_URL",
    "NUVEI_DMN_CHECKSUM_ALGORITHM",
    "CORS_ALLOWED_ORIGINS",
    "CTP_CLIENT_ID",
    "CTP_CLIENT_SECRET",
    "NUVEI_SECRET_KEY",
  ];

  for (const key of configKeys) {
    const value = env[key];
    if (value && value.trim().length > 0) {
      flags.push(`--configuration processor.${key}=${value}`);
    }
  }

  return flags;
}

function extractDeploymentIdFromOutput(stdout) {
  const idMatch = stdout.match(/ID:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i) ||
                  stdout.match(/"id":\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/);
  return idMatch ? idMatch[1] : null;
}

function extractDeploymentKeyFromOutput(stdout) {
  const keyMatch = stdout.match(/key:\s*([A-Za-z0-9_-]+)/i) ||
                  stdout.match(/"key":\s*"([A-Za-z0-9_-]+)"/);
  return keyMatch ? keyMatch[1] : null;
}

function pollDeploymentStatus(targetRef, region, isId = false) {
  console.log(`\nPolling deployment ${isId ? "id" : "key"}=${targetRef} every ${POLL_INTERVAL_SECONDS}s until terminal...\n`);

  const terminalStates = ["Deployed", "Failed", "UndeployFailed"];
  const describeFlag = isId ? `--id ${targetRef}` : `--key ${targetRef}`;

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    const output = runSilent(`commercetools connect deployment describe ${describeFlag}`);

    if (!output) {
      console.log(`Attempt ${attempt}: unable to fetch status, retrying in ${POLL_INTERVAL_SECONDS}s...`);
      sleepSync(POLL_INTERVAL_SECONDS);
      continue;
    }

    const statusMatch = output.match(/status:\s*['"']?(\w+)['"']?/i);
    if (statusMatch) {
      const status = statusMatch[1];
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Status: ${status}`);

      if (terminalStates.includes(status)) {
        console.log(`\nDeployment reached terminal state: ${status}`);
        return status === "Deployed";
      }
    } else {
      console.log(`Attempt ${attempt}: could not parse status, retrying in ${POLL_INTERVAL_SECONDS}s...`);
    }

    if (attempt < MAX_POLL_ATTEMPTS) {
      sleepSync(POLL_INTERVAL_SECONDS);
    }
  }

  console.error(`\nTimed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_SECONDS} seconds.`);
  return false;
}

function pollConnectorPublished(connectorKey, region) {
  console.log(`\nPolling connector '${connectorKey}' publish status every ${POLL_INTERVAL_SECONDS}s until Published...\n`);

  const terminalStates = ["Published", "Failed"];

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    const output = runSilent(`commercetools connect connectorstaged describe --key ${connectorKey}`);

    if (!output) {
      console.log(`Attempt ${attempt}: unable to fetch connector status, retrying in ${POLL_INTERVAL_SECONDS}s...`);
      sleepSync(POLL_INTERVAL_SECONDS);
      continue;
    }

    const statusMatch = output.match(/status:\s*['"']?(\w+)['"']?/i);
    if (statusMatch) {
      const status = statusMatch[1];
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Connector status: ${status}`);

      if (terminalStates.includes(status)) {
        console.log(`\nConnector reached terminal state: ${status}`);
        return status === "Published";
      }
    } else {
      console.log(`Attempt ${attempt}: could not parse connector status, retrying in ${POLL_INTERVAL_SECONDS}s...`);
    }

    if (attempt < MAX_POLL_ATTEMPTS) {
      sleepSync(POLL_INTERVAL_SECONDS);
    }
  }

  console.error(`\nTimed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_SECONDS} seconds.`);
  return false;
}

function formatDuration(ms) {
  const sec = (ms / 1000).toFixed(1);
  return `${sec}s`;
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const deployOnly = args.includes("--deploy-only");

  const pipelineStart = Date.now();

  console.log("=== Nuvei Connector Release Pipeline ===\n");

  if (deployOnly) {
    console.log("Flag --deploy-only set: skipping tag update and publish.\n");
  }

  // 1. Latest git tag (skip if deploy-only)
  let latestTag = "";
  if (!deployOnly) {
    latestTag = getLatestGitTag();
    console.log(`Latest git tag: ${latestTag}`);
  }

  // 2. Load .env
  const env = loadEnv();
  if (!env.CTP_CLIENT_ID || !env.CTP_CLIENT_SECRET || !env.CTP_PROJECT_KEY || !env.CTP_AUTH_URL) {
    console.error("Error: Missing required environment variables in .env file:");
    console.error("  CTP_CLIENT_ID, CTP_CLIENT_SECRET, CTP_PROJECT_KEY, CTP_AUTH_URL");
    process.exit(1);
  }

  const region = extractRegion(env.CTP_AUTH_URL);
  if (!region) {
    console.error(`Error: Could not extract region from CTP_AUTH_URL: ${env.CTP_AUTH_URL}`);
    process.exit(1);
  }

  // 3. Verify CLI
  try {
    execSync("commercetools --version", { stdio: "ignore" });
  } catch {
    console.error("Error: commercetools CLI is not installed or not in PATH.");
    console.error("Install it with: npm install -g @commercetools/cli");
    process.exit(1);
  }

  // 4. Authenticate
  run(
    [
      "commercetools auth login",
      "--client-credentials",
      `--client-id ${env.CTP_CLIENT_ID}`,
      `--client-secret ${env.CTP_CLIENT_SECRET}`,
      `--region ${region}`,
      `--project-key ${env.CTP_PROJECT_KEY}`,
    ].join(" ")
  );

  if (!deployOnly) {
    // 5. Update (or create) ConnectorStaged
    const step1Start = Date.now();
    console.log(`\n--- Step 1: Update ConnectorStaged '${CONNECTOR_KEY}' to tag ${latestTag} ---`);
    const updateCommand = [
      "commercetools connect connectorstaged update",
      `--key ${CONNECTOR_KEY}`,
      `--repository-tag ${latestTag}`,
      `--integration-types ${INTEGRATION_TYPES}`,
    ].join(" ");

    try {
      run(updateCommand);
    } catch {
      console.log("\nUpdate failed; attempting to create ConnectorStaged...\n");
      const repoUrl = getGitRemoteUrl();
      const createCommand = [
        "commercetools connect connectorstaged create",
        `--key ${CONNECTOR_KEY}`,
        `--repository-url ${repoUrl}`,
        `--repository-tag ${latestTag}`,
        `--name "${CONNECTOR_NAME}"`,
        `--creator-email ${CREATOR_EMAIL}`,
        `--integration-types ${INTEGRATION_TYPES}`,
      ].join(" ");
      run(createCommand);
    }
    console.log(`Step 1 completed in ${formatDuration(Date.now() - step1Start)}`);

    // 6. Publish
    const step2Start = Date.now();
    console.log(`\n--- Step 2: Publish ConnectorStaged '${CONNECTOR_KEY}' ---`);
    const publishCommand = `commercetools connect connectorstaged publish --key ${CONNECTOR_KEY}`;
    run(publishCommand, { ignoreError: true });

    // Wait for publish to complete
    const published = pollConnectorPublished(CONNECTOR_KEY, region);
    if (!published) {
      console.error("\nConnector publication did not reach Published state. Aborting.");
      process.exit(1);
    }
    console.log(`Step 2 completed in ${formatDuration(Date.now() - step2Start)}`);
  }

  // 7. Find and delete old deployments
  const step3Start = Date.now();
  console.log(`\n--- Step 3: Find existing deployments referencing '${CONNECTOR_KEY}' ---`);
  const oldDeployments = findDeploymentsByConnector(CONNECTOR_KEY);

  if (oldDeployments.length === 0) {
    console.log("No existing deployments found.");
  } else {
    console.log(`Found ${oldDeployments.length} deployment(s) to delete:`);
    for (const dep of oldDeployments) {
      console.log(`  - ${dep.key || dep.id} (${dep.status})`);
    }

    console.log("\n--- Step 4: Delete old deployments ---");
    const step4Start = Date.now();
    for (const dep of oldDeployments) {
      const deleteFlag = dep.key ? `--key ${dep.key}` : `--id ${dep.id}`;
      deleteDeployment(deleteFlag);
    }
    console.log(`Step 4 completed in ${formatDuration(Date.now() - step4Start)}`);
  }
  console.log(`Step 3 completed in ${formatDuration(Date.now() - step3Start)}`);

  // 8. Create new deployment
  const step5Start = Date.now();
  console.log(`\n--- Step 5: Create new deployment ---`);
  const deployCommandParts = [
    "commercetools connect deployment create",
    `--region ${region}`,
    `--connector-key ${CONNECTOR_KEY}`,
    `--type ${DEPLOYMENT_TYPE}`,
    ...buildConfigFlags(env),
  ];
  const deployCommand = deployCommandParts.join(" ");

  let deploymentKey = null;
  let deploymentId = null;
  try {
    const stdout = execSync(deployCommand, {
      encoding: "utf8",
      stdio: ["inherit", "pipe", "inherit"],
    });
    console.log(stdout);

    deploymentKey = extractDeploymentKeyFromOutput(stdout);
    deploymentId = extractDeploymentIdFromOutput(stdout);
  } catch {
    console.error("\nDeployment creation failed.");
    process.exit(1);
  }
  console.log(`Step 5 completed in ${formatDuration(Date.now() - step5Start)}`);

  // 9. Poll for completion
  const step6Start = Date.now();
  console.log(`\n--- Step 6: Poll deployment status ---`);
  if (deploymentKey) {
    const success = pollDeploymentStatus(deploymentKey, region);
    if (!success) process.exit(1);
  } else if (deploymentId) {
    const success = pollDeploymentStatus(deploymentId, region, true);
    if (!success) process.exit(1);
  } else {
    console.log("No deployment key or ID found in output; skipping poll.");
  }
  console.log(`Step 6 completed in ${formatDuration(Date.now() - step6Start)}`);

  // 10. Report elapsed time
  const elapsedMs = Date.now() - pipelineStart;
  const elapsedSec = (elapsedMs / 1000).toFixed(1);
  console.log(`\n=== Pipeline completed in ${elapsedSec}s ===`);
}

main().catch((err) => {
  console.error("\nUnexpected error:", err.message);
  process.exit(1);
});
