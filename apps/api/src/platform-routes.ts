import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import {
  applyOData,
  graphError,
  handleJsonBatch,
  parseODataQuery,
  type BatchRequest,
} from "@ms-sandbox/odata";
import {
  applyTenantSeed,
  getMetrics,
  type DirectoryStore,
  type FaultStore,
  type RequestLogStore,
  type SnapshotStore,
  type TenantSeedDoc,
  type TenantStore,
} from "@ms-sandbox/core";
import {
  ADMIN_COOKIE,
  clearAdminCookie,
  destroyAdminSession,
  getAdminCredentials,
  setAdminCookie,
  tryLogin,
} from "./admin-auth.js";

/** Stage 0 platform routes: admin tenants, inspector, faults, OData placeholder, $batch. */
export function createPlatformRoutes(opts: {
  publicOrigin: string;
  tenants: TenantStore | null;
  requests: RequestLogStore | null;
  faults: FaultStore | null;
  snapshots: SnapshotStore | null;
  directory: DirectoryStore | null;
}) {
  const app = new Hono();

  const placeholders: Record<string, unknown>[] = [
    { id: "p1", name: "alpha", rank: 1 },
    { id: "p2", name: "beta", rank: 2 },
    { id: "p3", name: "gamma", rank: 3 },
  ];

  const needDb = () =>
    ({ error: "database_unavailable", message: "Set DATABASE_URL and run migrate" }) as const;

  app.post("/admin/v1/login", async (c) => {
    const body = (await c.req.json()) as { username?: string; password?: string };
    const sessionId = tryLogin(body.username ?? "", body.password ?? "");
    if (!sessionId) return c.json({ error: "invalid_credentials" }, 401);
    setAdminCookie(c, sessionId);
    return c.json({ ok: true, token: sessionId, user: getAdminCredentials().user });
  });

  app.post("/admin/v1/logout", async (c) => {
    destroyAdminSession(getCookie(c, ADMIN_COOKIE));
    clearAdminCookie(c);
    return c.json({ ok: true });
  });

  app.get("/admin/v1/tenants", async (c) => {
    if (!opts.tenants) return c.json(needDb(), 503);
    return c.json({ value: await opts.tenants.list() });
  });

  app.post("/admin/v1/tenants", async (c) => {
    if (!opts.tenants) return c.json(needDb(), 503);
    const body = (await c.req.json()) as {
      id?: string;
      displayName?: string;
      defaultDomain?: string | null;
    };
    if (!body.displayName) return c.json({ error: "displayName is required" }, 400);
    const created = await opts.tenants.create({
      id: body.id,
      displayName: body.displayName,
      defaultDomain: body.defaultDomain,
    });
    return c.json(created, 201);
  });

  app.patch("/admin/v1/tenants/:id", async (c) => {
    if (!opts.tenants) return c.json(needDb(), 503);
    const updated = await opts.tenants.update(c.req.param("id"), await c.req.json());
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(updated);
  });

  app.delete("/admin/v1/tenants/:id", async (c) => {
    if (!opts.tenants) return c.json(needDb(), 503);
    const ok = await opts.tenants.remove(c.req.param("id"));
    if (!ok) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  });

  app.get("/admin/v1/requests", async (c) => {
    if (!opts.requests) return c.json(needDb(), 503);
    const limit = Number(c.req.query("top") ?? 50);
    return c.json({ value: await opts.requests.list(Number.isFinite(limit) ? limit : 50) });
  });

  app.get("/admin/v1/faults", async (c) => {
    if (!opts.faults) return c.json(needDb(), 503);
    return c.json({ value: await opts.faults.list() });
  });

  app.post("/admin/v1/faults", async (c) => {
    if (!opts.faults) return c.json(needDb(), 503);
    const body = (await c.req.json()) as {
      pathGlob?: string;
      method?: string | null;
      status?: number;
      retryAfter?: number | null;
      oneShot?: boolean;
    };
    if (!body.pathGlob || !body.status) {
      return c.json({ error: "pathGlob and status are required" }, 400);
    }
    const created = await opts.faults.create({
      pathGlob: body.pathGlob,
      method: body.method,
      status: body.status,
      retryAfter: body.retryAfter,
      oneShot: body.oneShot,
    });
    return c.json(created, 201);
  });

  app.post("/admin/v1/seeds:apply", async (c) => {
    if (!opts.tenants) return c.json(needDb(), 503);
    const body = (await c.req.json()) as TenantSeedDoc;
    const result = await applyTenantSeed(opts.tenants, body);
    return c.json(result);
  });

  app.get("/admin/v1/seeds:export", async (c) => {
    if (!opts.tenants) return c.json(needDb(), 503);
    const tenants = await opts.tenants.list();
    return c.json({
      tenants: tenants.map((t) => ({
        id: t.id,
        displayName: t.displayName,
        defaultDomain: t.defaultDomain,
      })),
    });
  });

  app.get("/admin/v1/metrics", (c) => c.json(getMetrics()));

  app.get("/admin/v1/snapshots", async (c) => {
    if (!opts.snapshots) return c.json(needDb(), 503);
    return c.json({ value: await opts.snapshots.list() });
  });

  app.post("/admin/v1/snapshots:save", async (c) => {
    if (!opts.snapshots || !opts.tenants || !opts.faults) return c.json(needDb(), 503);
    const body = (await c.req.json()) as { name?: string };
    if (!body.name) return c.json({ error: "name is required" }, 400);
    const saved = await opts.snapshots.save(body.name, opts.tenants, opts.faults);
    return c.json(saved, 201);
  });

  app.post("/admin/v1/snapshots:restore", async (c) => {
    if (!opts.snapshots || !opts.tenants || !opts.faults) return c.json(needDb(), 503);
    const body = (await c.req.json()) as { name?: string };
    if (!body.name) return c.json({ error: "name is required" }, 400);
    try {
      const restored = await opts.snapshots.restore(
        body.name,
        opts.tenants,
        opts.faults,
        opts.directory,
      );
      return c.json({ ok: true, name: restored.name, tenants: restored.tenants.length });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "restore failed" }, 404);
    }
  });

  app.post("/admin/v1/reset", async (c) => {
    if (!opts.snapshots || !opts.tenants || !opts.faults) return c.json(needDb(), 503);
    await opts.snapshots.resetPlatform(opts.tenants, opts.faults, {
      reseed: true,
      directory: opts.directory,
    });
    return c.json({ ok: true, reseeded: "Contoso Ltd + directory demo" });
  });

  app.get("/v1.0/devPlaceholder", (c) => {
    const url = new URL(c.req.url);
    const query = parseODataQuery(url.searchParams);
    const body = applyOData(placeholders, query, {
      context: `${opts.publicOrigin}/v1.0/$metadata#devPlaceholder`,
      baseUrl: `${opts.publicOrigin}/v1.0/devPlaceholder`,
    });
    return c.json(body);
  });

  const runBatch = async (c: {
    req: { json: () => Promise<unknown> };
    json: (b: unknown, s?: number) => Response;
  }) => {
    const payload = (await c.req.json()) as { requests?: BatchRequest[] };
    try {
      const result = await handleJsonBatch(payload.requests, async (req) => {
        const path = req.url.startsWith("http")
          ? new URL(req.url).pathname + new URL(req.url).search
          : req.url.startsWith("/")
            ? req.url
            : `/${req.url}`;

        if (path.startsWith("/v1.0/devPlaceholder") || path.startsWith("v1.0/devPlaceholder")) {
          const q = new URL(path, opts.publicOrigin);
          const query = parseODataQuery(q.searchParams);
          return {
            id: req.id,
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: applyOData(placeholders, query, {
              context: `${opts.publicOrigin}/v1.0/$metadata#devPlaceholder`,
            }),
          };
        }

        return {
          id: req.id,
          status: 404,
          headers: { "Content-Type": "application/json" },
          body: graphError("Request_ResourceNotFound", `Resource '${path}' does not exist`),
        };
      });
      return c.json(result);
    } catch (err) {
      return c.json(
        graphError("BadRequest", err instanceof Error ? err.message : "Batch failed"),
        400,
      );
    }
  };

  app.post("/v1.0/$batch", runBatch);
  app.post("/beta/$batch", runBatch);

  return app;
}
