# ms-sandbox

Emulador local de Microsoft Entra ID / Graph para desarrollo (spike).

**No es un producto de Microsoft.** Solo uso local — no ingresar cuentas ni secretos reales.

## Spike actual: login MSAL

Hasta demostrar un login exitoso se trabaja directo en `main` (ver `AGENTS.md`).

### Prerrequisitos

- Node 22+
- pnpm 11+
- [mkcert](https://github.com/FiloSottile/mkcert) (ya usado para `data/tls/`)

Una vez (admin), para que el browser confíe el HTTPS local:

```bash
mkcert -install
```

### Arranque

```bash
pnpm install
pnpm certs    # si faltan data/tls/*.pem
pnpm dev      # API :8443 + demo :5173
```

- Demo: http://localhost:5173  
- Authority: `https://localhost:8443/11111111-1111-1111-1111-111111111111`  
- Usuario: `alice@contoso.test` / `Password1!`

### Docs

- `PRD.md` / `docs/prds/prd-emulador-microsoft-365.md`
- `docs/adr/ADR-001-stack-hono-nextjs.md`
- `AGENTS.md` → `CLAUDE.md`
