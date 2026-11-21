import { randomBytes, createHash } from "node:crypto";
import {
  applications,
  consents,
  tenant,
  users,
  type Application,
  type User,
} from "./seed.js";

export type AuthCode = {
  code: string;
  tenantId: string;
  clientId: string;
  redirectUri: string;
  userId: string;
  scopes: string[];
  codeChallenge: string;
  codeChallengeMethod: "S256";
  nonce?: string;
  expiresAt: number;
};

export type Session = {
  id: string;
  tenantId: string;
  userId: string;
  expiresAt: number;
};

const authCodes = new Map<string, AuthCode>();
const sessions = new Map<string, Session>();

export function getTenant(id: string) {
  return tenant.id === id ? tenant : undefined;
}

export function getUserByUpn(tenantId: string, upn: string): User | undefined {
  return users.find(
    (u) => u.tenantId === tenantId && u.userPrincipalName.toLowerCase() === upn.toLowerCase(),
  );
}

export function getUserById(tenantId: string, id: string): User | undefined {
  return users.find((u) => u.tenantId === tenantId && u.id === id);
}

export function getApp(tenantId: string, appId: string): Application | undefined {
  return applications.find((a) => a.tenantId === tenantId && a.appId === appId);
}

export function getConsentScopes(appId: string, upn: string): string[] {
  const row = consents.find(
    (c) =>
      c.appId === appId &&
      (c.principalUpn === "admin" || c.principalUpn.toLowerCase() === upn.toLowerCase()),
  );
  return row?.scopes ?? [];
}

export function createSession(tenantId: string, userId: string): Session {
  const session: Session = {
    id: randomBytes(24).toString("base64url"),
    tenantId,
    userId,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string | undefined): Session | undefined {
  if (!id) return undefined;
  const session = sessions.get(id);
  if (!session) return undefined;
  if (session.expiresAt < Date.now()) {
    sessions.delete(id);
    return undefined;
  }
  return session;
}

export function createAuthCode(input: Omit<AuthCode, "code" | "expiresAt">): AuthCode {
  const row: AuthCode = {
    ...input,
    code: randomBytes(32).toString("base64url"),
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
  authCodes.set(row.code, row);
  return row;
}

export function consumeAuthCode(code: string): AuthCode | undefined {
  const row = authCodes.get(code);
  if (!row) return undefined;
  authCodes.delete(code);
  if (row.expiresAt < Date.now()) return undefined;
  return row;
}

export function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (method !== "S256") return false;
  const digest = createHash("sha256").update(verifier).digest("base64url");
  return digest === challenge;
}

export function parseScopes(scope: string | undefined): string[] {
  if (!scope) return [];
  return scope
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      // MSAL may send resource/.default or full URI scopes; keep the short name when possible.
      if (s.includes("/")) {
        const last = s.split("/").pop()!;
        if (last && last !== ".default") return last;
      }
      return s;
    });
}
