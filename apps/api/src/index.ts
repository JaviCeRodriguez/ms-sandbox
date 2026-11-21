import { serve } from "@hono/node-server";
import { createServer } from "node:https";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { loadOrCreateSigningKeys } from "./keys.js";
import { TENANT_ID, SPA_APP_ID } from "./seed.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const keyPath = join(root, "data/tls/localhost-key.pem");
const certPath = join(root, "data/tls/localhost.pem");

if (!existsSync(keyPath) || !existsSync(certPath)) {
  console.error("Missing TLS certs. Run: pnpm certs  (and once: mkcert -install)");
  process.exit(1);
}

const publicOrigin = process.env.PUBLIC_ORIGIN ?? "https://localhost:8443";
const port = Number(process.env.PORT ?? 8443);

const keys = await loadOrCreateSigningKeys();
const app = createApp(keys, publicOrigin);

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
    console.log(`discovery: ${publicOrigin}/${TENANT_ID}/v2.0/.well-known/openid-configuration`);
    console.log(`demo clientId: ${SPA_APP_ID}`);
    console.log(`login: alice@contoso.test / Password1!`);
  },
);
