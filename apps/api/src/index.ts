import { serve } from "@hono/node-server";
import { createServer } from "node:https";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createFaultStore,
  createRequestLogStore,
  createSnapshotStore,
  createTenantStore,
  migrate,
  type FaultStore,
  type RequestLogStore,
  type SnapshotStore,
  type TenantStore,
} from "@ms-sandbox/core";
import { createApp } from "./app.js";
import { loadOrCreateSigningKeys } from "./keys.js";
import { TENANT_ID, SPA_APP_ID } from "./seed.js";

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

if (process.env.DATABASE_URL) {
  try {
    await migrate(process.env.DATABASE_URL);
    mkdirSync(snapshotsDir, { recursive: true });
    tenants = createTenantStore(process.env.DATABASE_URL);
    requests = createRequestLogStore(process.env.DATABASE_URL);
    faults = createFaultStore(process.env.DATABASE_URL);
    snapshots = createSnapshotStore(snapshotsDir, process.env.DATABASE_URL);
    if (!(await tenants.get(TENANT_ID))) {
      await tenants.create({
        id: TENANT_ID,
        displayName: "Contoso Ltd",
        defaultDomain: "contoso.test",
      });
    }
    console.log("Postgres ready (tenants + requests + faults + snapshots)");
  } catch (err) {
    console.warn("DATABASE_URL set but migrate/connect failed:", err);
    tenants = null;
    requests = null;
    faults = null;
    snapshots = null;
  }
} else {
  console.warn("DATABASE_URL not set — admin platform APIs return 503; OIDC spike still works");
}

const keys = await loadOrCreateSigningKeys();
const app = createApp(keys, publicOrigin, { tenants, requests, faults, snapshots });

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
    console.log(`demo clientId: ${SPA_APP_ID}`);
    console.log(`login: alice@contoso.test / Password1!`);
  },
);
