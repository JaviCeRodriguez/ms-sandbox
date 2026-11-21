import { Hono } from "hono";
import { cors } from "hono/cors";
import type {
  DirectoryStore,
  FaultStore,
  RequestLogStore,
  SnapshotStore,
  TenantStore,
} from "@ms-sandbox/core";
import { getMetrics } from "@ms-sandbox/core";
import { adminAuthMiddleware } from "./admin-auth.js";
import { createEntraAdminRoutes } from "./entra-admin-routes.js";
import { createGraphRoutes } from "./graph-routes.js";
import type { SigningKeys } from "./keys.js";
import { createOidcRoutes } from "./oidc-routes.js";
import { observabilityMiddleware } from "./observability.js";
import { createPlatformRoutes } from "./platform-routes.js";

export type PlatformDeps = {
  tenants: TenantStore | null;
  requests: RequestLogStore | null;
  faults: FaultStore | null;
  snapshots: SnapshotStore | null;
  directory: DirectoryStore | null;
};

export function createApp(
  keys: SigningKeys,
  publicOrigin: string,
  platform: PlatformDeps = {
    tenants: null,
    requests: null,
    faults: null,
    snapshots: null,
    directory: null,
  },
) {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ],
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    }),
  );

  app.use("*", observabilityMiddleware(platform));
  app.use("*", adminAuthMiddleware());

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "ms-sandbox-api",
      database: platform.tenants ? "connected" : "unavailable",
      directory: platform.directory ? "connected" : "unavailable",
      metrics: getMetrics(),
    }),
  );

  app.route(
    "/",
    createPlatformRoutes({
      publicOrigin,
      tenants: platform.tenants,
      requests: platform.requests,
      faults: platform.faults,
      snapshots: platform.snapshots,
      directory: platform.directory,
    }),
  );
  app.route("/", createOidcRoutes({ keys, publicOrigin, tenants: platform.tenants, directory: platform.directory }));
  app.route("/", createGraphRoutes({ keys, publicOrigin, directory: platform.directory }));
  app.route("/", createEntraAdminRoutes({ keys, publicOrigin, directory: platform.directory }));

  return app;
}
