import { NextResponse } from "next/server";
import { API_ORIGIN, TOKEN_COOKIE } from "@/lib/api";

export async function POST(req: Request) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= "0";
  const body = (await req.json()) as { username?: string; password?: string };
  const res = await fetch(`${API_ORIGIN}/admin/v1/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  const response = NextResponse.json({ ok: true, user: data.user });
  response.cookies.set(TOKEN_COOKIE, data.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return response;
}
