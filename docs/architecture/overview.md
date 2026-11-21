# Architecture overview (intent) — ms-sandbox

> Greenfield intent doc. Evolve as stages land via `incu-way-development`.  
> Product detail: `docs/prds/prd-emulador-microsoft-365.md`.  
> Stack: `docs/adr/ADR-001-stack-hono-nextjs.md`.

## Logical view

```text
[App under test] --MSAL-->  Authority HTTPS  (OIDC/OAuth2 v2.0)
[App / Graph SDK] --Bearer--> Graph HTTPS     (/v1.0, /beta)
[Dev]             ----------> Panel Next.js   (API admin /admin/v1)
[Dev / CI]        ----------> CLI msim        (seeds, snapshots, reset)

                    ┌─────────────────────────────────────┐
                    │  Platform (Stage 0)                 │
                    │  tenancy, OData, batch, errors,     │
                    │  token authn, audit log, faults     │
                    ├─────────────────────────────────────┤
                    │  Product plugins (1..8)             │
                    │  Entra | Directory | People | Mail  │
                    │  Files | Teams | Office | Hooks     │
                    └─────────────────────────────────────┘
                         │
              Postgres (+ local blobs / optional MinIO)
```

### HTTPS origins (recommended)

| Surface | Host (example) |
|---|---|
| Authority | `https://login.microsimulador.localhost:8443/{tenantId}` |
| Graph | `https://graph.microsimulador.localhost:8443/v1.0` (`/beta`) |
| Panel | `https://panel.microsimulador.localhost:3000` |

Compact mode: single HTTPS listener on `:8443` routed by path/`Host`. MSAL rejects HTTP — local TLS (mkcert) is mandatory.

## Monorepo (pnpm)

| Path | Role |
|---|---|
| `apps/api` | Hono — authority + Graph + `/admin/v1` |
| `apps/panel` | Next.js admin (not a clone of Entra admin center) |
| `apps/cli` | `msim` — compose, seeds, snapshots, faults, token mint |
| `packages/core` | Tenancy, audit, request log, fault injection, token validation |
| `packages/odata` | Declared OData subset, envelopes, `$batch`, Graph errors |
| `packages/contracts` | Trimmed OpenAPI + shared types |
| `packages/plugins/*` | One package (or folder) per Microsoft product stage |
| `seeds/` | Declarative YAML/JSON tenants |

## Plugin contract

Each product plugin registers:

- Graph routes (`v1.0` / `beta`) and, if needed, authority routes
- Entities + migrations
- Seed schema contributions
- Panel screens/widgets
- Subscribable resources (stage 8)
- Injectable faults

Disabled plugin → Graph-shaped `404` (`ResourceNotFound`), never `500`.

## Stage roadmap (implementation backlog)

| # | Feature slug (suggested) | Deliverable | Depends |
|---|---|---|---|
| 0 | `000-platform-core` | Multi-tenant skeleton, HTTPS, OData/$batch, seeds/CLI, panel shell | — |
| 1 | `001-entra-id` | OIDC v2.0, users/apps/consent, MSAL e2e, Graph `/me` minimum | 0 |
| 2 | `002-graph-directory` | Users/groups CRUD, org, photos, delta | 1 |
| 3 | `003-people-skills` | `/me/people`, beta profile skills | 2 |
| 4 | `004-outlook` | Mail, calendar, contacts + fake inbox | 2 |
| 5 | `005-onedrive-sharepoint` | Drives, sites, lists | 2 |
| 6 | `006-teams` | Teams, channels, chats | 2 |
| 7 | `007-office-excel` | Excel Workbook API subset on driveItem | 5 |
| 8 | `008-webhooks-delta` | Subscriptions + cross-cutting delta | 2+ |

**MVP acceptance:** stages 0–2 (detailed checklist in base PRD §15).  
Each stage should be opened as a gated feature via `incu-way-development` (or tickets via `incu-way-po`) after init merges to `develop`.

## Key technology choices (ADR-style summary)

| Choice | Why |
|---|---|
| Hono | Thin surface for Graph/OIDC middleware and in-process contract tests |
| Next.js + shadcn | Rich admin tables/inspectors without cloning Microsoft UX |
| Postgres 16 | Multi-tenant + mail/files metadata; SQLite lite profile for small CI |
| mkcert | MSAL requires trusted HTTPS locally |
| Trimmed OpenAPI | Full msgraph OpenAPI is huge; version a generated subset per stage |

## Out of scope (global)

Production IdP, Internet exposure, MFA/CA, full Graph parity, real Internet email, Microsoft branding. See base PRD §§3.2, 16.
