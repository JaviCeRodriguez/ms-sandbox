import {
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
} from "@azure/msal-browser";
import "./style.css";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const CLIENT_ID = "cccccccc-cccc-cccc-cccc-ccccccccccc1";
const AUTHORITY = `https://localhost:8443/${TENANT_ID}`;
const API_ORIGIN = "https://localhost:8443";

const authorityMetadata = JSON.stringify({
  token_endpoint: `${API_ORIGIN}/${TENANT_ID}/oauth2/v2.0/token`,
  token_endpoint_auth_methods_supported: ["none"],
  jwks_uri: `${API_ORIGIN}/${TENANT_ID}/discovery/v2.0/keys`,
  response_modes_supported: ["query"],
  subject_types_supported: ["pairwise"],
  id_token_signing_alg_values_supported: ["RS256"],
  response_types_supported: ["code"],
  scopes_supported: ["openid", "profile", "email", "offline_access"],
  issuer: `${API_ORIGIN}/${TENANT_ID}/v2.0`,
  authorization_endpoint: `${API_ORIGIN}/${TENANT_ID}/oauth2/v2.0/authorize`,
  end_session_endpoint: `${API_ORIGIN}/${TENANT_ID}/oauth2/v2.0/logout`,
  http_logout_supported: true,
  frontchannel_logout_supported: true,
  claims_supported: ["sub", "iss", "aud", "exp", "iat", "oid", "tid", "name", "preferred_username"],
  code_challenge_methods_supported: ["S256"],
  grant_types_supported: ["authorization_code", "refresh_token"],
});

const msal = new PublicClientApplication({
  auth: {
    clientId: CLIENT_ID,
    authority: AUTHORITY,
    knownAuthorities: ["localhost:8443"],
    redirectUri: window.location.origin,
    authorityMetadata,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: "sessionStorage",
  },
});

const loginRequest = {
  scopes: ["openid", "profile", "offline_access", "User.Read"],
};

const app = document.querySelector<HTMLDivElement>("#app")!;

function render(content: string) {
  app.innerHTML = `
    <main>
      <div class="banner">Herramienta local de desarrollo. No ingresar cuentas ni secretos reales.</div>
      <h1>ms-sandbox</h1>
      <p class="sub">Spike MSAL → authority local (Hono)</p>
      ${content}
    </main>
  `;
}

function decodeJwt(token: string): unknown {
  const payload = token.split(".")[1];
  if (!payload) return null;
  return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function showResult(result: AuthenticationResult) {
  let me: unknown = null;
  let meError: string | null = null;
  try {
    const res = await fetch(`${API_ORIGIN}/v1.0/me`, {
      headers: { Authorization: `Bearer ${result.accessToken}` },
    });
    me = await res.json();
    if (!res.ok) meError = JSON.stringify(me, null, 2);
  } catch (err) {
    meError = err instanceof Error ? err.message : String(err);
  }

  render(`
    <p class="ok">Login OK</p>
    <p><strong>Account:</strong> ${result.account?.username ?? "(none)"}</p>
    <details open>
      <summary>ID token claims</summary>
      <pre>${escapeHtml(JSON.stringify(decodeJwt(result.idToken), null, 2))}</pre>
    </details>
    <details>
      <summary>Access token claims</summary>
      <pre>${escapeHtml(JSON.stringify(decodeJwt(result.accessToken), null, 2))}</pre>
    </details>
    <details open>
      <summary>GET /v1.0/me</summary>
      <pre>${escapeHtml(meError ?? JSON.stringify(me, null, 2))}</pre>
    </details>
    <button id="logout" type="button">Cerrar sesión</button>
  `);

  document.querySelector("#logout")?.addEventListener("click", async () => {
    const account = result.account as AccountInfo;
    await msal.logoutPopup({ account });
    showLogin();
  });
}

function showLogin(error?: string) {
  render(`
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
    <p>Authority: <code>${AUTHORITY}</code></p>
    <p>Usuario demo: <code>alice@contoso.test</code> / <code>Password1!</code></p>
    <button id="login" type="button">Iniciar sesión con MSAL</button>
    <p class="hint">Si el browser rechaza el certificado de <code>localhost:8443</code>, corré <code>mkcert -install</code> (admin) una vez y recargá.</p>
  `);
  document.querySelector("#login")?.addEventListener("click", async () => {
    try {
      const result = await msal.loginPopup(loginRequest);
      await showResult(result);
    } catch (err) {
      showLogin(err instanceof Error ? err.message : String(err));
    }
  });
}

await msal.initialize();

try {
  const redirect = await msal.handleRedirectPromise();
  if (redirect) {
    await showResult(redirect);
  } else {
    const accounts = msal.getAllAccounts();
    if (accounts[0]) {
      try {
        const silent = await msal.acquireTokenSilent({
          ...loginRequest,
          account: accounts[0],
        });
        await showResult(silent);
      } catch {
        showLogin();
      }
    } else {
      showLogin();
    }
  }
} catch (err) {
  showLogin(err instanceof Error ? err.message : String(err));
}
