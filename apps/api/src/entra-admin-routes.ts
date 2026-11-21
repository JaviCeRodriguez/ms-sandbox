import { Hono } from "hono";
import type { DirectoryStore } from "@ms-sandbox/core";
import type { SigningKeys } from "./keys.js";
import { mintDelegatedTokens } from "./tokens.js";

export function createEntraAdminRoutes(deps: {
  keys: SigningKeys;
  publicOrigin: string;
  directory: DirectoryStore | null;
}) {
  const app = new Hono();
  const { directory, keys, publicOrigin } = deps;
  const need = () => ({ error: "directory_unavailable" });

  app.get("/admin/v1/tenants/:tenantId/users", async (c) => {
    if (!directory) return c.json(need(), 503);
    return c.json({ value: await directory.listUsers(c.req.param("tenantId")) });
  });

  app.post("/admin/v1/tenants/:tenantId/users", async (c) => {
    if (!directory) return c.json(need(), 503);
    const body = (await c.req.json()) as {
      userPrincipalName?: string;
      displayName?: string;
      password?: string;
      jobTitle?: string;
      department?: string;
    };
    if (!body.userPrincipalName || !body.displayName || !body.password) {
      return c.json({ error: "userPrincipalName, displayName, password required" }, 400);
    }
    const user = await directory.createUser({
      tenantId: c.req.param("tenantId"),
      userPrincipalName: body.userPrincipalName,
      displayName: body.displayName,
      password: body.password,
      jobTitle: body.jobTitle,
      department: body.department,
    });
    return c.json(user, 201);
  });

  app.get("/admin/v1/tenants/:tenantId/groups", async (c) => {
    if (!directory) return c.json(need(), 503);
    return c.json({ value: await directory.listGroups(c.req.param("tenantId")) });
  });

  app.get("/admin/v1/tenants/:tenantId/applications", async (c) => {
    if (!directory) return c.json(need(), 503);
    return c.json({ value: await directory.listApps(c.req.param("tenantId")) });
  });

  app.post("/admin/v1/tenants/:tenantId/consents", async (c) => {
    if (!directory) return c.json(need(), 503);
    const body = (await c.req.json()) as {
      appId?: string;
      principalUpn?: string;
      scopes?: string[];
    };
    if (!body.appId || !body.principalUpn || !body.scopes?.length) {
      return c.json({ error: "appId, principalUpn, scopes required" }, 400);
    }
    await directory.setConsent({
      tenantId: c.req.param("tenantId"),
      appId: body.appId,
      principalUpn: body.principalUpn,
      scopes: body.scopes,
    });
    return c.json({ ok: true });
  });

  app.post("/admin/v1/tokens:mint", async (c) => {
    if (!directory) return c.json(need(), 503);
    const body = (await c.req.json()) as {
      tenantId?: string;
      userUpn?: string;
      appId?: string;
      scopes?: string[];
    };
    if (!body.tenantId || !body.userUpn || !body.appId) {
      return c.json({ error: "tenantId, userUpn, appId required" }, 400);
    }
    const userRow = await directory.getUserByUpn(body.tenantId, body.userUpn);
    if (!userRow) return c.json({ error: "user_not_found" }, 404);
    const { passwordHash: _, ...user } = userRow;
    const scopes = body.scopes ?? ["openid", "profile", "offline_access", "User.Read"];
    const issuer = `${publicOrigin}/${body.tenantId}/v2.0`;
    const tokens = await mintDelegatedTokens({
      privateKey: keys.privateKey,
      issuer,
      audience: "https://graph.microsoft.com",
      clientId: body.appId,
      user,
      scopes,
      tenantId: body.tenantId,
    });
    return c.json(tokens);
  });

  return app;
}
