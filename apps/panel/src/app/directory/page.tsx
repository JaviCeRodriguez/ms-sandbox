import { fetchAdmin } from "@/lib/api";

const TENANT = "11111111-1111-1111-1111-111111111111";

export default async function DirectoryPage() {
  const [usersRes, groupsRes, appsRes] = await Promise.all([
    fetchAdmin(`/admin/v1/tenants/${TENANT}/users`),
    fetchAdmin(`/admin/v1/tenants/${TENANT}/groups`),
    fetchAdmin(`/admin/v1/tenants/${TENANT}/applications`),
  ]);

  if (usersRes.status === 401) {
    return <p className="error">No autenticado. Andá a /login.</p>;
  }

  const users = usersRes.ok ? ((await usersRes.json()) as { value: Array<{ displayName: string; userPrincipalName: string }> }).value : [];
  const groups = groupsRes.ok ? ((await groupsRes.json()) as { value: Array<{ displayName: string }> }).value : [];
  const apps = appsRes.ok ? ((await appsRes.json()) as { value: Array<{ displayName: string; appId: string }> }).value : [];

  return (
    <>
      <h1>Directory (Contoso)</h1>
      <p className="sub">Usuarios, grupos y apps de la Etapa 1</p>
      <h2>Users</h2>
      <ul>
        {users.map((u) => (
          <li key={u.userPrincipalName}>
            {u.displayName} — <code>{u.userPrincipalName}</code>
          </li>
        ))}
      </ul>
      <h2>Groups</h2>
      <ul>
        {groups.map((g) => (
          <li key={g.displayName}>{g.displayName}</li>
        ))}
      </ul>
      <h2>Applications</h2>
      <ul>
        {apps.map((a) => (
          <li key={a.appId}>
            {a.displayName} — <code>{a.appId}</code>
          </li>
        ))}
      </ul>
    </>
  );
}
