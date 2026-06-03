import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const packageRoot = new URL("..", import.meta.url);
const enablerEntry = new URL("../enabler/src/index.ts", packageRoot);

if (!existsSync(enablerEntry)) {
  process.argv.push("--exclude", "test/unit/contract/**");
}

const vitestArgs = ["run"];

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];

  if (arg === "--collectCoverageFrom") {
    index += 1;
    continue;
  }

  if (arg.startsWith("--collectCoverageFrom=")) {
    continue;
  }

  if (arg === "--coverageReporters") {
    const reporter = process.argv[index + 1];
    if (reporter) {
      vitestArgs.push(`--coverage.reporter=${reporter}`);
      index += 1;
    }
    continue;
  }

  if (arg.startsWith("--coverageReporters=")) {
    vitestArgs.push(`--coverage.reporter=${arg.slice("--coverageReporters=".length)}`);
    continue;
  }

  vitestArgs.push(arg);
}

const command = process.platform === "win32" ? "vitest.cmd" : "vitest";
const result = spawnSync(command, vitestArgs, {
  cwd: packageRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
