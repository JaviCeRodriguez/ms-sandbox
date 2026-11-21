import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { DirectoryStore, TenantStore } from "@ms-sandbox/core";
import type { SigningKeys } from "./keys.js";
import { renderLoginPage } from "./login-page.js";
import {
  consumeAuthCode,
  createAuthCode,
  createBrowserSession,
  getBrowserSession,
  parseScopes,
  verifyPkce,
} from "./runtime-store.js";
import { mintAppOnlyToken, mintDelegatedTokens } from "./tokens.js";

const SESSION_COOKIE = "ms_sandbox_session";
const GRAPH_AUD = "https://graph.microsoft.com";

export function createOidcRoutes(deps: {
  keys: SigningKeys;
  publicOrigin: string;
  tenants: TenantStore | null;
  directory: DirectoryStore | null;
}) {
  const app = new Hono();
  const { keys, publicOrigin, directory } = deps;

  const needDir = () =>
    ({ error: "directory_unavailable", error_description: "Directory store not ready" }) as const;

  async function resolveTenant(tenantId: string) {
    if (tenantId === "common" || tenantId === "organizations") {
      return "11111111-1111-1111-1111-111111111111";
    }
    if (deps.tenants) {
      const t = await deps.tenants.get(tenantId);
      return t?.id;
    }
    return tenantId === "11111111-1111-1111-1111-111111111111" ? tenantId : undefined;
  }

  app.get("/:tenantId/v2.0/.well-known/openid-configuration", async (c) => {
    const tenantId = await resolveTenant(c.req.param("tenantId"));
    if (!tenantId) return c.json(oauthError("invalid_request", "Unknown tenant"), 400);
    const issuer = `${publicOrigin}/${tenantId}/v2.0`;
    const base = `${publicOrigin}/${tenantId}`;
    return c.json({
      token_endpoint: `${base}/oauth2/v2.0/token`,
      token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
      jwks_uri: `${base}/discovery/v2.0/keys`,
      response_modes_supported: ["query", "fragment", "form_post"],
      subject_types_supported: ["pairwise"],
      id_token_signing_alg_values_supported: ["RS256"],
      response_types_supported: ["code"],
      scopes_supported: ["openid", "profile", "email", "offline_access"],
      issuer,
      userinfo_endpoint: `${base}/openid/userinfo`,
      authorization_endpoint: `${base}/oauth2/v2.0/authorize`,
      device_authorization_endpoint: `${base}/oauth2/v2.0/devicecode`,
      end_session_endpoint: `${base}/oauth2/v2.0/logout`,
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: [
        "authorization_code",
        "refresh_token",
        "client_credentials",
        "urn:ietf:params:oauth:grant-type:device_code",
      ],
    });
  });

  app.get("/:tenantId/discovery/v2.0/keys", async (c) => {
    const tenantId = await resolveTenant(c.req.param("tenantId"));
    if (!tenantId) return c.json(oauthError("invalid_request", "Unknown tenant"), 400);
    return c.json({ keys: [keys.jwk] });
  });

  app.get("/:tenantId/login", async (c) => {
    const tenantId = await resolveTenant(c.req.param("tenantId"));
    if (!tenantId) return c.text("Unknown tenant", 404);
    const returnTo = c.req.query("return_to") ?? `/${tenantId}/oauth2/v2.0/authorize`;
    return c.html(renderLoginPage({ tenantId, returnTo }));
  });

  app.post("/:tenantId/login", async (c) => {
    if (!directory) return c.json(needDir(), 503);
    const tenantId = await resolveTenant(c.req.param("tenantId"));
    if (!tenantId) return c.text("Unknown tenant", 404);
    const body = await c.req.parseBody();
    const username = String(body.username ?? "");
    const password = String(body.password ?? "");
    const returnTo = String(body.return_to ?? `/${tenantId}/oauth2/v2.0/authorize`);
    const user = await directory.authenticate(tenantId, username, password);
    if (!user) {
      return c.html(
        renderLoginPage({ tenantId, returnTo, error: "Usuario o password incorrectos." }),
        401,
      );
    }
    const session = createBrowserSession(tenantId, user.id);
    setCookie(c, SESSION_COOKIE, session.id, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
    const target = returnTo.startsWith("http") ? returnTo : `${publicOrigin}${returnTo}`;
    return c.redirect(target, 302);
  });

  app.get("/:tenantId/device", async (c) => {
    const tenantId = await resolveTenant(c.req.param("tenantId"));
    if (!tenantId) return c.text("Unknown tenant", 404);
    return c.html(devicePage({ tenantId, error: undefined, ok: undefined }));
  });

  app.post("/:tenantId/device", async (c) => {
    if (!directory) return c.json(needDir(), 503);
    const tenantId = await resolveTenant(c.req.param("tenantId"));
    if (!tenantId) return c.text("Unknown tenant", 404);
    const body = await c.req.parseBody();
    const userCode = String(body.user_code ?? "");
    const username = String(body.username ?? "");
    const password = String(body.password ?? "");
    const user = await directory.authenticate(tenantId, username, password);
    if (!user) {
      return c.html(devicePage({ tenantId, error: "Credenciales inválidas", ok: undefined }), 401);
    }
    const ok = await directory.approveDeviceCode(userCode, user.id);
    if (!ok) {
      return c.html(devicePage({ tenantId, error: "Código inválido o expirado", ok: undefined }), 400);
    }
    return c.html(devicePage({ tenantId, error: undefined, ok: "Dispositivo aprobado. Podés cerrar esta ventana." }));
  });

  app.get("/:tenantId/oauth2/v2.0/authorize", async (c) => {
    if (!directory) return c.json(needDir(), 503);
    const tenantId = await resolveTenant(c.req.param("tenantId"));
    if (!tenantId) return c.json(oauthError("invalid_request", "Unknown tenant"), 400);

    const clientId = c.req.query("client_id");
    const redirectUri = c.req.query("redirect_uri");
    const responseType = c.req.query("response_type") ?? "code";
    const responseMode = c.req.query("response_mode") ?? "query";
    const scope = c.req.query("scope") ?? "";
    const state = c.req.query("state") ?? "";
    const nonce = c.req.query("nonce") ?? undefined;
    const codeChallenge = c.req.query("code_challenge");
    const codeChallengeMethod = c.req.query("code_challenge_method") ?? "S256";

    if (!clientId || !redirectUri) {
      return c.json(oauthError("invalid_request", "client_id and redirect_uri are required"), 400);
    }
    if (responseType !== "code") {
      return c.json(oauthError("unsupported_response_type", "Only response_type=code"), 400);
    }
    if (!codeChallenge || codeChallengeMethod !== "S256") {
      return c.json(oauthError("invalid_request", "PKCE S256 is required"), 400);
    }

    const appReg = await directory.getApp(tenantId, clientId);
    if (!appReg) return c.json(oauthError("unauthorized_client", "Unknown client_id"), 400);
    if (!appReg.redirectUris.includes(redirectUri)) {
      return c.json(oauthError("invalid_request", "redirect_uri is not registered"), 400);
    }

    const session = getBrowserSession(getCookie(c, SESSION_COOKIE));
    if (!session || session.tenantId !== tenantId) {
      const returnTo = c.req.url.startsWith("http") ? c.req.url : `${publicOrigin}${c.req.url}`;
      return c.redirect(`/${tenantId}/login?return_to=${encodeURIComponent(returnTo)}`, 302);
    }

    const user = await directory.getUserById(tenantId, session.userId);
    if (!user) return c.json(oauthError("server_error", "Session user missing"), 500);

    const requested = parseScopes(scope);
    const consented = new Set(await directory.getConsentScopes(tenantId, clientId, user.userPrincipalName));
    for (const s of ["openid", "profile", "offline_access", "User.Read"]) consented.add(s);
    const granted = requested.length
      ? requested.filter((s) => consented.has(s) || s === ".default" || s.startsWith("https://"))
      : ["openid", "profile", "offline_access", "User.Read"];

    const authCode = createAuthCode({
      tenantId,
      clientId,
      redirectUri,
      userId: user.id,
      scopes: granted,
      codeChallenge,
      codeChallengeMethod: "S256",
      nonce,
    });

    const params = new URLSearchParams({ code: authCode.code });
    if (state) params.set("state", state);
    if (responseMode === "fragment") {
      const url = new URL(redirectUri);
      url.hash = params.toString();
      return c.redirect(url.toString(), 302);
    }
    const url = new URL(redirectUri);
    for (const [k, v] of params) url.searchParams.set(k, v);
    return c.redirect(url.toString(), 302);
  });

  app.post("/:tenantId/oauth2/v2.0/devicecode", async (c) => {
    if (!directory) return c.json(needDir(), 503);
    const tenantId = await resolveTenant(c.req.param("tenantId"));
    if (!tenantId) return c.json(oauthError("invalid_request", "Unknown tenant"), 400);
    const form = await c.req.parseBody();
    const clientId = String(form.client_id ?? "");
    const scope = String(form.scope ?? "openid profile offline_access User.Read");
    const appReg = await directory.getApp(tenantId, clientId);
    if (!appReg) return c.json(oauthError("unauthorized_client", "Unknown client"), 400);
    const dc = await directory.createDeviceCode({
      tenantId,
      clientId,
      scopes: parseScopes(scope),
    });
    return c.json({
      device_code: dc.deviceCode,
      user_code: dc.userCode,
      verification_uri: `${publicOrigin}/${tenantId}/device`,
      verification_uri_complete: `${publicOrigin}/${tenantId}/device?user_code=${dc.userCode}`,
      expires_in: dc.expiresIn,
      interval: dc.interval,
      message: `Go to ${publicOrigin}/${tenantId}/device and enter code ${dc.userCode}`,
    });
  });

  app.post("/:tenantId/oauth2/v2.0/token", async (c) => {
    if (!directory) return c.json(needDir(), 503);
    const tenantId = await resolveTenant(c.req.param("tenantId"));
    if (!tenantId) return c.json(oauthError("invalid_request", "Unknown tenant"), 400);

    const form = await c.req.parseBody();
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(form)) {
      if (typeof v === "string") body[k] = v;
    }
    const grantType = body.grant_type;
    const issuer = `${publicOrigin}/${tenantId}/v2.0`;

    if (grantType === "authorization_code") {
      const authCode = consumeAuthCode(body.code ?? "");
      if (!authCode) return c.json(oauthError("invalid_grant", "Invalid or expired code"), 400);
      if (authCode.clientId !== body.client_id || authCode.redirectUri !== body.redirect_uri) {
        return c.json(oauthError("invalid_grant", "code mismatch"), 400);
      }
      if (!verifyPkce(body.code_verifier ?? "", authCode.codeChallenge, authCode.codeChallengeMethod)) {
        return c.json(oauthError("invalid_grant", "PKCE verification failed"), 400);
      }
      const user = await directory.getUserById(tenantId, authCode.userId);
      if (!user) return c.json(oauthError("server_error", "User missing"), 500);
      const refresh = await directory.createRefreshToken({
        tenantId,
        clientId: authCode.clientId,
        userId: user.id,
        scopes: authCode.scopes,
      });
      return c.json(
        await mintDelegatedTokens({
          privateKey: keys.privateKey,
          issuer,
          audience: GRAPH_AUD,
          clientId: authCode.clientId,
          user,
          scopes: authCode.scopes,
          tenantId,
          nonce: authCode.nonce,
          refreshToken: refresh,
        }),
      );
    }

    if (grantType === "refresh_token") {
      const consumed = await directory.consumeRefreshToken(body.refresh_token ?? "");
      if (!consumed || consumed.clientId !== body.client_id) {
        return c.json(oauthError("invalid_grant", "Invalid refresh token"), 400);
      }
      if (!consumed.userId) return c.json(oauthError("invalid_grant", "No user on refresh"), 400);
      const user = await directory.getUserById(tenantId, consumed.userId);
      if (!user) return c.json(oauthError("invalid_grant", "User missing"), 400);
      const refresh = await directory.createRefreshToken({
        tenantId,
        clientId: consumed.clientId,
        userId: user.id,
        scopes: consumed.scopes,
        familyId: consumed.familyId,
      });
      return c.json(
        await mintDelegatedTokens({
          privateKey: keys.privateKey,
          issuer,
          audience: GRAPH_AUD,
          clientId: consumed.clientId,
          user,
          scopes: consumed.scopes,
          tenantId,
          refreshToken: refresh,
        }),
      );
    }

    if (grantType === "client_credentials") {
      const clientId = body.client_id;
      const secret = body.client_secret ?? "";
      if (!(await directory.verifyClientSecret(tenantId, clientId, secret))) {
        return c.json(oauthError("invalid_client", "Invalid client credentials"), 401);
      }
      const appReg = await directory.getApp(tenantId, clientId);
      if (!appReg) return c.json(oauthError("unauthorized_client", "Unknown client"), 400);
      return c.json(
        await mintAppOnlyToken({
          privateKey: keys.privateKey,
          issuer,
          audience: GRAPH_AUD,
          clientId,
          tenantId,
          roles: appReg.assignedRoles.length ? appReg.assignedRoles : ["User.Read.All"],
        }),
      );
    }

    if (grantType === "urn:ietf:params:oauth:grant-type:device_code") {
      const row = await directory.pollDeviceCode(body.device_code ?? "");
      if (!row) return c.json(oauthError("invalid_grant", "Unknown device_code"), 400);
      if (row.expires_at.getTime() < Date.now()) {
        return c.json(oauthError("expired_token", "Device code expired"), 400);
      }
      if (!row.approved_user_id) {
        return c.json({ error: "authorization_pending", error_description: "User has not approved" }, 400);
      }
      const user = await directory.getUserById(tenantId, row.approved_user_id);
      if (!user) return c.json(oauthError("server_error", "User missing"), 500);
      const scopes = row.scopes.split(/\s+/).filter(Boolean);
      const refresh = await directory.createRefreshToken({
        tenantId,
        clientId: row.client_id,
        userId: user.id,
        scopes,
      });
      return c.json(
        await mintDelegatedTokens({
          privateKey: keys.privateKey,
          issuer,
          audience: GRAPH_AUD,
          clientId: row.client_id,
          user,
          scopes,
          tenantId,
          refreshToken: refresh,
        }),
      );
    }

    return c.json(oauthError("unsupported_grant_type", `Unsupported grant: ${grantType}`), 400);
  });

  app.get("/:tenantId/oauth2/v2.0/logout", (c) => c.text("logged out"));

  app.get("/:tenantId/openid/userinfo", async (c) => {
    return c.json({ error: "use /v1.0/me with Graph access token" }, 501);
  });

  return app;
}

function oauthError(error: string, description: string) {
  return { error, error_description: description };
}

function devicePage(opts: { tenantId: string; error?: string; ok?: string }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>Device login</title>
  <style>body{font-family:Segoe UI,sans-serif;display:grid;place-items:center;min-height:100vh;background:#102a43;color:#102a43}
  main{background:#fff;padding:1.5rem;border-radius:12px;width:min(420px,92vw)}
  .banner{background:#fff3cd;padding:.75rem;border-radius:8px;margin-bottom:1rem;font-size:.85rem}
  .error{color:#b42318}.ok{color:#0f7b3a} input,button{width:100%;padding:.65rem;margin:.35rem 0;box-sizing:border-box}
  </style></head><body><main>
  <div class="banner">Herramienta local de desarrollo. No ingresar cuentas ni secretos reales.</div>
  <h1>Device code</h1>
  ${opts.error ? `<p class="error">${opts.error}</p>` : ""}
  ${opts.ok ? `<p class="ok">${opts.ok}</p>` : ""}
  ${
    opts.ok
      ? ""
      : `<form method="post"><label>User code</label><input name="user_code" required/>
    <label>Usuario</label><input name="username" value="alice@contoso.test" required/>
    <label>Password</label><input name="password" type="password" value="Password1!" required/>
    <button type="submit">Aprobar</button></form>`
  }
  </main></body></html>`;
}
