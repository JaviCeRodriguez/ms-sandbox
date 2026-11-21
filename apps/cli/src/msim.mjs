#!/usr/bin/env node
/**
 * msim — Stage 0 CLI stub (Compose + migrate + health).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const [cmd, ...args] = process.argv.slice(2);

function run(command, commandArgs, opts = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    shell: true,
    cwd: root,
    ...opts,
  });
  process.exit(result.status ?? 1);
}

switch (cmd) {
  case "up":
    run("docker", ["compose", "up", "-d", ...args]);
    break;
  case "down":
    run("docker", ["compose", "down", ...args]);
    break;
  case "migrate":
    run("pnpm", ["--filter", "@ms-sandbox/core", "migrate"]);
    break;
  case "health": {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const res = await fetch("https://localhost:8443/health");
    console.log(await res.json());
    break;
  }
  case "help":
  case undefined:
    console.log(`msim (Stage 0 stub)

  msim up          docker compose up -d
  msim down        docker compose down
  msim migrate     run Postgres migrations
  msim health      GET /health on local API

More seed/snapshot/fault commands land as Stage 0 progresses.`);
    break;
  default:
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
}
