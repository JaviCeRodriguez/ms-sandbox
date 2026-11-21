# AGENTS.md

Instructions for coding agents (Cursor, and others) working in this repository.

## Current working mode (temporary)

**Still active** (extended by choice after MSAL login was proven). We intentionally deviate
from the usual `feat/*` → `develop` → `main` flow:

- Work and commit **directly on `main`**.
- No feature branches / worktrees / PRs required while this mode lasts.
- Done so far: Stage 0 platform + Stage 1 Entra minimum (MSAL PKCE, client credentials, device code, refresh, Graph `/me`/`/users`/`/groups`, consent/mint), Playwright-verified.
- Current focus: continue product stages on `main` until temporary mode ends.

When the user ends this mode, restore the normal branch/PR flow in `CLAUDE.md` and
`.cursor/rules/branch-flow.mdc`.

## Primary source of truth

Read and follow **[`CLAUDE.md`](./CLAUDE.md)** for project context, stack, conventions, security, work isolation, and the gated development/bug workflows — except where this file’s **Current working mode** section explicitly overrides isolation/branch rules for the spike above.

Also read before substantive work:

- [`PRD.md`](./PRD.md)
- [`docs/architecture/`](./docs/architecture/)
- [`docs/adr/`](./docs/adr/) when making or revisiting architectural choices
- The canonical product PRD: [`docs/prds/prd-emulador-microsoft-365.md`](./docs/prds/prd-emulador-microsoft-365.md)

## Why both files

`CLAUDE.md` is the file the **incu-way** skills expect and scaffold. This `AGENTS.md` is the Cursor-friendly entry point that points agents at that same contract so IDE and skill guidance stay aligned.
