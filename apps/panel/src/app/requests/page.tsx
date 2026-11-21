type RequestLog = {
  id: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  createdAt: string;
};

const API = process.env.NEXT_PUBLIC_API_ORIGIN ?? "https://localhost:8443";

export default async function RequestsPage() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= "0";
  let rows: RequestLog[] = [];
  let error: string | null = null;
  try {
    const res = await fetch(`${API}/admin/v1/requests?top=30`, { cache: "no-store" });
    if (!res.ok) error = `${res.status}: ${await res.text()}`;
    else rows = ((await res.json()) as { value: RequestLog[] }).value;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <>
      <h1>Request inspector</h1>
      <p className="sub">Últimas llamadas registradas por la API</p>
      {error ? (
        <p className="error">{error}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Cuando</th>
              <th>Método</th>
              <th>Path</th>
              <th>Status</th>
              <th>ms</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleTimeString()}</td>
                <td>{r.method}</td>
                <td>
                  <code>{r.path}</code>
                </td>
                <td>{r.status}</td>
                <td>{r.durationMs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
