/**
 * Headless smoke of auth-code + PKCE against the local authority.
 */
import { createHash, randomBytes } from "node:crypto";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CLIENT_ID = "cccccccc-cccc-cccc-cccc-ccccccccccc1";
const ORIGIN = "https://localhost:8443";
const REDIRECT = "http://localhost:5173";

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function cookieHeaderFromSetCookie(setCookie) {
  if (!setCookie) return "";
  const parts = Array.isArray(setCookie) ? setCookie : [setCookie];
  return parts.map((c) => c.split(";")[0].trim()).join("; ");
}

const verifier = b64url(randomBytes(32));
const challenge = b64url(createHash("sha256").update(verifier).digest());
const state = b64url(randomBytes(8));

const authorizeUrl = new URL(`${ORIGIN}/${TENANT}/oauth2/v2.0/authorize`);
authorizeUrl.searchParams.set("client_id", CLIENT_ID);
authorizeUrl.searchParams.set("response_type", "code");
authorizeUrl.searchParams.set("redirect_uri", REDIRECT);
authorizeUrl.searchParams.set("scope", "openid profile offline_access User.Read");
authorizeUrl.searchParams.set("state", state);
authorizeUrl.searchParams.set("code_challenge", challenge);
authorizeUrl.searchParams.set("code_challenge_method", "S256");

let res = await fetch(authorizeUrl, { redirect: "manual" });
const loginLocation = res.headers.get("location");
console.log("authorize →", res.status, loginLocation);
if (!loginLocation?.includes("/login")) throw new Error("Expected redirect to login");

const loginUrl = new URL(loginLocation, ORIGIN);
const form = new URLSearchParams({
  username: "alice@contoso.test",
  password: "Password1!",
  return_to: authorizeUrl.toString(),
});

res = await fetch(loginUrl, {
  method: "POST",
  redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: form,
});

const setCookie =
  typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : res.headers.get("set-cookie");
const cookie = cookieHeaderFromSetCookie(setCookie);
const afterLogin = res.headers.get("location");
console.log("login →", res.status, afterLogin);
if (!afterLogin) throw new Error("Expected redirect after login");
if (!cookie) throw new Error("Expected session cookie");

res = await fetch(afterLogin, {
  redirect: "manual",
  headers: { cookie },
});
const codeLocation = res.headers.get("location");
console.log("authorize(authed) →", res.status, codeLocation);
if (!codeLocation?.includes("code=")) throw new Error("Expected redirect with code");

const code = new URL(codeLocation).searchParams.get("code");

res = await fetch(`${ORIGIN}/${TENANT}/oauth2/v2.0/token`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    code,
    redirect_uri: REDIRECT,
    code_verifier: verifier,
  }),
});
const tokens = await res.json();
if (!res.ok) {
  console.error(tokens);
  throw new Error("token endpoint failed");
}
console.log("token →", res.status, Object.keys(tokens));

const meRes = await fetch(`${ORIGIN}/v1.0/me`, {
  headers: { Authorization: `Bearer ${tokens.access_token}` },
});
console.log("me →", meRes.status, await meRes.json());
console.log("SMOKE OK");
