type Fault = {
  id: string;
  pathGlob: string;
  method: string | null;
  status: number;
  retryAfter: number | null;
  oneShot: boolean;
  active: boolean;
  createdAt: string;
};

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "https://localhost:8443";

export default async function FaultsPage() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= "0";
  let rows: Fault[] = [];
  let error: string | null = null;
  try {
    const res = await fetch(`${API}/admin/v1/faults`, { cache: "no-store" });
    if (!res.ok) error = `${res.status}: ${await res.text()}`;
    else rows = ((await res.json()) as { value: Fault[] }).value;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <>
      <h1>Fault injection</h1>
      <p className="sub">
        Crear con <code>msim faults set --path &apos;/v1.0/devPlaceholder&apos; --status 429</code>
      </p>
      {error ? (
        <p className="error">{error}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Activo</th>
              <th>Path</th>
              <th>Status</th>
              <th>One-shot</th>
              <th>Retry-After</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id}>
                <td>{f.active ? "sí" : "no"}</td>
                <td>
                  <code>{f.pathGlob}</code>
                </td>
                <td>{f.status}</td>
                <td>{f.oneShot ? "sí" : "no"}</td>
                <td>{f.retryAfter ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
