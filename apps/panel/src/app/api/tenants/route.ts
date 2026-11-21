import { NextResponse } from "next/server";
import { fetchAdmin } from "@/lib/api";

export async function POST(req: Request) {
  const body = await req.json();
  const res = await fetchAdmin("/admin/v1/tenants", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
