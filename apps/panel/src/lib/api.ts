import { cookies } from "next/headers";

export const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "https://localhost:8443";
const TOKEN_COOKIE = "ms_panel_token";

export async function getAdminToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(TOKEN_COOKIE)?.value ?? null;
}

export async function fetchAdmin(path: string, init: RequestInit = {}) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= "0";
  const token = await getAdminToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_ORIGIN}${path}`, { ...init, headers, cache: "no-store" });
  return res;
}

export { TOKEN_COOKIE };
