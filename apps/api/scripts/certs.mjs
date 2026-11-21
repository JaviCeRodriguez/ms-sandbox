import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const tlsDir = join(root, "data/tls");
mkdirSync(tlsDir, { recursive: true });

const key = join(tlsDir, "localhost-key.pem");
const cert = join(tlsDir, "localhost.pem");

if (existsSync(key) && existsSync(cert)) {
  console.log("TLS certs already exist in data/tls/");
  process.exit(0);
}

const result = spawnSync(
  "mkcert",
  ["-key-file", key, "-cert-file", cert, "localhost", "127.0.0.1", "::1"],
  { stdio: "inherit", shell: true },
);

if (result.status !== 0) {
  console.error("mkcert failed. Install it and optionally run: mkcert -install");
  process.exit(result.status ?? 1);
}
