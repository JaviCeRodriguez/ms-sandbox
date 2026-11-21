# CLAUDE.md

Instructions for Claude Code when working in this repository.

## About the project

**ms-sandbox** is a local-only development platform that emulates enough of **Microsoft Entra ID** and **Microsoft Graph** for building and testing MSAL + Graph apps offline — without a real tenant or the official M365 Developer sandbox.

Working name of the product UI: **"Microsimulador"** (placeholder; final product name TBD). It is **not** a Microsoft product, must never be presented as one, and must not be used in production.

Read before working: `PRD.md`, `docs/prds/prd-emulador-microsoft-365.md` (canonical detailed PRD), `docs/architecture/`, and `docs/adr/`. Feature work is staged: MVP = stages **0 + 1 + 2** (platform + Entra + Graph directory).

## Stack

- **Language:** TypeScript (strict), Node 22+
- **API (Graph + OIDC authority):** Hono
- **Panel (admin UI):** Next.js (App Router) + Tailwind + shadcn/ui
- **CLI:** Node TypeScript package (`msim`)
- **Database:** Postgres 16 (Docker); SQLite as optional *lite* profile
- **Blobs:** local filesystem (`./data/blobs`); MinIO optional in Compose
- **TLS:** mkcert → `./data/tls`
- **Monorepo / package manager:** pnpm workspaces
- **Testing (target):** Vitest (unit/contract) + Playwright where UI e2e is needed; MSAL.js / Graph client contract tests from stage 1
- **Orchestration:** Docker Compose

Do not add additional dependencies without explicit justification. Stack decision: `docs/adr/ADR-001-stack-hono-nextjs.md`.

## Folder structure

Target layout (apps/packages appear as stages land; docs/ and .ways/ exist from init):

```
/apps
  /api            # Hono — Graph + OIDC authority + admin API
  /panel          # Next.js admin panel
  /cli            # msim CLI
/packages
  /core           # tenancy, authn of tokens, audit, faults
  /odata          # OData subset, envelopes, $batch, Graph errors
  /contracts      # trimmed OpenAPI / shared types
  /plugins        # product plugins (entra, directory, …)
/seeds            # declarative YAML/JSON tenant seeds
/docs
  /architecture   # Intended architecture & diagrams
  /adr            # Architecture Decision Records
  /prds           # Feature PRDs (incu-way-development) + base product PRD
  /bugs           # Bug reports (incu-way-bugs)
  /security       # Remediation records (snyk-remediation)
/data             # local runtime (tls, blobs) — gitignored
```

Never delete docs under `/docs`.

## Code conventions

- **Naming:** camelCase for variables/functions, PascalCase for classes/components, snake_case in the DB.
- **Errors:** never swallow errors with an empty catch. Graph/OIDC surfaces use Graph-shaped JSON errors; admin API uses explicit typed errors.
- **Imports:** use the configured path aliases. No relative paths with `../../../`.
- **No `any`:** prefer strict types and explicit narrowing.
- **Comments:** only when the "why" isn't obvious from the code. Do NOT document the "what".
- **Plugins:** one Microsoft product per stage/plugin; a disabled plugin must 404 with Graph `ResourceNotFound`, never 500.
- **Multi-tenant:** `tenant_id` on nearly all tables from day one.
- **Determinism:** fixed GUIDs in seeds; Faker with numeric `--seed`.
- **I18N:** panel UI Spanish (es-AR) first; Graph/OIDC error messages in English (Microsoft-like).

## Useful commands

> Until apps are scaffolded (stage 0), these are the **target** workspace commands.

```bash
# Install
pnpm install

# Development (target)
pnpm --filter @ms-sandbox/api dev
pnpm --filter @ms-sandbox/panel dev
pnpm --filter @ms-sandbox/cli start

# Stack
docker compose up
# or: msim up / msim down

# Build
pnpm -r build

# Tests
pnpm -r test
pnpm -r test:contract

# Lint + typecheck
pnpm -r lint
pnpm -r typecheck

# Seeds / snapshots (CLI target)
msim seed apply seeds/contoso.yaml
msim reset
msim snapshot save demo
```

## Environment variables

See `.env.example` (created in stage 0). Never commit `.env.local` or files with real credentials.

Critical (planned):

- **Server-only:** `DATABASE_URL`, panel admin password hash/secret, signing-key paths, MinIO keys if used.
- **Safe for local docs / client config samples:** authority/Graph base URLs, demo `clientId`s from seeds (never real Microsoft secrets).

Universal rule: secret keys (API keys, service tokens, DB passwords) are **never** exposed in the client or in logs. Demo passwords are for local use only and must be documented as such.

## Security (MANDATORY)

When vulnerabilities are detected (SAST, SCA, or any other source), **always** invoke the `snyk-remediation` skill before applying any fix. The skill manages the complete process: scan → triage → isolated branch → fix → re-scan → PR.

**Do not apply security fixes directly without going through the skill.**

## Work isolation first (UNIVERSAL RULE)

**All work — features, bugs, security fixes, any change — starts by choosing an isolation approach with the user before touching a single file.**

Always ask:

> Do you want me to work on a new branch in the current checkout, or to create a separate git worktree?

Use exactly the option the user picks.
Stop after asking; do not create a branch or worktree until the user chooses one.

If the current checkout has uncommitted changes, stop and ask before switching branch or creating a worktree.

### Option A — Branch in the current checkout

```bash
# From the repo root
git switch develop
git pull --ff-only
git switch -c {type}/{slug}
```

All work happens on that branch. Never create files in `develop` or `main` with the intention of moving them later.

### Option B — Separate worktree

Create worktrees only under `.worktrees/`. Do not ask the user for a path.

```bash
# From the repo root
git fetch origin develop
mkdir -p .worktrees
git worktree add .worktrees/{slug} -b {type}/{slug} origin/develop
```

All work happens inside that worktree. Never create files in `develop` or `main` with the intention of moving them later. This applies to docs, code, configuration — everything.

## Committing and PRs (UNIVERSAL RULE)

**No skill or flow commits, pushes, or opens a PR on its own.** `incu-way-prepare-pr` is the only skill that runs `git add`, `git commit`, `git push`, or `gh pr create`, and it only runs when the user explicitly asks for it (by name, or "commit this", "push this", "prepare the PR"). Every other flow just writes files and, at natural checkpoints, tells the user it's ready and suggests invoking `incu-way-prepare-pr` — it never runs those git commands itself.

## Development workflow (MANDATORY for any new feature)

For any new functionality or significant change, **always** invoke the `incu-way-development` skill before writing a single line of code. The skill defines a process with explicit approval gates:

1. **Phase 0** — Orientation: read PRD.md and docs/
2. **Isolation** — Ask whether to use a branch in the current checkout or a separate worktree **before writing anything**
3. **Phase 1** — Write the PRD in `docs/prds/{slug}/PRD.md` (in the chosen work location) → **wait for approval**
4. **Phase 2** — Implementation plan in `docs/prds/{slug}/PLAN.md` (in the chosen work location) → **wait for approval**
5. **Phase 3** — Implementation (in the chosen work location)
6. **Phase 4** — Validation + testing guide → **wait for feedback**
7. **Phase 5** — PRs: `feat/{slug}` → `develop` → `main`, opened only when the user invokes `incu-way-prepare-pr`

**Never write code before the user approves the PRD (Gate 1).**

## Bug-fixing workflow (MANDATORY for any bug)

For any reported or discovered bug, **always** invoke the `incu-way-bugs` skill before writing a single line of fix code. The skill defines a process with one explicit approval gate:

1. **Isolation** — Ask whether to use a branch in the current checkout or a separate worktree **before writing anything**
2. **Phase 1** — Document in `docs/bugs/{id}-{slug}/BUG.md`
3. **Phase 2** — Analysis in `docs/bugs/{id}-{slug}/ANALYSIS.md`
4. **Phase 3** — Reproduction test that fails before the fix
5. **Phase 4** — Plan in `docs/bugs/{id}-{slug}/FIX_PLAN.md` → **wait for approval**
6. **Phase 5** — Implement (only what the plan says)
7. **Phase 6** — Validation + security scans
8. **Phase 7** — PR `fix/{slug}` → `develop`, opened only when the user invokes `incu-way-prepare-pr`

**Never write fix code before the user approves the FIX_PLAN.**

## Mandatory tests

Before considering a stage/feature done:

- Contract tests for that stage’s OpenAPI/OIDC/Graph subset (≥ 80% of declared endpoints).
- Scope/role enforcement: missing scope → `403 Authorization_RequestDenied`.
- OData subset cases used by the stage (`$select`, `$filter`, paging, `$batch` where applicable).
- Seed apply / reset / snapshot round-trips for entities introduced in the stage.
- From stage 1: at least one MSAL (JS or Node) auth-code + PKCE happy path against local TLS.

Before marking a phase as done, always run the full suite.

## Sensitive data

This tool must never hold real Microsoft tenant secrets or production credentials.

- Demo users/passwords and app secrets are **local-only**; hash at rest; show secrets once in the panel.
- Never log real PII from a developer’s production apps; redacted request inspector by default.
- Banner permanently: local development tool only — do not enter real accounts or secrets.
- Bind default to `127.0.0.1`; do not publish Compose ports to `0.0.0.0` without an explicit flag.

Universal principles:
- Never log PII (emails, phone numbers, ID documents) in production.
- Explicit confirmation when exporting sensitive data.
- In the UI, hide sensitive fields by default behind a user action.

## Don't

- Don't claim Microsoft affiliation or reuse Microsoft product branding/logos as the app identity.
- Don't implement MFA, Conditional Access, SAML, WS-Fed, OBO, ROPC, or Implicit unless a future stage explicitly asks.
- Don't chase full OData/Graph parity — closed subset only (see PRD §7.4).
- Don't send real email to the Internet.
- Don't mix business logic with presentation logic.
- Don't use authorization/RLS bypasses in code that runs on the client side.
- Don't include secrets in client bundles.
- Don't `git push --force` to `main` or `develop`.
- Don't skip git hooks (`--no-verify`) without an explicit reason.
- Don't commit, push, or open a PR without the user explicitly asking — invoke `incu-way-prepare-pr` only when they ask for it, and only suggest it otherwise.

## When in doubt

If a decision isn't covered in `PRD.md` or `docs/`, **ask** instead of improvising. The user's input matters.
