import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import type { SigningKeys } from "./keys.js";
import { renderLoginPage } from "./login-page.js";
import {
  consumeAuthCode,
  createAuthCode,
  createSession,
  getApp,
  getConsentScopes,
  getSession,
  getTenant,
  getUserById,
  getUserByUpn,
  parseScopes,
  verifyPkce,
} from "./store.js";
import { mintTokens } from "./tokens.js";

const SESSION_COOKIE = "ms_sandbox_session";

export function createApp(keys: SigningKeys, publicOrigin: string) {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      credentials: true,
    }),
  );

  app.get("/health", (c) => c.json({ ok: true, service: "ms-sandbox-api" }));

  app.get("/:tenantId/v2.0/.well-known/openid-configuration", (c) => {
    const tenantId = c.req.param("tenantId");
    if (!getTenant(tenantId)) return c.json(oauthError("invalid_request", "Unknown tenant"), 400);

    const issuer = `${publicOrigin}/${tenantId}/v2.0`;
    const base = `${publicOrigin}/${tenantId}`;

    return c.json({
      token_endpoint: `${base}/oauth2/v2.0/token`,
      token_endpoint_auth_methods_supported: ["client_secret_post", "private_key_jwt", "none"],
      jwks_uri: `${base}/discovery/v2.0/keys`,
      response_modes_supported: ["query", "fragment", "form_post"],
      subject_types_supported: ["pairwise"],
      id_token_signing_alg_values_supported: ["RS256"],
      response_types_supported: ["code", "id_token", "code id_token", "id_token token"],
      scopes_supported: ["openid", "profile", "email", "offline_access"],
      issuer,
      request_uri_parameter_supported: false,
      userinfo_endpoint: `${base}/openid/userinfo`,
      authorization_endpoint: `${base}/oauth2/v2.0/authorize`,
      device_authorization_endpoint: `${base}/oauth2/v2.0/devicecode`,
      http_logout_supported: true,
      frontchannel_logout_supported: true,
      end_session_endpoint: `${base}/oauth2/v2.0/logout`,
      claims_supported: [
        "sub",
        "iss",
        "aud",
        "exp",
        "iat",
        "oid",
        "tid",
        "ver",
        "name",
        "preferred_username",
      ],
      kerberos_endpoint: `${base}/kerberos`,
      tenant_region_scope: null,
      cloud_instance_name: "microsoftonline.com",
      cloud_graph_host_name: "graph.windows.net",
      msgraph_host: "graph.microsoft.com",
      rbac_url: "https://pas.windows.net",
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
    });
  });

  app.get("/:tenantId/discovery/v2.0/keys", (c) => {
    const tenantId = c.req.param("tenantId");
    if (!getTenant(tenantId)) return c.json(oauthError("invalid_request", "Unknown tenant"), 400);
    return c.json({ keys: [keys.jwk] });
  });

  app.get("/:tenantId/login", (c) => {
    const tenantId = c.req.param("tenantId");
    if (!getTenant(tenantId)) return c.text("Unknown tenant", 404);
    const returnTo = c.req.query("return_to") ?? `/${tenantId}/oauth2/v2.0/authorize`;
    return c.html(renderLoginPage({ tenantId, returnTo }));
  });

  app.post("/:tenantId/login", async (c) => {
    const tenantId = c.req.param("tenantId");
    if (!getTenant(tenantId)) return c.text("Unknown tenant", 404);

    const body = await c.req.parseBody();
    const username = String(body.username ?? "");
    const password = String(body.password ?? "");
    const returnTo = String(body.return_to ?? `/${tenantId}/oauth2/v2.0/authorize`);

    const user = getUserByUpn(tenantId, username);
    if (!user || user.password !== password) {
      return c.html(
        renderLoginPage({
          tenantId,
          returnTo,
          error: "Usuario o password incorrectos.",
        }),
        401,
      );
    }

    const session = createSession(tenantId, user.id);
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

  app.get("/:tenantId/oauth2/v2.0/authorize", (c) => {
    const tenantId = c.req.param("tenantId");
    if (!getTenant(tenantId)) return c.json(oauthError("invalid_request", "Unknown tenant"), 400);

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
      return c.json(oauthError("unsupported_response_type", "Only response_type=code is supported"), 400);
    }
    if (!codeChallenge || codeChallengeMethod !== "S256") {
      return c.json(oauthError("invalid_request", "PKCE S256 is required"), 400);
    }

    const appReg = getApp(tenantId, clientId);
    if (!appReg) return c.json(oauthError("unauthorized_client", "Unknown client_id"), 400);
    if (!appReg.redirectUris.includes(redirectUri)) {
      return c.json(oauthError("invalid_request", "redirect_uri is not registered"), 400);
    }

    const session = getSession(getCookie(c, SESSION_COOKIE));
    if (!session || session.tenantId !== tenantId) {
      const returnTo = c.req.url.startsWith("http")
        ? c.req.url
        : `${publicOrigin}${c.req.url}`;
      const loginUrl = `/${tenantId}/login?return_to=${encodeURIComponent(returnTo)}`;
      return c.redirect(loginUrl, 302);
    }

    const user = getUserById(tenantId, session.userId);
    if (!user) return c.json(oauthError("server_error", "Session user missing"), 500);

    const requested = parseScopes(scope);
    const consented = new Set(getConsentScopes(clientId, user.userPrincipalName));
    // Always allow OIDC bootstrap scopes for the spike.
    for (const s of ["openid", "profile", "offline_access", "User.Read"]) consented.add(s);
    const granted = requested.length
      ? requested.filter((s) => consented.has(s) || s.startsWith("https://"))
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

    // MSAL loginPopup expects fragment (#code=...); query is for redirect / non-popup.
    const params = new URLSearchParams({ code: authCode.code });
    if (state) params.set("state", state);

    if (responseMode === "fragment") {
      const url = new URL(redirectUri);
      url.hash = params.toString();
      return c.redirect(url.toString(), 302);
    }

    const url = new URL(redirectUri);
    for (const [key, value] of params) url.searchParams.set(key, value);
    return c.redirect(url.toString(), 302);
  });

  app.post("/:tenantId/oauth2/v2.0/token", async (c) => {
    const tenantId = c.req.param("tenantId");
    if (!getTenant(tenantId)) return c.json(oauthError("invalid_request", "Unknown tenant"), 400);

    const contentType = c.req.header("content-type") ?? "";
    let body: Record<string, string> = {};
    if (contentType.includes("application/json")) {
      body = (await c.req.json()) as Record<string, string>;
    } else {
      const form = await c.req.parseBody();
      for (const [k, v] of Object.entries(form)) {
        if (typeof v === "string") body[k] = v;
      }
    }

    const grantType = body.grant_type;
    if (grantType !== "authorization_code") {
      return c.json(oauthError("unsupported_grant_type", "Only authorization_code is supported in this spike"), 400);
    }

    const code = body.code;
    const redirectUri = body.redirect_uri;
    const clientId = body.client_id;
    const codeVerifier = body.code_verifier;

    if (!code || !redirectUri || !clientId || !codeVerifier) {
      return c.json(oauthError("invalid_request", "Missing token request fields"), 400);
    }

    const authCode = consumeAuthCode(code);
    if (!authCode) return c.json(oauthError("invalid_grant", "Invalid or expired code"), 400);
    if (authCode.clientId !== clientId || authCode.redirectUri !== redirectUri) {
      return c.json(oauthError("invalid_grant", "code does not match client/redirect"), 400);
    }
    if (!verifyPkce(codeVerifier, authCode.codeChallenge, authCode.codeChallengeMethod)) {
      return c.json(oauthError("invalid_grant", "PKCE verification failed"), 400);
    }

    const user = getUserById(tenantId, authCode.userId);
    if (!user) return c.json(oauthError("server_error", "User missing"), 500);

    const issuer = `${publicOrigin}/${tenantId}/v2.0`;
    // Graph-shaped audience for access tokens in this spike.
    const audience = "https://graph.microsoft.com";
    const tokens = await mintTokens({
      privateKey: keys.privateKey,
      issuer,
      audience,
      clientId,
      user,
      scopes: authCode.scopes,
      tenantId,
      nonce: authCode.nonce,
    });

    return c.json(tokens);
  });

  app.get("/:tenantId/openid/userinfo", async (c) => {
    return c.json({ error: "not_implemented", message: "userinfo not required for the login spike" }, 501);
  });

  app.get("/v1.0/me", (c) => {
    const auth = c.req.header("authorization");
    if (!auth?.toLowerCase().startsWith("bearer ")) {
      return c.json(graphError("InvalidAuthenticationToken", "Bearer token required"), 401);
    }
    // Decode without full verify for the spike display helper — demo uses jwt claims client-side.
    try {
      const token = auth.slice(7);
      const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as {
        oid?: string;
        tid?: string;
        preferred_username?: string;
        name?: string;
      };
      const user = payload.tid && payload.oid ? getUserById(payload.tid, payload.oid) : undefined;
      if (!user) {
        return c.json(graphError("Request_ResourceNotFound", "User not found"), 404);
      }
      return c.json({
        "@odata.context": `${publicOrigin}/v1.0/$metadata#users/$entity`,
        id: user.id,
        displayName: user.displayName,
        userPrincipalName: user.userPrincipalName,
        mail: user.userPrincipalName,
      });
    } catch {
      return c.json(graphError("InvalidAuthenticationToken", "Malformed token"), 401);
    }
  });

  return app;
}

function oauthError(error: string, description: string) {
  return { error, error_description: description };
}

function graphError(code: string, message: string) {
  return {
    error: {
      code,
      message,
      innerError: {
        date: new Date().toISOString(),
        "request-id": crypto.randomUUID(),
        "client-request-id": crypto.randomUUID(),
      },
    },
  };
}
