import { fetchAdmin, API_ORIGIN } from "@/lib/api";

type Tenant = {
  id: string;
  displayName: string;
  defaultDomain: string | null;
  createdAt: string;
};

export default async function HomePage() {
  const res = await fetchAdmin("/admin/v1/tenants");
  let tenants: Tenant[] = [];
  let error: string | null = null;
  if (res.status === 401) {
    error = "No autenticado. Andá a /login (admin@local / Password1!).";
  } else if (!res.ok) {
    error = `${res.status}: ${await res.text()}`;
  } else {
    tenants = ((await res.json()) as { value: Tenant[] }).value;
  }

  return (
    <>
      <h1>Tenants</h1>
      <p className="sub">
        Cascarón Stage 0 — API <code>{API_ORIGIN}</code>
      </p>
      {error ? (
        <p className="error">{error}</p>
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
            {tenants.map((t) => (
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
