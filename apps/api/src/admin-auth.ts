import { createMiddleware } from "hono/factory";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { randomBytes, timingSafeEqual } from "node:crypto";

const COOKIE = "ms_sandbox_admin";
const sessions = new Map<string, { user: string; expiresAt: number }>();

export function getAdminCredentials() {
  return {
    user: process.env.PANEL_ADMIN_USER ?? "admin@local",
    password: process.env.PANEL_ADMIN_PASSWORD ?? "Password1!",
  };
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function createAdminSession(user: string): string {
  const id = randomBytes(24).toString("base64url");
  sessions.set(id, { user, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
  return id;
}

export function readAdminSession(id: string | undefined): string | null {
  if (!id) return null;
  const row = sessions.get(id);
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    sessions.delete(id);
    return null;
  }
  return row.user;
}

export function destroyAdminSession(id: string | undefined) {
  if (id) sessions.delete(id);
}

export function tryLogin(username: string, password: string): string | null {
  const creds = getAdminCredentials();
  if (!safeEqual(username, creds.user) || !safeEqual(password, creds.password)) {
    return null;
  }
  return createAdminSession(username);
}

/** Protect /admin/v1/* except login/logout. */
export function adminAuthMiddleware() {
  return createMiddleware(async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (!path.startsWith("/admin/v1")) return next();
    if (path === "/admin/v1/login" || path === "/admin/v1/logout") return next();

    const header = c.req.header("authorization");
    const bearer = header?.toLowerCase().startsWith("bearer ")
      ? header.slice(7).trim()
      : undefined;
    const cookie = getCookie(c, COOKIE);
    const user = readAdminSession(bearer) ?? readAdminSession(cookie);
    if (!user) {
      return c.json({ error: "unauthorized", message: "Admin login required" }, 401);
    }
    c.set("adminUser", user);
    await next();
  });
}

export function setAdminCookie(
  c: Parameters<typeof setCookie>[0],
  sessionId: string,
) {
  setCookie(c, COOKIE, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
}

export function clearAdminCookie(c: Parameters<typeof deleteCookie>[0]) {
  deleteCookie(c, COOKIE, { path: "/" });
}

export { COOKIE as ADMIN_COOKIE };
