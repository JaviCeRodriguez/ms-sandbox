import { SignJWT } from "jose";
import { KID, type SigningPrivateKey } from "./keys.js";
import type { DirectoryUser } from "@ms-sandbox/core";

const OIDC_SCOPES = new Set(["openid", "profile", "email", "offline_access"]);

export async function mintDelegatedTokens(opts: {
  privateKey: SigningPrivateKey;
  issuer: string;
  audience: string;
  clientId: string;
  user: DirectoryUser;
  scopes: string[];
  tenantId: string;
  nonce?: string;
  refreshToken?: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const delegatedScopes = opts.scopes.filter((s) => !OIDC_SCOPES.has(s));
  const scp = delegatedScopes.join(" ");

  const accessToken = await new SignJWT({
    aud: opts.audience,
    iss: opts.issuer,
    iat: now,
    nbf: now,
    exp: now + 3600,
    sub: opts.user.id,
    oid: opts.user.id,
    tid: opts.tenantId,
    ver: "2.0",
    azp: opts.clientId,
    appid: opts.clientId,
    preferred_username: opts.user.userPrincipalName,
    name: opts.user.displayName,
    scp,
  })
    .setProtectedHeader({ alg: "RS256", kid: KID, typ: "JWT" })
    .sign(opts.privateKey);

  const idClaims: Record<string, unknown> = {
    aud: opts.clientId,
    iss: opts.issuer,
    iat: now,
    nbf: now,
    exp: now + 3600,
    sub: opts.user.id,
    oid: opts.user.id,
    tid: opts.tenantId,
    ver: "2.0",
    preferred_username: opts.user.userPrincipalName,
    name: opts.user.displayName,
    email: opts.user.userPrincipalName,
  };
  if (opts.nonce) idClaims.nonce = opts.nonce;

  const idToken = await new SignJWT(idClaims)
    .setProtectedHeader({ alg: "RS256", kid: KID, typ: "JWT" })
    .sign(opts.privateKey);

  return {
    token_type: "Bearer",
    expires_in: 3600,
    ext_expires_in: 3600,
    access_token: accessToken,
    id_token: idToken,
    scope: [...OIDC_SCOPES].filter((s) => opts.scopes.includes(s)).concat(delegatedScopes).join(" ") ||
      delegatedScopes.join(" "),
    ...(opts.refreshToken ? { refresh_token: opts.refreshToken } : {}),
  };
}

export async function mintAppOnlyToken(opts: {
  privateKey: SigningPrivateKey;
  issuer: string;
  audience: string;
  clientId: string;
  tenantId: string;
  roles: string[];
}) {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await new SignJWT({
    aud: opts.audience,
    iss: opts.issuer,
    iat: now,
    nbf: now,
    exp: now + 3600,
    sub: opts.clientId,
    oid: opts.clientId,
    tid: opts.tenantId,
    ver: "2.0",
    azp: opts.clientId,
    appid: opts.clientId,
    roles: opts.roles,
  })
    .setProtectedHeader({ alg: "RS256", kid: KID, typ: "JWT" })
    .sign(opts.privateKey);

  return {
    token_type: "Bearer",
    expires_in: 3600,
    ext_expires_in: 3600,
    access_token: accessToken,
    scope: opts.roles.join(" "),
  };
}

/** @deprecated use mintDelegatedTokens */
export const mintTokens = mintDelegatedTokens;
