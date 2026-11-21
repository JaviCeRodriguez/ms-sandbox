import { serve } from "@hono/node-server";
import { createServer } from "node:https";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDirectoryStore,
  createFaultStore,
  createRequestLogStore,
  createSnapshotStore,
  createTenantStore,
  migrate,
  type DirectoryStore,
  type FaultStore,
  type RequestLogStore,
  type SnapshotStore,
  type TenantStore,
} from "@ms-sandbox/core";
import { createApp } from "./app.js";
import { loadOrCreateSigningKeys } from "./keys.js";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const SPA_APP_ID = "cccccccc-cccc-cccc-cccc-ccccccccccc1";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const keyPath = join(root, "data/tls/localhost-key.pem");
const certPath = join(root, "data/tls/localhost.pem");
const snapshotsDir = join(root, "data/snapshots");

if (!existsSync(keyPath) || !existsSync(certPath)) {
  console.error("Missing TLS certs. Run: pnpm certs  (and once: mkcert -install)");
  process.exit(1);
}

const publicOrigin = process.env.PUBLIC_ORIGIN ?? "https://localhost:8443";
const port = Number(process.env.PORT ?? 8443);

let tenants: TenantStore | null = null;
let requests: RequestLogStore | null = null;
let faults: FaultStore | null = null;
let snapshots: SnapshotStore | null = null;
let directory: DirectoryStore | null = null;

if (process.env.DATABASE_URL) {
  try {
    await migrate(process.env.DATABASE_URL);
    mkdirSync(snapshotsDir, { recursive: true });
    tenants = createTenantStore(process.env.DATABASE_URL);
    requests = createRequestLogStore(process.env.DATABASE_URL);
    faults = createFaultStore(process.env.DATABASE_URL);
    snapshots = createSnapshotStore(snapshotsDir, process.env.DATABASE_URL);
    directory = createDirectoryStore(process.env.DATABASE_URL);
    await directory.ensureContosoDemo();
    console.log("Postgres ready (platform + Entra directory)");
  } catch (err) {
    console.warn("DATABASE_URL set but migrate/connect failed:", err);
  }
} else {
  console.warn("DATABASE_URL not set — set it for Stage 0/1 features");
}

const keys = await loadOrCreateSigningKeys();
const app = createApp(keys, publicOrigin, { tenants, requests, faults, snapshots, directory });

serve(
  {
    fetch: app.fetch,
    createServer,
    serverOptions: {
      key: readFileSync(keyPath),
      cert: readFileSync(certPath),
    },
    port,
  },
  (info) => {
    console.log(`ms-sandbox API listening on https://localhost:${info.port}`);
    console.log(`authority: ${publicOrigin}/${TENANT_ID}`);
    console.log(`panel admin: admin@local / Password1!`);
    console.log(`SPA clientId: ${SPA_APP_ID}`);
    console.log(`daemon: dddddddd-dddd-dddd-dddd-ddddddddddd1 / DaemonSecret1!`);
    console.log(`user login: alice@contoso.test / Password1!`);
  },
);
