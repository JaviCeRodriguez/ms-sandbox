process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { createHash, randomBytes } from "node:crypto";

const ORIGIN = "https://localhost:8443";
const TENANT = "11111111-1111-1111-1111-111111111111";
const SPA = "cccccccc-cccc-cccc-cccc-ccccccccccc1";
const DAEMON = "dddddddd-dddd-dddd-dddd-ddddddddddd1";

async function adminToken() {
  const res = await fetch(`${ORIGIN}/admin/v1/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin@local", password: "Password1!" }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error("admin login failed");
  return body.token;
}

// 1) client credentials
const cc = await fetch(`${ORIGIN}/${TENANT}/oauth2/v2.0/token`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: DAEMON,
    client_secret: "DaemonSecret1!",
    scope: "https://graph.microsoft.com/.default",
  }),
});
const ccBody = await cc.json();
console.log("client_credentials", cc.status, Object.keys(ccBody));
if (!cc.ok) throw new Error(JSON.stringify(ccBody));

const users = await fetch(`${ORIGIN}/v1.0/users`, {
  headers: { Authorization: `Bearer ${ccBody.access_token}` },
});
console.log("users app-only", users.status);
if (!users.ok) throw new Error(await users.text());

// 2) mint delegated without User.Read → 403 on /me
const token = await adminToken();
const mint = await fetch(`${ORIGIN}/admin/v1/tokens:mint`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    tenantId: TENANT,
    userUpn: "alice@contoso.test",
    appId: SPA,
    scopes: ["openid", "profile"],
  }),
});
const mintBody = await mint.json();
console.log("mint no User.Read", mint.status);
const meDenied = await fetch(`${ORIGIN}/v1.0/me`, {
  headers: { Authorization: `Bearer ${mintBody.access_token}` },
});
console.log("me denied", meDenied.status, await meDenied.json());
if (meDenied.status !== 403) throw new Error("expected 403 without User.Read");

// 3) mint with User.Read
const mintOk = await fetch(`${ORIGIN}/admin/v1/tokens:mint`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    tenantId: TENANT,
    userUpn: "alice@contoso.test",
    appId: SPA,
    scopes: ["openid", "profile", "User.Read"],
  }),
});
const mintOkBody = await mintOk.json();
const me = await fetch(`${ORIGIN}/v1.0/me`, {
  headers: { Authorization: `Bearer ${mintOkBody.access_token}` },
});
console.log("me ok", me.status, await me.json());
if (!me.ok) throw new Error("me should succeed");

// 4) consent Mail.Read
await fetch(`${ORIGIN}/admin/v1/tenants/${TENANT}/consents`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    appId: SPA,
    principalUpn: "alice@contoso.test",
    scopes: ["openid", "profile", "offline_access", "User.Read", "Mail.Read"],
  }),
});

// 5) device code happy path
const dc = await fetch(`${ORIGIN}/${TENANT}/oauth2/v2.0/devicecode`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: SPA,
    scope: "openid profile offline_access User.Read",
  }),
});
const dcBody = await dc.json();
console.log("device code", dc.status, dcBody.user_code);
if (!dc.ok) throw new Error(JSON.stringify(dcBody));

const approve = await fetch(`${ORIGIN}/${TENANT}/device`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    user_code: dcBody.user_code,
    username: "alice@contoso.test",
    password: "Password1!",
  }),
  redirect: "manual",
});
console.log("device approve", approve.status);

const polled = await fetch(`${ORIGIN}/${TENANT}/oauth2/v2.0/token`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    client_id: SPA,
    device_code: dcBody.device_code,
  }),
});
const polledBody = await polled.json();
console.log("device token", polled.status, Object.keys(polledBody));
if (!polled.ok) throw new Error(JSON.stringify(polledBody));
if (!polledBody.refresh_token) throw new Error("expected refresh_token");

const refreshed = await fetch(`${ORIGIN}/${TENANT}/oauth2/v2.0/token`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "refresh_token",
    client_id: SPA,
    refresh_token: polledBody.refresh_token,
  }),
});
const refreshedBody = await refreshed.json();
console.log("refresh", refreshed.status, Object.keys(refreshedBody));
if (!refreshed.ok) throw new Error(JSON.stringify(refreshedBody));

// 6) OData eq + orderby + nextLink
const odata = await fetch(
  `${ORIGIN}/v1.0/devPlaceholder?$filter=name eq 'beta'&$orderby=rank desc&$top=1&$count=true`,
);
console.log("odata eq", odata.status, await odata.json());

const page = await fetch(`${ORIGIN}/v1.0/devPlaceholder?$top=1&$count=true`);
const pageBody = await page.json();
console.log("odata nextLink", Boolean(pageBody["@odata.nextLink"]), pageBody["@odata.count"]);
if (!pageBody["@odata.nextLink"]) throw new Error("expected nextLink");

console.log("STAGE1 SMOKE OK");
void createHash;
void randomBytes;
