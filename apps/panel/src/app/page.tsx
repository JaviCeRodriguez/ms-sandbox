type Tenant = {
  id: string;
  displayName: string;
  defaultDomain: string | null;
  createdAt: string;
};

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "https://localhost:8443";

async function loadTenants(): Promise<{ ok: true; tenants: Tenant[] } | { ok: false; message: string }> {
  try {
    const res = await fetch(`${API}/admin/v1/tenants`, {
      cache: "no-store",
      // Node fetch against local mkcert.
      // @ts-expect-error Node undici option
      dispatcher: undefined,
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, message: `${res.status}: ${body}` };
    }
    const json = (await res.json()) as { value: Tenant[] };
    return { ok: true, tenants: json.value };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? `${err.message} (¿API arriba y DATABASE_URL + migrate?)`
          : String(err),
    };
  }
}

export default async function HomePage() {
  // Server-side Node may reject mkcert — use insecure agent via env for Stage 0.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= "0";
  const result = await loadTenants();

  return (
    <>
      <h1>Tenants</h1>
      <p className="sub">
        Cascarón Stage 0 — API <code>{API}</code>
      </p>
      {!result.ok ? (
        <p className="error">{result.message}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Dominio</th>
              <th>Id</th>
            </tr>
          </thead>
          <tbody>
            {result.tenants.map((t) => (
              <tr key={t.id}>
                <td>{t.displayName}</td>
                <td>{t.defaultDomain ?? "—"}</td>
                <td>
                  <code>{t.id}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
