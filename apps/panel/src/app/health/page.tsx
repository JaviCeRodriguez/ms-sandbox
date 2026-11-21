const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "https://localhost:8443";

export default async function HealthPage() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= "0";
  let body: unknown;
  let status = 0;
  try {
    const res = await fetch(`${API}/health`, { cache: "no-store" });
    status = res.status;
    body = await res.json();
  } catch (err) {
    body = { error: err instanceof Error ? err.message : String(err) };
  }

  return (
    <>
      <h1>Health</h1>
      <p className="sub">
        GET <code>{API}/health</code> → {status || "error"}
      </p>
      <pre>{JSON.stringify(body, null, 2)}</pre>
    </>
  );
}
