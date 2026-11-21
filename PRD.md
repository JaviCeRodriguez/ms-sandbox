# PRD — ms-sandbox

> Repo / project name: **ms-sandbox**  
> Product UI placeholder: **Microsimulador** (final name TBD)  
> Canonical detailed PRD: [`docs/prds/prd-emulador-microsoft-365.md`](docs/prds/prd-emulador-microsoft-365.md)  
> Stack decision: [`docs/adr/ADR-001-stack-hono-nextjs.md`](docs/adr/ADR-001-stack-hono-nextjs.md)

## Problem

Developing against Microsoft 365 requires a real tenant or a short-lived, eligibility-gated sandbox, slow app registration/consent flows, hard-to-reset test data, and network/quota dependence. We need a **local development toy** that stands up with Docker Compose, HTTPS, fake orgs in minutes, and enough Entra/Graph fidelity for MSAL and official Graph SDKs.

## Goals

- Develop and test MSAL + Graph apps **100% offline** (after dependency install).
- Create/reset **multiple tenants** via declarative seeds or admin panel in under a minute.
- Grant permissions/consent from panel/CLI without Microsoft’s consent UX.
- Grow **one product per stage** as plugins (Entra → directory → People → Outlook → Files → Teams → Office → webhooks).
- Keep a testable contract against a trimmed subset of [msgraph-metadata](https://github.com/microsoftgraph/msgraph-metadata) OpenAPI.

## Non-goals

- Not a production IdP or replacement for real Entra/Exchange/SharePoint/Teams.
- Not full Graph parity; each stage declares an explicit subset.
- No MFA, Conditional Access, SAML, WS-Fed, OBO, ROPC, Implicit (unless a future stage explicitly requires it).
- No Microsoft branding/logos; no Internet exposure by default; no real secrets.

## Users

| Role | Need |
|---|---|
| Dev | Point MSAL/Graph at the emulator and build the app under test |
| Teammate / CI | Apply versioned seeds and run contract tests |
| Emulator admin | Tenants, users, apps, consent, impersonation, faults via panel/CLI |
| Simulated user | Fake account inside a fake tenant (never a real person) |

## MVP

**Stages 0 + 1 + 2:** platform core + Microsoft Entra ID + Graph directory. Acceptance checklist lives in the detailed PRD §15.

## Architecture (intent)

Monorepo (pnpm): Hono API (OIDC authority + Graph + admin), Next.js panel, `msim` CLI, Postgres, mkcert TLS, plugin packages per Microsoft product. See `docs/architecture/overview.md`.

## Roadmap (task planning from base PRD)

| Stage | Scope | Est. effort | Depends |
|---|---|---|---|
| 0 | Platform core (tenancy, HTTPS, OData/$batch, seeds, CLI, panel shell) | 3–5 w | — |
| 1 | Entra ID (OIDC/OAuth2 v2.0, users/apps/consent, MSAL) | 5–8 w | 0 |
| 2 | Graph directory (CRUD users/groups, org, photos, delta) | 2–4 w | 1 |
| 3 | People + Profile/Skills | 1–2 w | 2 |
| 4 | Outlook / Exchange | 4–6 w | 2 |
| 5 | OneDrive / SharePoint | 4–6 w | 2 |
| 6 | Teams | 4–6 w | 2 |
| 7 | Office (Excel Workbook subset) | 3–5 w | 5 |
| 8 | Webhooks + cross-cutting delta | 3–5 w | 2+ |

Implementation of each stage goes through `incu-way-development` (feature PRD + plan gates) after this init lands on `develop`.

## Principles (summary)

1. Dev-only banners everywhere.  
2. Contract fidelity over implementation fidelity.  
3. One product per stage.  
4. Multi-tenant from day one.  
5. Panel/CLI are not Graph.  
6. Deterministic seeds.  
7. Low security on the *simulated* IdP; high isolation (localhost, mkcert).

## Open items

- Final product name (replace “Microsimulador”).
- Repo license (MIT or Apache-2.0 recommended) + non-affiliation notice.
- SonarQube `run-sonar.sh` location still TODO until CI is wired.
