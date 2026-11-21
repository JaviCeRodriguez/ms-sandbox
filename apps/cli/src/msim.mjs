#!/usr/bin/env node
/**
 * msim — Stage 0 CLI (Compose, migrate, seed, faults, health).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const API = process.env.MSIM_API_ORIGIN ?? "https://localhost:8443";
const [cmd, sub, ...args] = process.argv.slice(2);

function run(command, commandArgs, opts = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    shell: true,
    cwd: root,
    ...opts,
  });
  process.exit(result.status ?? 1);
}

async function api(path, init) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const res = await fetch(`${API}${path}`, init);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    console.error(res.status, body);
    process.exit(1);
  }
  console.log(JSON.stringify(body, null, 2));
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
  case "health":
    await api("/health");
    break;
  case "seed":
    if (sub === "apply") {
      const file = args[0] ?? "seeds/tenants.yaml";
      const doc = parseYaml(readFileSync(resolve(root, file), "utf8"));
      await api("/admin/v1/seeds:apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(doc),
      });
    } else {
      console.error("Usage: msim seed apply [file]");
      process.exit(1);
    }
    break;
  case "faults":
    if (sub === "set") {
      // msim faults set --path '/v1.0/devPlaceholder' --status 429
      const pathIdx = args.indexOf("--path");
      const statusIdx = args.indexOf("--status");
      const pathGlob = pathIdx >= 0 ? args[pathIdx + 1] : null;
      const status = statusIdx >= 0 ? Number(args[statusIdx + 1]) : null;
      if (!pathGlob || !status) {
        console.error("Usage: msim faults set --path <glob> --status <code>");
        process.exit(1);
      }
      await api("/admin/v1/faults", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pathGlob,
          status,
          retryAfter: status === 429 ? 1 : null,
          oneShot: true,
        }),
      });
    } else if (sub === "list" || !sub) {
      await api("/admin/v1/faults");
    } else {
      console.error("Usage: msim faults set|list");
      process.exit(1);
    }
    break;
  case "help":
  case undefined:
    console.log(`msim (Stage 0)

  msim up / down / migrate / health
  msim seed apply [seeds/tenants.yaml]
  msim faults set --path '/v1.0/devPlaceholder' --status 429
  msim faults list`);
    break;
  default:
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
}
