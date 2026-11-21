import { Hono } from "hono";
import { applyOData, graphError, parseODataQuery } from "@ms-sandbox/odata";
import type { DirectoryStore } from "@ms-sandbox/core";
import type { SigningKeys } from "./keys.js";
import { bearerToken, hasScopeOrRole, verifyAccessToken } from "./jwt.js";

export function createGraphRoutes(deps: {
  keys: SigningKeys;
  publicOrigin: string;
  directory: DirectoryStore | null;
}) {
  const app = new Hono();
  const { keys, publicOrigin, directory } = deps;

  async function requireClaims(c: { req: { header: (n: string) => string | undefined } }, needed: string[]) {
    const token = bearerToken(c.req.header("authorization"));
    if (!token) return { error: graphError("InvalidAuthenticationToken", "Bearer token required"), status: 401 as const };
    try {
      const claims = await verifyAccessToken(token, keys, publicOrigin);
      if (!hasScopeOrRole(claims, needed)) {
        return {
          error: graphError("Authorization_RequestDenied", `Missing scope/role: ${needed.join(" or ")}`),
          status: 403 as const,
        };
      }
      return { claims };
    } catch {
      return { error: graphError("InvalidAuthenticationToken", "Token validation failed"), status: 401 as const };
    }
  }

  app.get("/v1.0/me", async (c) => {
    if (!directory) return c.json(graphError("BadRequest", "Directory unavailable"), 503);
    const auth = await requireClaims(c, ["User.Read", "User.Read.All", "Directory.Read.All"]);
    if ("error" in auth && auth.error) return c.json(auth.error, auth.status);
    const claims = auth.claims!;
    if (!claims.tid || !claims.oid) {
      return c.json(graphError("InvalidAuthenticationToken", "Missing tid/oid"), 401);
    }
    // app-only tokens use oid=appid — /me requires delegated user
    if (claims.roles?.length && !claims.scp) {
      return c.json(graphError("BadRequest", "/me requires a delegated token"), 400);
    }
    const user = await directory.getUserById(claims.tid, claims.oid);
    if (!user) return c.json(graphError("Request_ResourceNotFound", "User not found"), 404);
    return c.json({
      "@odata.context": `${publicOrigin}/v1.0/$metadata#users/$entity`,
      id: user.id,
      displayName: user.displayName,
      userPrincipalName: user.userPrincipalName,
      mail: user.userPrincipalName,
      jobTitle: user.jobTitle,
      department: user.department,
    });
  });

  app.get("/v1.0/me/memberOf", async (c) => {
    if (!directory) return c.json(graphError("BadRequest", "Directory unavailable"), 503);
    const auth = await requireClaims(c, ["User.Read", "Directory.Read.All"]);
    if ("error" in auth && auth.error) return c.json(auth.error, auth.status);
    const claims = auth.claims!;
    if (!claims.tid || !claims.oid || (claims.roles?.length && !claims.scp)) {
      return c.json(graphError("BadRequest", "Delegated token required"), 400);
    }
    const groups = await directory.listUserMemberOf(claims.oid);
    return c.json({
      "@odata.context": `${publicOrigin}/v1.0/$metadata#directoryObjects`,
      value: groups.map((g) => ({
        "@odata.type": "#microsoft.graph.group",
        id: g.id,
        displayName: g.displayName,
        mailNickname: g.mailNickname,
      })),
    });
  });

  app.get("/v1.0/users", async (c) => {
    if (!directory) return c.json(graphError("BadRequest", "Directory unavailable"), 503);
    const auth = await requireClaims(c, ["User.Read.All", "Directory.Read.All", "User.Read"]);
    if ("error" in auth && auth.error) return c.json(auth.error, auth.status);
    const claims = auth.claims!;
    const tenantId = claims.tid!;
    // User.Read alone only allows /me — enforce Read.All for list unless only self (still allow for demo with User.Read.All preferred)
    if (!hasScopeOrRole(claims, ["User.Read.All", "Directory.Read.All"])) {
      return c.json(
        graphError("Authorization_RequestDenied", "User.Read.All or Directory.Read.All required to list users"),
        403,
      );
    }
    const users = await directory.listUsers(tenantId);
    const url = new URL(c.req.url);
    const query = parseODataQuery(url.searchParams);
    const mapped = users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      userPrincipalName: u.userPrincipalName,
      mail: u.userPrincipalName,
      jobTitle: u.jobTitle,
      department: u.department,
    }));
    return c.json(
      applyOData(mapped, query, {
        context: `${publicOrigin}/v1.0/$metadata#users`,
        baseUrl: `${publicOrigin}/v1.0/users`,
      }),
    );
  });

  app.get("/v1.0/users/:id", async (c) => {
    if (!directory) return c.json(graphError("BadRequest", "Directory unavailable"), 503);
    const auth = await requireClaims(c, ["User.Read", "User.Read.All", "Directory.Read.All"]);
    if ("error" in auth && auth.error) return c.json(auth.error, auth.status);
    const claims = auth.claims!;
    const id = c.req.param("id");
    const user =
      (await directory.getUserById(claims.tid!, id)) ??
      (await directory.getUserByUpn(claims.tid!, id));
    if (!user) return c.json(graphError("Request_ResourceNotFound", "User not found"), 404);
    const { passwordHash: _, ...safe } = user as typeof user & { passwordHash?: string };
    return c.json({
      "@odata.context": `${publicOrigin}/v1.0/$metadata#users/$entity`,
      id: safe.id,
      displayName: safe.displayName,
      userPrincipalName: safe.userPrincipalName,
      mail: safe.userPrincipalName,
      jobTitle: safe.jobTitle,
      department: safe.department,
    });
  });

  app.get("/v1.0/groups", async (c) => {
    if (!directory) return c.json(graphError("BadRequest", "Directory unavailable"), 503);
    const auth = await requireClaims(c, ["Group.Read.All", "Directory.Read.All", "User.Read.All"]);
    if ("error" in auth && auth.error) return c.json(auth.error, auth.status);
    const groups = await directory.listGroups(auth.claims!.tid!);
    return c.json({
      "@odata.context": `${publicOrigin}/v1.0/$metadata#groups`,
      value: groups.map((g) => ({
        id: g.id,
        displayName: g.displayName,
        mailNickname: g.mailNickname,
      })),
    });
  });

  app.get("/v1.0/groups/:id", async (c) => {
    if (!directory) return c.json(graphError("BadRequest", "Directory unavailable"), 503);
    const auth = await requireClaims(c, ["Group.Read.All", "Directory.Read.All", "User.Read.All"]);
    if ("error" in auth && auth.error) return c.json(auth.error, auth.status);
    const group = await directory.getGroup(auth.claims!.tid!, c.req.param("id"));
    if (!group) return c.json(graphError("Request_ResourceNotFound", "Group not found"), 404);
    return c.json({
      id: group.id,
      displayName: group.displayName,
      mailNickname: group.mailNickname,
    });
  });

  return app;
}
