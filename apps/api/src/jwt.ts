import { importJWK, jwtVerify } from "jose";
import type { SigningKeys } from "./keys.js";

export type AccessClaims = {
  tid?: string;
  oid?: string;
  scp?: string;
  roles?: string[];
  preferred_username?: string;
  name?: string;
  azp?: string;
  appid?: string;
  aud?: string | string[];
  iss?: string;
};

export async function verifyAccessToken(
  token: string,
  keys: SigningKeys,
  issuerPrefix: string,
): Promise<AccessClaims> {
  const jwk = keys.jwk;
  const key = await importJWK(jwk, "RS256");
  const { payload } = await jwtVerify(token, key, {
    algorithms: ["RS256"],
  });
  const claims = payload as AccessClaims;
  if (!claims.iss?.startsWith(issuerPrefix) && claims.iss !== issuerPrefix) {
    // allow exact issuer like https://localhost:8443/{tid}/v2.0
    if (!claims.iss?.includes("/v2.0")) {
      throw new Error("invalid issuer");
    }
  }
  return claims;
}

export function hasScopeOrRole(claims: AccessClaims, needed: string[]): boolean {
  const scp = new Set((claims.scp ?? "").split(/\s+/).filter(Boolean));
  const roles = new Set(claims.roles ?? []);
  return needed.some((n) => scp.has(n) || roles.has(n));
}

export function bearerToken(header: string | undefined): string | null {
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim();
}
