# ADR-001: Stack del monorepo ms-sandbox (Hono + Next.js)

- **Status**: accepted
- **Date**: 2026-11-20
- **Deciders**: Javier Rodriguez
- **Tags**: stack, monorepo, api, panel, greenfield, pnpm

## Context

ms-sandbox es un monorepo greenfield para un emulador local de Microsoft 365 / Entra ID
(PRD canónico: `docs/prds/prd-emulador-microsoft-365.md`). El MVP es Etapa 0+1+2:
plataforma + OIDC/MSAL + Graph directorio, con plugins por producto, TLS local,
seeds/CLI y panel admin.

Había dos candidatos:

1. **Opción A (PRD):** TypeScript + Hono (API Graph/OIDC) + Next.js/shadcn (panel) + Postgres + pnpm
2. **Opción B:** NestJS (API) + React + Vite (panel) + Postgres + pnpm

Package manager ya decidido: **pnpm**. Nombre de repo/proyecto: **ms-sandbox**.

La decisión condiciona el layout del monorepo, cómo se modelan los plugins, el costo
de la Etapa 1 (spike MSAL) y la forma del panel.

### Comparación

| Dimensión | Hono + Next.js | NestJS + React/Vite |
|---|---|---|
| Ajuste al PRD | Directo (plugins, adapters, panel) | Requiere reinterpretar plugins como módulos Nest + SPA |
| Ceremony | Baja (handlers + middleware) | Alta (DI, módulos, decorators) |
| Multi-host HTTPS | Natural en un process Hono | Viable con más boilerplate |
| Tests contrato MSAL/Graph | In-process sencillo | TestingModule con más setup |
| Panel admin | App Router + shadcn | SPA Vite desacoplada (HMR excelente; CORS/auth dual desde día 0) |
| Estructura “enterprise” | Hay que imponerla en `packages/` | Fuerte out-of-the-box |

Postgres, mkcert, Compose, CLI `msim` y seeds son independientes del framework HTTP.

## Decision

**Adoptar Opción A:** API en **Hono** (Node 22+), panel en **Next.js** + Tailwind + shadcn/ui,
CLI TypeScript, monorepo **pnpm** con layout `apps/api`, `apps/panel`, `apps/cli`,
`packages/*`, `seeds/`.

NestJS + React/Vite queda descartado para el bootstrap; revisitar solo si aparece un
driver fuerte (equipo Nest-only, requisitos de DI corporativo) vía un ADR nuevo que
superseda este.

## Consequences

### Positive

- Menor fricción para middleware OData, `$batch`, faults e inspector.
- Plugins = registro de rutas/entidades/seeds sin pelear con el contenedor DI de Nest.
- Tests in-process más simples para contratos MSAL/Graph.
- Alineado al PRD §7.2; menos “traducción” de arquitectura.

### Negative

- Menos estructura enterprise out-of-the-box; las convenciones viven en `packages/` y CLAUDE.md.
- Next puede sobrar si el panel fuera solo SPA; se acepta a cambio de shadcn/App Router y posible colocalización de route handlers admin en etapas tempranas.

### Neutral

- Postgres 16, mkcert, Docker Compose, CLI y motor de seeds no cambian.
- pnpm workspaces aplica igual que con Nest/Vite.

## Links

- PRD §7.2 Stack recomendado — `docs/prds/prd-emulador-microsoft-365.md`
- Visión corta — `PRD.md`
- Arquitectura de intención — `docs/architecture/overview.md`
