import { Hono } from "hono";
import {
  applyOData,
  graphError,
  handleJsonBatch,
  parseODataQuery,
  type BatchRequest,
} from "@ms-sandbox/odata";
import type { TenantStore } from "@ms-sandbox/core";

/** Stage 0 platform routes: admin tenants, OData placeholder, $batch. */
export function createPlatformRoutes(opts: {
  publicOrigin: string;
  tenants: TenantStore | null;
}) {
  const app = new Hono();

  const placeholders: Record<string, unknown>[] = [
    { id: "p1", name: "alpha", rank: 1 },
    { id: "p2", name: "beta", rank: 2 },
    { id: "p3", name: "gamma", rank: 3 },
  ];

  app.get("/admin/v1/tenants", async (c) => {
    if (!opts.tenants) {
      return c.json({ error: "database_unavailable", message: "Set DATABASE_URL and run migrate" }, 503);
    }
    return c.json({ value: await opts.tenants.list() });
  });

  app.post("/admin/v1/tenants", async (c) => {
    if (!opts.tenants) {
      return c.json({ error: "database_unavailable" }, 503);
    }
    const body = (await c.req.json()) as {
      id?: string;
      displayName?: string;
      defaultDomain?: string | null;
    };
    if (!body.displayName) {
      return c.json({ error: "displayName is required" }, 400);
    }
    const created = await opts.tenants.create({
      id: body.id,
      displayName: body.displayName,
      defaultDomain: body.defaultDomain,
    });
    return c.json(created, 201);
  });

  app.patch("/admin/v1/tenants/:id", async (c) => {
    if (!opts.tenants) return c.json({ error: "database_unavailable" }, 503);
    const updated = await opts.tenants.update(c.req.param("id"), await c.req.json());
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(updated);
  });

  app.delete("/admin/v1/tenants/:id", async (c) => {
    if (!opts.tenants) return c.json({ error: "database_unavailable" }, 503);
    const ok = await opts.tenants.remove(c.req.param("id"));
    if (!ok) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  });

  // Internal OData playground — not a real Graph path; Stage 0 acceptance.
  app.get("/v1.0/devPlaceholder", (c) => {
    const url = new URL(c.req.url);
    const query = parseODataQuery(url.searchParams);
    const body = applyOData(placeholders, query, {
      context: `${opts.publicOrigin}/v1.0/$metadata#devPlaceholder`,
      baseUrl: `${opts.publicOrigin}/v1.0/devPlaceholder`,
    });
    return c.json(body);
  });

  const runBatch = async (c: { req: { json: () => Promise<unknown> }; json: (b: unknown, s?: number) => Response }) => {
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
