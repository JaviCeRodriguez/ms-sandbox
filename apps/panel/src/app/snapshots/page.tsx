import { fetchAdmin } from "@/lib/api";

type Snapshot = {
  id: string;
  name: string;
  createdAt: string;
  path: string;
};

export default async function SnapshotsPage() {
  const res = await fetchAdmin("/admin/v1/snapshots");
  let rows: Snapshot[] = [];
  let error: string | null = null;
  if (res.status === 401) error = "No autenticado. Andá a /login.";
  else if (!res.ok) error = `${res.status}: ${await res.text()}`;
  else rows = ((await res.json()) as { value: Snapshot[] }).value;

  return (
    <>
      <h1>Snapshots</h1>
      <p className="sub">
        <code>msim snapshot save demo</code> / <code>msim snapshot restore demo</code> /{" "}
        <code>msim reset</code>
      </p>
      {error ? (
        <p className="error">{error}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Creado</th>
              <th>Path</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{new Date(s.createdAt).toLocaleString()}</td>
                <td>
                  <code>{s.path}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
