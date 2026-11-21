import { randomBytes, createHash } from "node:crypto";

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

export type BrowserSession = {
  id: string;
  tenantId: string;
  userId: string;
  expiresAt: number;
};

const authCodes = new Map<string, AuthCode>();
const sessions = new Map<string, BrowserSession>();

export function createBrowserSession(tenantId: string, userId: string): BrowserSession {
  const session: BrowserSession = {
    id: randomBytes(24).toString("base64url"),
    tenantId,
    userId,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
  };
  sessions.set(session.id, session);
  return session;
}

export function getBrowserSession(id: string | undefined): BrowserSession | undefined {
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
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

export function parseScopes(scope: string | undefined): string[] {
  if (!scope) return [];
  return scope
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (s.endsWith("/.default")) return ".default";
      if (s.includes("/")) {
        const last = s.split("/").pop()!;
        if (last && last !== ".default") return last;
      }
      return s;
    });
}
