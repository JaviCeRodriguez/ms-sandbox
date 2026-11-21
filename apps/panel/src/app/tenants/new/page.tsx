"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewTenantPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [defaultDomain, setDefaultDomain] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const login = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin@local", password: "Password1!" }),
    });
    if (!login.ok) {
      setError("Login admin falló — usá /login primero");
      return;
    }
    // Prefer cookie from prior login; also try API via server helper path:
    const res = await fetch("/api/tenants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, defaultDomain: defaultDomain || null }),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <h1>Nuevo tenant</h1>
      {error ? <p className="error">{error}</p> : null}
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 420 }}>
        <label>
          Nombre
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required style={{ width: "100%" }} />
        </label>
        <label>
          Dominio
          <input value={defaultDomain} onChange={(e) => setDefaultDomain(e.target.value)} style={{ width: "100%" }} />
        </label>
        <button type="submit">Crear</button>
      </form>
    </>
  );
}
