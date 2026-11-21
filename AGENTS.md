# AGENTS.md

Instructions for coding agents (Cursor, and others) working in this repository.

## Current working mode (temporary)

**Until a successful MSAL login against the local emulator is demonstrated**, we intentionally
deviate from the usual `feat/*` → `develop` → `main` flow:

- Work and commit **directly on `main`**.
- No feature branches / worktrees / PRs required for this validation spike.
- Goal: prove the PRD idea end-to-end up to **auth code + PKCE login** (stage 0 skeleton as needed + stage 1 Entra minimum).

When that login works, restore the normal branch/PR flow described in `CLAUDE.md` and
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
