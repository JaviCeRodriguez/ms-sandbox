# PRD: Emulador local de Microsoft 365 y Entra ID (solo desarrollo)

> Repo / proyecto: **ms-sandbox**.  
> Nombre de producto (UI): **"Microsimulador"** (placeholder; el nombre definitivo está pendiente).  
> Versión 0.1 — 20/11/2026 (America/Buenos_Aires).  
> Autor: Javier Rodriguez.  
> Estado: listo para evaluar e implementar por etapas.  
> Stack aceptado: Hono + Next.js + pnpm — ver `docs/adr/ADR-001-stack-hono-nextjs.md`.  
> Uso: herramienta de desarrollo local. **No es un producto de Microsoft, no se presenta como tal y no se usa en producción.**

---

## 1. Resumen

Queremos construir, desde cero y por etapas, una plataforma local que simule una nube de Microsoft lo bastante fiel como para desarrollar y testear apps contra **Microsoft Entra ID** y **Microsoft Graph**, sin depender de un tenant real, del sandbox oficial ni de los flujos administrativos de Microsoft.

Cada etapa agrega **un producto** (Entra, directorio Graph, People/Skills, Outlook, OneDrive/SharePoint, Teams, Office, notificaciones). No partimos de emuladores existentes (por ejemplo entra-local o entra-emulator): sirven de referencia de mercado, pero no cubren el alcance completo (varios tenants, consent, correo, archivos, Teams, panel y seeds).

El sistema expone:

- un **authority OIDC/OAuth2 v2.0** compatible con MSAL (HTTPS, discovery, JWKS, issuer alineado a la authority);
- un **endpoint Graph** (`/v1.0` y un subconjunto `/beta`) con forma OData básica, envelopes `@odata`, paginado, errores al estilo Graph y `$batch` JSON;
- un **motor de seeds** declarativo (YAML/JSON), generador Faker determinístico, import/export, reset y snapshots, con CLI;
- un **panel de administración externo** (no es una réplica del Entra admin center) para crear tenants, usuarios, grupos, apps, permisos y consentimientos, impersonar usuarios, inyectar correo, ver mensajes de Teams, inspeccionar requests e inyectar fallos (429, latencia).

El MVP es **Etapa 0 + 1 + 2**: plataforma + Entra + directorio Graph. El resto se suma producto a producto.

---

## 2. Problema

Desarrollar contra Microsoft 365 hoy implica:

- un tenant real o el [sandbox del Microsoft 365 Developer Program](https://learn.microsoft.com/en-us/office/developer-program/microsoft-365-developer-program-faq), cuya elegibilidad está restringida (Visual Studio Professional/Enterprise, ISV Success, partners MAICPP elegibles, o Premier/Unified Support), exige cuenta de billing para verificar, y es de corta duración;
- flujos largos para registrar apps, otorgar permisos y consentir;
- datos de prueba difíciles de resetear, versionar o compartir en el equipo;
- dependencia de red y de cuotas reales (throttling, licencias, MFA, Conditional Access).

Necesitamos un **juguete de desarrollo** que se levante con Docker Compose, tenga HTTPS local, permita crear organizaciones falsas en minutos y responda como Graph/Entra lo suficiente para que MSAL y los SDK oficiales funcionen contra él.

---

## 3. Objetivos y no-objetivos

### 3.1 Objetivos

- Permitir desarrollar y testear una app MSAL + Graph **100% offline** (salvo la primera vez que se instalan dependencias).
- Crear y resetear **varios tenants** con un seed declarativo o desde el panel, en menos de un minuto.
- Otorgar permisos y consentimientos **desde el panel o la CLI**, sin pasar por el consentimiento de Microsoft.
- Ser lo bastante compatible como para que `@azure/msal-browser` / `@azure/msal-node`, MSAL.NET, `@microsoft/microsoft-graph-client` y el SDK de Graph para .NET completen flujos reales contra el emulador (con la configuración local documentada).
- Crecer por plugins: cada producto de Microsoft es un módulo que se puede encender o apagar.
- Dejar un contrato testeable contra un recorte de las OpenAPI oficiales de [microsoftgraph/msgraph-metadata](https://github.com/microsoftgraph/msgraph-metadata) (licencia MIT).

### 3.2 No-objetivos (globales)

- No es un IdP de producción ni un reemplazo de Entra, Exchange, SharePoint o Teams reales.
- No se busca paridad total con Graph (miles de endpoints). Cada etapa declara un subconjunto explícito.
- No se emulan MFA, Conditional Access, Identity Protection, PIM, Entitlement Management, B2C, ni nubes government/China.
- No se emulan SAML, WS-Federation, On-Behalf-Of, Implicit Grant ni ROPC (salvo que una etapa futura lo pida de forma explícita).
- No se clona el UX de los portales de Microsoft.
- No se usa ni se sugiere marca, logo ni dominio que se confunda con Microsoft. El nombre "Microsimulador" es temporal.
- No se exponen secrets reales ni se publica el emulador a Internet.

---

## 4. Principios

1. **Solo desarrollo.** Banner permanente en el panel y en la página de login: "Herramienta local de desarrollo. No ingresar cuentas ni secretos reales."
2. **Fidelidad de contrato, no de implementación.** Priorizamos paths, status codes, claims, envelopes `@odata` y códigos de error que los SDK esperan. Los motores internos (relevancia de People, SMTP, motor de Excel) pueden ser simplificados y deben documentarse como tales.
3. **Un producto por etapa.** No se mezcla Outlook en la etapa de Entra. Si un endpoint es prerrequisito mínimo (por ejemplo `GET /me` para cerrar el login), se declara como *superficie mínima* de esa etapa y se completa después.
4. **Multi-tenant desde el día uno.** El modelo de datos nace con `tenant_id` en casi todas las tablas.
5. **El panel no es Graph.** Graph y el authority se comportan como Microsoft. El panel y la CLI son APIs propias, autenticadas aparte (usuario local del emulador, nunca un token de un tenant simulado para administrar la plataforma… excepto la acción explícita de "impersonar").
6. **Determinismo.** Seeds con GUIDs fijos y Faker con seed numérico reproducible.
7. **Seguridad deliberadamente baja en el IdP simulado, alta en el aislamiento.** El emulador corre en localhost, con certificados de mkcert. No se publica el puerto a una red no confiable por defecto.

---

## 5. Usuarios

| Rol | Qué hace |
|---|---|
| Dev (Javier u otro) | Levanta el stack, apunta MSAL y Graph al emulador, desarrolla su app. |
| Compañero de equipo / CI | Aplica un seed versionado y corre tests de contrato. |
| Admin del emulador | Usa el panel o la CLI para crear tenants, cargar datos, otorgar consent, impersonar, inyectar fallos. |
| Usuario simulado | Cuenta falsa dentro de un tenant. Inicia sesión en la app bajo prueba o en la pantalla de login del emulador. **No es un usuario real.** |

---

## 6. Orden de las etapas (justificación)

Se construye **una etapa = un producto** (la Etapa 0 es la plataforma, no un producto de Microsoft). El orden propuesto es:

| # | Producto | Por qué va acá |
|---|---|---|
| 0 | Núcleo de plataforma | Sin modelo multi-tenant, capa HTTP/OData, seeds y el cascarón del panel, no se puede sumar ningún producto con consistencia. |
| 1 | Microsoft Entra ID | Toda la nube se sostiene en tenants, usuarios, apps, tokens y permisos. Sin esto, Graph no se puede autenticar. |
| 2 | Microsoft Graph (directorio) | Las apps no hablan "Entra puro": hablan Graph (`/users`, `/groups`, `/organization`, manager, fotos, delta). Completa la superficie de directorio. |
| 3 | People y Profile/Skills | Es un recorte chico que depende solo del directorio; Javier lo pidió explícito. Incluye `/me/people` y `/beta/.../profile/skills`. |
| 4 | Outlook / Exchange | El workload de Graph más habitual después del directorio (mail, calendario, contactos). Sirve para validar el panel (inbox falso) y más adelante los webhooks. |
| 5 | OneDrive / SharePoint | Archivos y sitios. Tiene que existir **antes** de la API de Excel, que vive sobre `driveItem`. |
| 6 | Microsoft Teams | Depende de usuarios, grupos y, en la práctica, de un directorio estable. Es más complejo (membership, canales, chats). |
| 7 | Apps de Office 365 | Metadata de Word/Excel y un subconjunto de la Excel Workbook API. Requiere la Etapa 5. |
| 8 | Webhooks y delta transversal | Las notificaciones y el delta "de verdad" solo tienen sentido cuando ya hay productos que cambian. En la Etapa 2 se puede dejar un delta mínimo de users/groups; acá se generaliza. |

Este orden se puede ajustar si un proyecto concreto necesita Teams o correo antes que People: el núcleo y Entra no se saltean.

---

## 7. Arquitectura y stack

### 7.1 Vista lógica

```
[App bajo prueba] --MSAL-->  Authority HTTPS  (OIDC/OAuth2 v2.0)
[App / Graph SDK] --Bearer--> Graph HTTPS     (/v1.0, /beta)
[Dev]             ----------> Panel Next.js   (API admin /admin/v1)
[Dev / CI]        ----------> CLI             (seeds, snapshots, reset)

                    ┌─────────────────────────────────────┐
                    │  Plataforma (Etapa 0)               │
                    │  tenancy, OData, batch, errores,    │
                    │  authn de tokens, audit log, faults │
                    ├─────────────────────────────────────┤
                    │  Plugins de producto (1..8)         │
                    │  Entra | Directory | People | Mail  │
                    │  Files | Teams | Office | Hooks     │
                    └─────────────────────────────────────┘
                         │
              Postgres (+ archivos locales / MinIO)
```

**Dos orígenes HTTPS** (recomendado, con nombres en `/etc/hosts` o `mkcert` + dominio local):

- Authority: `https://login.microsimulador.localhost:8443/{tenantId}` (también un modo *compat* `https://localhost:8443/{tenantId}`).
- Graph: `https://graph.microsimulador.localhost:8443/v1.0` y `/beta`.
- Panel: `https://panel.microsimulador.localhost:3000`.

En modo compacto, un solo listener HTTPS en `:8443` enruta por path y por `Host`. MSAL **rechaza HTTP**; el TLS local es obligatorio.

### 7.2 Stack recomendado

| Capa | Elección | Motivo |
|---|---|---|
| API Graph + OIDC | **TypeScript + Hono** (o Fastify, si preferís el plugin ecosystem) sobre Node 22+ | Ecosistema de Javier (Next, tests con MSAL.js), plugins por producto, arranque rápido. Hono es liviano y se banca varios adapters (Node, para tests in-process). |
| Alternativa | **.NET 8/9 + ASP.NET Minimal APIs** | Más natural si el cliente principal es MSAL.NET y el Graph SDK de .NET. No es la default de este PRD. |
| Panel | **Next.js + shadcn/ui + Tailwind** | Admin rico, tablas, inspectors, same-repo con el API si se desea (apps en monorepo). |
| Datos relacionales | **Postgres 16** en Docker; **SQLite** como perfil *lite* (un solo proceso, CI chico) | Multi-tenant, mail, ítems y snapshots se llevan mejor con Postgres. SQLite para demos. El acceso va detrás de un repositorio, no de SQL suelto en los handlers. |
| Blobs (fotos, mail MIME, archivos) | Sistema de archivos local (`./data/blobs`) en dev; **MinIO** (S3) opcional en Compose | Evita meter binarios en Postgres. |
| TLS | **mkcert** + certificados persistidos en `./data/tls` | Confianza en el SO y en Node (`NODE_EXTRA_CA_CERTS`). |
| Compose | `docker compose` con api, panel, postgres, minio (opcional), mail-catcher interno | Un `make up` debe alcanzar. |
| Seeds | YAML/JSON + CLI (`msim`) | Ver sección 8. |
| Contratos | Recorte de OpenAPI de `msgraph-metadata` + tests de SDK | Ver 7.5. |

Monorepo sugerido: `apps/api`, `apps/panel`, `apps/cli`, `packages/core`, `packages/odata`, `packages/plugins/*`, `packages/contracts`, `seeds/`.

### 7.3 Módulos / plugins

Cada producto registra:

- rutas Graph (`v1.0` / `beta`);
- (si aplica) rutas del authority;
- entidades y migraciones;
- contribuciones al seed schema;
- pantallas o widgets del panel;
- recursos suscribibles (Etapa 8);
- fallos inyectables (429 en `/me/messages`, latencia en upload, etc.).

Un plugin apagado no registra rutas y responde `404` con error Graph (`ResourceNotFound` / segmento desconocido), no un 500.

### 7.4 Forma Graph (núcleo, Etapa 0)

Implementar un subconjunto OData **documentado**, no el estándar completo.

**Incluido:**

- `$select` de propiedades escalares.
- `$filter` con `eq`, `ne`, `lt`, `le`, `gt`, `ge`, `startswith`, `endswith`, `contains`, `and`, `or`, `not`, paréntesis, y comparación contra `null`. En etapas posteriores se puede sumar `any()` básico en colecciones de primitivos (por ejemplo `assignedLicenses`).
- `$top`, `$skip`, `$skiptoken` (paginado opaco), `$orderby`, `$count`.
- `$expand` de **un nivel**, con allowlist por recurso (ej. `members`, `manager`).
- Envelopes: `@odata.context`, `value`, `@odata.count`, `@odata.nextLink`.
- Header `Prefer: odata.maxpagesize`, `return=minimal`.
- Header `ConsistencyLevel: eventual` cuando Graph lo exige para `$count` / ciertos `$filter` (si falta, devolver el error que Graph devolvería, no silenciarlo).
- **JSON batch** en `POST /v1.0/$batch` y `/beta/$batch`, según la [documentación oficial](https://learn.microsoft.com/en-us/graph/json-batching): hasta **20** requests, `id` + `method` + `url` relativa, `headers`/`body` opcionales, respuesta `{ "responses": [ { "id", "status", "headers", "body" } ] }`. Soportar `dependsOn` en los tres patrones documentados (paralelo, serie, todos dependen del mismo). No hace falta el batch multipart clásico en el MVP.
- Errores según [Graph error responses](https://learn.microsoft.com/en-us/graph/errors):

```json
{
  "error": {
    "code": "Request_ResourceNotFound",
    "message": "Resource '…' does not exist or one of its queried reference-property objects are not present.",
    "innerError": {
      "date": "2026-11-20T20:00:00",
      "request-id": "…",
      "client-request-id": "…"
    }
  }
}
```

Códigos habituales a implementar desde el núcleo: `BadRequest`, `InvalidAuthenticationToken`, `Unauthorized`, `Authorization_RequestDenied`, `Request_ResourceNotFound`, `Request_BadRequest`, `Conflict`, `Throttled` / `activityLimitReached` (429 + `Retry-After`).

**Fuera del núcleo (salvo que una etapa lo pida):** `$search` genérico, `$apply`, `$format`, `$expand` anidado profundo, lambdas complejas, `$delta` (se suma en 2 y 8), metadata CSDL completa en `/$metadata` (se puede exponer un recorte más adelante).

Las formas de los JSON (nombres de propiedades, `@odata.type`) se derivan de un **recorte** de las OpenAPI en [msgraph-metadata](https://github.com/microsoftgraph/msgraph-metadata) (`openapi/v1.0/openapi.yaml` y `openapi/beta/openapi.yaml`). El YAML completo de v1.0 pesa decenas de MB: **no** se alimenta entero a un mock genérico tipo Prism. Se versiona un subset generado (script en el repo) con los paths de cada etapa.

### 7.5 Tests de contrato

Obligatorios a partir de la Etapa 1 (y se van ampliando):

- Discovery + JWKS + emisión y validación de JWT (RS256, `kid` estable).
- Flujo Authorization Code + PKCE con **MSAL.js / MSAL Node** y, si hay entorno, **MSAL.NET**.
- Client credentials con scope `https://graph.microsoft.com/.default` (o el host Graph local equivalente documentado).
- Llamadas con **@microsoft/microsoft-graph-client** y, cuando se pueda en CI, Microsoft.Graph (.NET) contra `/me`, `/users`, `/groups`.
- Validación de responses contra el recorte OpenAPI (schemathesis, dredd, o un validador AJV generado).
- Tests de `$batch`, errores y paginado.

Configuración MSAL documentada (la app bajo prueba **sí cambia config**, no código de negocio):

```jsonc
{
  "auth": {
    "clientId": "<app-id>",
    "authority": "https://localhost:8443/<tenant-id>",
    "knownAuthorities": ["localhost:8443"],
    "redirectUri": "https://localhost:3000"
  }
}
```

Hay que documentar también `instanceDiscovery: false` (o el equivalente por lenguaje) y cómo confiar el certificado de mkcert. MSAL no acepta `http://`. El `iss` del token tiene que coincidir con lo que publica el discovery.

### 7.6 Identidad de tokens (forma Entra v2.0)

Access token e ID token firmados RS256, con claims habituales de la v2.0:

- `iss`, `aud`, `exp`, `nbf`, `iat`, `sub` (pairwise por app, como Entra, o documentar si en v1 usamos `sub == oid` y lo corregimos después), `oid`, `tid`, `ver: "2.0"`.
- Delegados: `scp` (espacios, scopes concedidos).
- App-only: `roles` (app roles concedidos).
- `preferred_username`, `name`, `azp`, `appid` (si se emula), `acct` opcional.
- Group claims opcionales por app registration; si hay overage, payload al estilo Entra (`_claim_names` / `_claim_sources` y Graph `/me/checkMemberGroups` o el endpoint que documentemos).

El emulador valida el Bearer en Graph: firma, `iss`, `aud` (Graph o app resource), `tid` existente, expiración, y **enforcement de scopes/roles** según el endpoint (403 `Authorization_RequestDenied` si falta).

---

## 8. Motor de seeds, CLI y snapshots

### 8.1 Formato declarativo

Un tenant es un directorio (o un set) YAML/JSON versionable. Ejemplo mínimo:

```yaml
# seeds/contoso.yaml
tenant:
  id: "11111111-1111-1111-1111-111111111111"
  displayName: "Contoso Ltd"
  verifiedDomains:
    - name: contoso.test
      isDefault: true
users:
  - id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"
    userPrincipalName: alice@contoso.test
    displayName: Alice Contoso
    jobTitle: Ingeniera
    department: Ingeniería
    password: "Password1!"   # solo dev; se guarda hasheado
    managerUpn: bob@contoso.test
groups:
  - id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1"
    displayName: Ingeniería
    mailNickname: ingenieria
    members: [alice@contoso.test]
applications:
  - appId: "cccccccc-cccc-cccc-cccc-ccccccccccc1"
    displayName: Mi SPA
    publicClient: true
    redirectUris: ["https://localhost:3000"]
    requiredDelegatedScopes: ["User.Read", "Mail.Read"]
consents:
  - appId: "cccccccc-cccc-cccc-cccc-ccccccccccc1"
    principal: alice@contoso.test   # o "admin" para admin-consent
    scopes: ["User.Read", "Mail.Read"]
```

Los plugins extienden el schema (`mailboxes`, `events`, `drives`, `teams`, `skills`, etc.). Un seed de una etapa posterior tiene que ser válido aunque el plugin esté apagado: se ignora la sección o se avisa.

### 8.2 Generador Faker

```text
msim seed generate --preset empresa --users 50 --groups 8 --locale es_AR --seed 42 --out seeds/acme.yaml
```

Presets: `empresa`, `educacion`, `startup`, `vacio`. El `--seed` numérico hace el output reproducible (mismos GUIDs y nombres). Faker no inventa datos ofensivos; nombres y UPNs usables en demos.

### 8.3 Operaciones

| Comando | Qué hace |
|---|---|
| `msim up` / `msim down` | Levanta o baja Compose. |
| `msim seed apply <file>` | Aplica (idempotente o con `--replace`) un seed a un tenant. |
| `msim seed export <tenant> -o file` | Exporta el estado actual a YAML/JSON. |
| `msim seed generate …` | Genera un seed con Faker. |
| `msim reset [--tenant id]` | Vuelve al seed inicial o a vacío. |
| `msim snapshot save <nombre>` | Guarda un snapshot (DB + blobs + metadata). |
| `msim snapshot restore <nombre>` | Restaura. |
| `msim token mint --user alice@contoso.test --app <appId> --scopes User.Read` | Emite un token sin pasar por el login interactivo (equivalente a impersonar). |
| `msim faults set --path '/v1.0/me/messages' --status 429` | Inyecta un fallo. |

Los mismos verbos existen en `POST /admin/v1/...`. Reset y apply quedan auditados en el request log.

---

## 9. Panel de administración externo

Objetivo: **no depender del procedimiento de Microsoft**. El panel es la vía rápida para armar un escenario de prueba.

Capacidades transversales (el cascarón nace en la Etapa 0; las pantallas de producto se agregan en su etapa):

- Lista y alta de **tenants** (nombre, dominio, IDs). Switcher de tenant activo.
- CRUD de **usuarios, grupos, membresías**.
- **App registrations** y service principals: redirect URIs, secrets (se muestran una sola vez), scopes, app roles.
- **Permisos y consentimientos** con un clic (user consent y admin consent), sin pantalla de Microsoft. Se puede revocar.
- **Impersonar**: elige usuario + app + scopes y copia un access token (o abre una sesión de preview).
- **Request log / inspector**: método, URL, headers redacted, status, duración, tenant, scopes vistos, body recortado. Filtros y replay básico (GET).
- **Inyección de fallos**: 429 con `Retry-After`, 500, latencia fija o jitter, 401 por token "vencido", timeout. Por path glob y método; one-shot o persistente.
- Salud del sistema, certificados, disco de blobs, botón de reset/snapshot.
- Banner "solo desarrollo" siempre visible.

Pantallas por producto (mail, Teams, sites, etc.) se detallan en cada etapa.

Auth del panel: usuario/password local del emulador (o un token de servicio de CLI), **distinto** de las cuentas del tenant simulado. Por defecto `admin@local` / password de desarrollo documentado, configurable por env.

---

## 10. Etapas

Los esfuerzos son **estimaciones para un dev solo**, en semanas de trabajo enfocado, no un compromiso de calendario. Incluyen tests de contrato del recorte de esa etapa, no pulido de UI de más.

---

### Etapa 0 — Núcleo de plataforma

**Objetivo.** Tener el esqueleto sobre el que se enchufan los productos: multi-tenant, servidor HTTPS, capa Graph-compatible (OData básico, batch, errores), motor de seeds, CLI y el cascarón del panel (tenants vacíos, inspector, fallos, snapshots).

**Alcance.**

- Modelo: `Tenant`, `AuditEvent`, `RequestLog`, `FaultRule`, `SnapshotMetadata`. Todavía no hay users de Entra (puede existir un "tenant placeholder").
- Servidor HTTPS con mkcert; ruteo authority/graph/panel (el authority puede devolver 501 hasta la Etapa 1, excepto health).
- Middleware OData del subconjunto de la sección 7.4, sobre un recurso de ejemplo interno `GET /v1.0/devPlaceholder` (o similar) **solo para probar la capa**; no es un path de Graph y se quita o se deja detrás de un flag.
- `POST /$batch` funcionando contra las rutas ya registradas.
- Persistencia Postgres + migraciones; perfil SQLite.
- Seed engine: apply/export/reset/snapshot sobre el schema de plataforma (tenants).
- CLI: `up`, `down`, `seed`, `reset`, `snapshot`, `faults`.
- Panel: login local, lista de tenants, inspector vacío, toggle de fallos, reset/snapshot.
- OpenAPI recortada (casi vacía) y pipeline para ir agregando paths.
- Telemetría básica: contador de requests, latencia p95 interna.

**Endpoints (plataforma).**

| Método | Path | Notas |
|---|---|---|
| GET | `/health` | Público. |
| GET | `/admin/v1/tenants` | CRUD de tenants. |
| POST/PATCH/DELETE | `/admin/v1/tenants` / `/{id}` | |
| GET | `/admin/v1/requests` | Inspector. |
| POST | `/admin/v1/faults` | |
| POST | `/admin/v1/seeds:apply` etc. | También vía CLI. |
| POST | `/v1.0/$batch`, `/beta/$batch` | Infra; los ítems internos 404 si no hay plugin. |

**Modelo de datos.** Tenant (id GUID, displayName, createdAt, defaultDomain nullable hasta Etapa 1), logs, faults, snapshots.

**Seeds.** Un `tenants.yaml` con uno o dos directorios vacíos.

**Panel.** Shell, navegación, tenants, inspector, faults, snapshots.

**Criterios de aceptación.**

- `docker compose up` deja HTTPS válido (mkcert) y el panel abre.
- Se crea un tenant por panel y por CLI, se exporta y se resetea.
- Un GET de prueba respeta `$select`, `$filter eq`, `$top`, `$orderby`, `$count` y devuelve `@odata.nextLink` al paginar.
- `$batch` con 2 GETs devuelve responses correlacionados por `id`.
- Un fault 429 one-shot se ve en el inspector y cumple `Retry-After`.
- Un error a propósito usa el JSON de Graph (`error.code` + `innerError.request-id`).

**Fuera de alcance.** Tokens, users, cualquier path real de Graph de producto.

**Esfuerzo estimado:** 3–5 semanas.

---

### Etapa 1 — Microsoft Entra ID

**Objetivo.** Emular el IdP y el directorio de identidad: tenants con dominio, users, groups, app registrations, service principals, OIDC/OAuth2 v2.0, consent y roles. Una app MSAL puede loguear a un usuario falso y obtener un access token verificable. El panel otorga permisos sin el flujo de Microsoft.

**Alcance.**

- Entidades de directorio: users, groups (security + M365 básico a nivel de propiedades, sin team todavía), membership, applications, service principals, delegated permission grants, oauth2 permission scopes, app roles, app role assignments, directory roles (un set fijo: Global Administrator, User Administrator, Application Administrator; no el catálogo completo).
- Endpoints OIDC/OAuth2 v2.0 alineados a Entra:
  - `GET /{tenant}/v2.0/.well-known/openid-configuration` (también `/common` y `/organizations` resolviendo al tenant elegido en el login, o documentar que hay que usar el GUID).
  - `GET /{tenant}/discovery/v2.0/keys` (JWKS).
  - `GET/POST /{tenant}/oauth2/v2.0/authorize` (Authorization Code + PKCE S256).
  - `POST /{tenant}/oauth2/v2.0/token` (authorization_code, refresh_token, client_credentials; `scope` con `/.default` en app-only).
  - `POST /{tenant}/oauth2/v2.0/devicecode` + pantalla de aprobación.
  - `GET /{tenant}/oauth2/v2.0/logout`.
  - `GET /{tenant}/openid/userinfo` (o el path que publique el discovery).
- Pantalla de login del emulador (account picker + password de dev). Sin MFA.
- Consent: si faltan scopes, pantalla simple **o** rechazo; en la práctica el happy path es pre-consentir desde el panel. Se registran grants.
- Graph mínimo imprescindible para cerrar el loop (se completa en Etapa 2): `GET /v1.0/me`, `GET /v1.0/me/memberOf` (opcional), tal vez `GET /v1.0/users` read-only. El CRUD Graph completo no es de esta etapa.
- Admin API / panel: users, groups, apps, secrets, scopes, consent, impersonar, mint de token.

**Endpoints (authority + admin + Graph mínimo).** Además de los OIDC de arriba:

| Método | Path | Notas |
|---|---|---|
| GET | `/v1.0/me` | Usuario del token delegado. |
| GET | `/v1.0/users`, `/v1.0/users/{id\|upn}` | Lectura mínima. |
| GET | `/v1.0/groups`, `/v1.0/groups/{id}` | Lectura mínima. |
| POST/GET/DELETE | `/admin/v1/tenants/{id}/users` … | Superficie del panel. |
| POST | `/admin/v1/tokens:mint` | Impersonación. |

**Modelo.** User, Group, GroupMember, Application, ServicePrincipal, PasswordCredential, RedirectUri, PermissionScope, AppRole, AppRoleAssignment, OAuth2PermissionGrant, DirectoryRole, DirectoryRoleAssignment, RefreshToken, AuthorizationCode, DeviceCode. Passwords y secrets hasheados; signing key persistida (dev).

**Seeds.** Users, groups, apps, consents, directory roles. Seed determinístico de demo: tenant Contoso, Alice y Bob, grupo Ingeniería, una SPA pública y un daemon confidencial (credenciales de dev documentadas, nunca reales).

**Panel.** Usuarios, grupos, membresías, app registrations (redirects, secrets de un solo uso, scopes, app roles), grants de consentimiento, directory roles, botón "Impersonar / mint token", preview del JWT decodificado.

**Criterios de aceptación.**

- MSAL Node (y, si se puede, MSAL.NET) completa Authorization Code + PKCE contra el authority local con `knownAuthorities` y TLS de mkcert.
- El JWT valida contra JWKS; `iss` coincide con el discovery; trae `tid`, `oid`, `ver: "2.0"`, `scp` o `roles`.
- Client credentials con `/.default` emite token app-only con `roles`.
- Device Code: el usuario aprueba en la página del emulador y la app recibe el token.
- Refresh token rota y funciona; un reuse detectado puede revocar la familia (deseable; si se posterga, documentarlo).
- Graph `GET /me` con un token sin `User.Read` (ni equivalente) devuelve 403 `Authorization_RequestDenied`.
- Desde el panel se otorga `Mail.Read` a una app (aunque Mail aún no exista) y el próximo token incluye el scope.
- Impersonar copia un token que el SDK acepta.
- Un test e2e de contrato queda en CI.

**Fuera de alcance.** MFA, Conditional Access, SAML, WS-Fed, OBO, ROPC, Implicit, B2B/B2C, PIM, CA policies, identity protection, custom claims mapping engine (un subset estático de optional claims sí puede entrar si es barato), admin consent workflow de Entra, publisher verification.

**Esfuerzo estimado:** 5–8 semanas. Es la etapa más riesgosa (MSAL).

---

### Etapa 2 — Microsoft Graph: directorio core

**Objetivo.** Completar la superficie Graph de organización y directorio con la que las apps listan y mutan users/groups, leen la org, la jerarquía de managers, fotos y un delta básico.

**Alcance.**

- CRUD Graph de users y groups, no solo lectura.
- `organization`, dominios verificados (ya hay default domain).
- `manager` y `directReports` (`PUT/GET/DELETE` de la referencia manager).
- Fotos: `GET/PUT/DELETE /users/{id}/photo`, `/$value` (jpeg/png en blob store).
- Membresías: `/groups/{id}/members`, `/users/{id}/memberOf`, add/remove refs (`$ref`).
- `checkMemberGroups` / `getMemberGroups` en un recorte simple (sin transitividad infinita; transitividad de grupos anidados **sí**, con un límite documentado).
- Delta: `GET /users/delta`, `GET /groups/delta`, con `@odata.deltaLink` y tokens opacos. Sin garantías de "eventual consistency" de Azure; puede ser inmediato y single-page al principio, documentado.
- `$expand=manager,directReports,members` (un nivel, con tope).
- Propiedades habituales: `displayName`, `givenName`, `surname`, `mail`, `userPrincipalName`, `jobTitle`, `department`, `officeLocation`, `mobilePhone`, `businessPhones`, `accountEnabled`, `userType`, `createdDateTime`.

**Endpoints (principal; v1.0, y los mismos en beta cuando la forma coincida).**

| Método | Path |
|---|---|
| GET/POST | `/users` |
| GET/PATCH/DELETE | `/users/{id\|upn}` |
| GET/PUT/DELETE | `/users/{id}/photo`, `/users/{id}/photo/$value` |
| GET | `/users/{id}/manager`, `/users/{id}/directReports` |
| PUT/DELETE | `/users/{id}/manager/$ref` |
| GET | `/users/delta` |
| GET/POST | `/groups` |
| GET/PATCH/DELETE | `/groups/{id}` |
| GET/POST/DELETE | `/groups/{id}/members`, `/members/$ref` |
| GET | `/groups/{id}/owners` (básico) |
| GET | `/groups/delta` |
| GET | `/organization`, `/organization/{id}` |
| GET | `/me` (completo, alineado a user) y `/me/photo*` |

**Modelo.** Se reusan las entidades de la Etapa 1 + `ProfilePhoto`, `DirectoryDeltaCursor`, propiedades extra de org (`Organization`, `Domain`).

**Seeds.** Jerarquía de managers, fotos placeholder, más users para paginar y filtrar de verdad.

**Panel.** Editor de organigrama simple, upload de foto, vista de membresías, botón "forzar delta" (opcional).

**Criterios de aceptación.**

- El Graph SDK lista users con `$select`, `$filter=startswith(displayName,'A')`, `$top` y sigue `@odata.nextLink`.
- Se crea un user por POST Graph y aparece en el panel; se asigna manager y `directReports` cierra el ciclo.
- `GET /me/photo/$value` devuelve la imagen; sin foto, el 404 de Graph (`ImageNotFound` o el código que documentemos según la API real, a verificar en implementación contra la doc vigente).
- `/users/delta` después de un PATCH devuelve el cambio en la siguiente ronda con `deltaLink`.
- Enforcement de `User.Read.All` / `Directory.Read.All` / `Group.ReadWrite.All` en modo app-only y delegado.

**Fuera de alcance.** Privileged identity, administrative units, schema extensions complejas, directory extensions filtrables, soft-delete completo de todas las entidades (la papelera de users/groups es deseable si entra barato; si no, se documenta y pasa a un hotfix). Invitaciones B2B.

**Esfuerzo estimado:** 2–4 semanas.

---

### Etapa 3 — People y Profile / Skills

**Objetivo.** Cubrir las APIs de personas y skills que Javier quiere probar, con honestidad sobre lo que no se puede emular de verdad.

**Nota importante (tres superficies distintas):**

1. **People API** — `GET /v1.0/me/people` (y `/users/{id}/people`). Devuelve personas "relevantes". En Graph real el orden default es por relevancia de colaboración; la API está en *maintenance mode* y para desarrollo nuevo Microsoft apunta a `POST /search/query` con `entityTypes: ["person"]`. Acá implementamos `/me/people` con **relevancia estática o heurística simple** (mismo departamento, mismo manager, mismo grupo, recency ficticia). Se documenta que **no** hay motor de insights.
2. **Profile skills (beta)** — `GET/POST /beta/me/profile/skills`, `/beta/users/{id}/profile/skills`, GET/PATCH/DELETE `/beta/users/{id}/profile/skills/{id}`. Es [API beta](https://learn.microsoft.com/en-us/graph/api/profile-list-skills?view=graph-rest-beta) y **puede cambiar**. Forma `skillProficiency`: `displayName`, `proficiency`, `categories`, `collaborationTags`, `allowedAudiences`, etc. Application permissions no están soportadas en la API real: el emulador debe respetar eso (solo delegado) o, si se agrega un flag `DEV_RELAX_PERMISSIONS`, avisarlo en el panel.
3. **People Skills de Copilot** — producto aparte (import/export, live profile card). **Fuera de alcance** en esta etapa. Si más adelante hace falta, será un incremento explícito.

También entra un recorte chico de profile si resulta natural: `/beta/me/profile` (nombres, posiciones) — opcional, no bloqueante.

**Endpoints.**

| Método | Path | Versión |
|---|---|---|
| GET | `/me/people`, `/users/{id}/people` | v1.0 |
| GET/POST | `/me/profile/skills`, `/users/{id}/profile/skills` | **beta** |
| GET/PATCH/DELETE | `/…/profile/skills/{id}` | **beta** |

Soportar `$select`, `$top`, `$skip`, `$orderby`, `$filter` en skills, como indica la doc.

**Modelo.** `PersonRelevance` (o una vista calculada), `SkillProficiency`.

**Seeds.** Skills por usuario (ej. "API Design", "TypeScript") y una matriz de "relevancia" declarativa opcional (`peopleScores`).

**Panel.** Editar skills, preview de `/me/people` para un usuario impersonado, aviso visible de que la relevancia es simulada y de que skills es beta.

**Criterios de aceptación.**

- `GET /v1.0/me/people?$top=10` devuelve users del tenant en forma `person`, orden heurístico estable con el mismo seed.
- CRUD de skills en beta, con `$select=displayName,proficiency`.
- Un cliente Graph beta (o request HTTP) puede crear una skill y volver a listarla.
- Sin token delegado, skills responde como la API real (no soporta app-only), salvo flag documentado.

**Fuera de alcance.** Motor real de relevancia, `/search/query`, People Skills de Copilot, people connectors, insights de Office Delve.

**Esfuerzo estimado:** 1–2 semanas.

---

### Etapa 4 — Outlook / Exchange

**Objetivo.** Emular un buzón lo bastante útil: leer y enviar mail, carpetas, calendario y contactos. El panel tiene una **bandeja falsa** (no es un SMTP de Internet; opcionalmente un listener SMTP local solo para inyectar mensajes de prueba).

**Alcance.**

- `mailFolders` (Inbox, SentItems, Drafts, DeletedItems, y carpetas custom básicas).
- `messages`: list, get, `$filter` (receivedDateTime, isRead, from/subject contains o eq), `$select`, `$top`, mime `$value` básico.
- Crear drafts, `sendMail`, enviar un draft; los destinatarios **del mismo tenant** reciben en Inbox; los externos se registran como "entregados al void" y se ven en el panel (outbox log).
- Flags `isRead`, move, delete (soft a DeletedItems).
- Calendario: `/me/events`, calendarios default, CRUD, `start`/`end` timezone simple, `calendarView` con `startDateTime`/`endDateTime`.
- Contactos: `/me/contacts` CRUD básico.
- Panel: inbox por usuario, componer/inyectar un mail entrante, ver raw, no hace falta un cliente IMAP completo.
- SMTP falso en el panel o `msim mail inject --to alice@contoso.test --subject Hola` (y, si es barato, un puerto SMTP local 1025 solo de ingreso, tipo Mailhog, mapeado a Inbox). **No se entrega mail a Internet.**

**Endpoints (sobre `/me` y `/users/{id}`).**

| Método | Path |
|---|---|
| GET | `/mailFolders`, `/mailFolders/{id}`, `/mailFolders/{id}/messages` |
| GET/PATCH/DELETE | `/messages/{id}`, `/messages/{id}/$value` |
| POST | `/me/sendMail`, `/messages`, `/messages/{id}/send`, `/messages/{id}/move` |
| GET/POST | `/events`, `/calendar/events`, `/calendarView` |
| GET/PATCH/DELETE | `/events/{id}` |
| GET/POST | `/contacts` |
| GET/PATCH/DELETE | `/contacts/{id}` |

**Modelo.** Mailbox, MailFolder, Message (headers, body html/text, attachments livianos), Event, Calendar, Contact, Attachment (limitado, p.ej. 5 MB).

**Seeds.** Un hilo de bienvenida, 2–3 eventos de la semana, contactos de la empresa.

**Panel.** Bandeja por usuario (inbox/sent/drafts), inyector de correo entrante, calendario mes, lista de contactos.

**Criterios de aceptación.**

- Un token con `Mail.Read` lista Inbox con forma Graph; sin el scope, 403.
- `sendMail` de Alice a Bob (mismo tenant) deja el mensaje en Sent de Alice y en Inbox de Bob.
- `calendarView` respeta el rango de fechas.
- El panel muestra el mail y permite inyectar uno nuevo que aparece en un `GET /me/messages` siguiente.
- Attachments chicos redondos (subir y bajar).

**Fuera de alcance.** EWS, MAPI, reglas complejas, retention, Information Protection, rooms/equipment reales, mailboxes compartidos avanzados, Outlook add-ins, envío real por Internet, S/MIME, Graph `$search` KQL completo (se puede un `$search` muy limitado si es barato).

**Esfuerzo estimado:** 4–6 semanas.

---

### Etapa 5 — OneDrive / SharePoint

**Objetivo.** Drives, archivos y un SharePoint mínimo (sites y lists) para que una app suba/baje archivos y liste sitios.

**Alcance.**

- Drive de usuario (`/me/drive`, `/users/{id}/drive`) y document library default de un site.
- `driveItem`: carpeta y archivo, `children`, path `/root:/path:`, upload simple (`PUT …/content`) y **upload session** para archivos más grandes (umbral tipo 4 MB, alineado a Graph).
- Download `/$value`, rename, move, delete (recycle básico deseable).
- Thumbnails: placeholder o 404 documentado.
- Sites: al menos un root site por tenant + sites declarados en el seed; `GET /sites/{id}`, `GET /sites?search=` simple.
- Lists: CRUD de `list` y `listItem` (columnas básicas: text, number, date, boolean). No se busca paridad con todos los tipos de columna ni con Power Automate.

**Endpoints (recorte).**

| Método | Path |
|---|---|
| GET | `/me/drive`, `/me/drives`, `/users/{id}/drive` |
| GET/POST | `/drives/{id}/root/children`, `/drives/{id}/items/{id}/children` |
| GET/PATCH/DELETE | `/drives/{id}/items/{id}` |
| GET/PUT | `/drives/{id}/items/{id}/content` |
| POST | `/drives/{id}/items/{id}/createUploadSession` |
| GET | `/sites`, `/sites/{id}`, `/sites/{id}/drives` |
| GET/POST | `/sites/{id}/lists`, `/lists/{id}/items` |
| GET/PATCH/DELETE | `/lists/{id}/items/{id}` |

**Modelo.** Drive, DriveItem, UploadSession, Site, List, ListItem, ListColumn. Contenido en blob store.

**Seeds.** Sitio "Intranet", biblioteca Documentos, una carpeta compartida, un Excel y un Word dummy (binarios placeholder).

**Panel.** Explorador de archivos por drive, upload, sites y un editor simple de list items.

**Criterios de aceptación.**

- El Graph SDK sube un archivo a `/me/drive/root:/hola.txt:/content` y lo vuelve a bajar.
- Upload session de un archivo > umbral completa los chunks.
- Se lista un site y sus lists; un POST de listItem se lee después.
- Permisos `Files.ReadWrite`, `Sites.Read.All` enforced.

**Fuera de alcance.** Sharing links avanzados, permissions granulares de item al nivel de SharePoint real, OneDrive sync client, pages, web parts, term store, search de SharePoint, retention, sensitivity labels, versiones completas (un historial simple es opcional).

**Esfuerzo estimado:** 4–6 semanas.

---

### Etapa 6 — Microsoft Teams

**Objetivo.** Un Teams usable para apps que listan teams/canales, leen y postean mensajes, y manejan chats y membership.

**Alcance.**

- Team asociado a un grupo M365 (propiedad `resourceProvisioningOptions: ["Team"]`).
- Canales standard (el canal "General" al crear el team); canales privados si es razonable, si no quedan documentados como fuera.
- Mensajes de canal: list, get, post, replies un nivel.
- Chats 1:1 y de grupo: crear, listar, postear.
- Membership de team y de chat (`conversationMember`).
- Instalación de apps de Teams: **fuera** o un stub que solo lista, sin el runtime del manifiesto.

**Endpoints (recorte).**

| Método | Path |
|---|---|
| GET/POST | `/teams`, `/groups/{id}/team` |
| GET/PATCH | `/teams/{id}` |
| GET/POST | `/teams/{id}/channels`, `/channels/{id}/messages` |
| GET/POST | `/channels/{id}/messages/{id}/replies` |
| GET/POST | `/teams/{id}/members` |
| GET/POST | `/me/chats`, `/chats/{id}/messages`, `/chats/{id}/members` |

**Modelo.** Team, Channel, Chat, ChatMessage, ConversationMember.

**Seeds.** Un team "Ingeniería", canal General + "random", un chat Alice–Bob, algunos mensajes.

**Panel.** Vista tipo lista de teams/canales/chats, thread de mensajes, alta de team y de miembro. No hace falta un cliente de chat en tiempo real (polling alcanza).

**Criterios de aceptación.**

- Crear un team (o habilitar team en un grupo) deja el canal General.
- Un token con `ChannelMessage.Read.All` / `Chat.ReadWrite` (los scopes exactos se alinean a la doc vigente) lista y postea; el mensaje aparece en el panel y en un GET siguiente.
- Membership se refleja en Graph y en el panel.

**Fuera de alcance.** Meetings/Graph communications, presence real, calling, tabs, bots/RTM, adaptive cards avanzadas, migraciones, compliance eDiscovery, private channels completos si encarece, reactive notifications (eso es Etapa 8).

**Esfuerzo estimado:** 4–6 semanas.

---

### Etapa 7 — Apps de Office 365 (Word / Excel) y futuro

**Objetivo.** Metadata de documentos Office en el drive y un **subconjunto de la Excel Workbook API**. No se reimplementa el motor de Excel ni Word Online.

**Alcance.**

- Detectar por extensión/MIME `xlsx`, `docx`, `pptx` en `driveItem` (`file.mimeType`, `fileExtension`, facets).
- Excel, según la [Workbook API](https://learn.microsoft.com/en-us/graph/api/resources/excel?view=graph-rest-1.0):
  - `GET /me/drive/items/{id}/workbook/worksheets`
  - CRUD básico de worksheets (list, get, add, delete)
  - `GET/PATCH …/workbook/worksheets/{id|name}/range(address='A1:B2')` con `values`, y si es razonable `text` / `formulas` simples
  - crear sesión `workbook/createSession` y respetar header `Workbook-Session-Id` (persistir o no, como Graph: sesión persistente vs ephemeral, en una versión simplificada)
- Word/PowerPoint: solo metadata del `driveItem`. Nada de REST de manipulació de párrafos o slides en esta etapa.
- El `.xlsx` se puede guardar internamente como JSON de hojas (no hace falta OpenXML perfecto al inicio); si se importa un xlsx real, un parser mínimo o un "solo los archivos generados por el emulador son editables" debe quedar documentado. Preferible: generar xlsx simples y leer/escribir ese subconjunto.

**Endpoints (recorte Excel).**

| Método | Path |
|---|---|
| POST | `/me/drive/items/{id}/workbook/createSession` |
| GET/POST | `…/workbook/worksheets` |
| GET/PATCH/DELETE | `…/workbook/worksheets/{id}` |
| GET/PATCH | `…/workbook/worksheets/{id}/range(address='…')` |
| GET | `…/workbook/worksheets/{id}/usedRange` (si es barato) |

**Modelo.** WorkbookSession, Worksheet, Range (sparse). Relación 1:1 con un `driveItem`.

**Seeds.** Un `presupuesto.xlsx` de demo con dos hojas y un rango con números.

**Panel.** Visor/editor tabular muy simple (tipo planilla reducida) para esos xlsx, o al menos JSON de rangos.

**Criterios de aceptación.**

- Listar worksheets de un item seed y leer `range(address='A1:B2')` con `values`.
- PATCH de values y un GET posterior refleja el cambio.
- `Workbook-Session-Id` se acepta; sin archivo Excel, error Graph coherente.
- Word/PPT aparecen como driveItems con MIME correcto, sin endpoints de edición.

**Fuera de alcance.** Charts, pivot tables, named ranges complejos, funciones (`/workbook/functions/vlookup`, etc.), comments, protección de hojas, add-ins, renderizado pixel-perfect, Google-docs-like collaboration, el API de Word/PowerPoint.

**Esfuerzo estimado:** 3–5 semanas.

**Futuro (backlog, no comprometido):** OneNote, Planner, To Do, Bookings, Power Automate, Copilot People Skills, search API.

---

### Etapa 8 — Webhooks, change notifications y delta transversal

**Objetivo.** Unificar notificaciones de cambio y completar delta en los recursos que ya existen, para que una app pueda suscribirse como contra Graph.

**Alcance.** Según [change notifications](https://learn.microsoft.com/en-us/graph/change-notifications-overview) y [webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks):

- `POST /subscriptions` con `changeType`, `notificationUrl`, `resource`, `expirationDateTime`, `clientState`.
- Handshake de validación: Graph envía un validation token al `notificationUrl` y exige la respuesta en texto plano. En local, el endpoint del cliente suele no ser público: el emulador debe soportar:
  - notificaciones a `https://localhost/…` / host.docker.internal;
  - un **túnel documentado** (cloudflared, ngrok) como opcional;
  - un modo dev `DELIVER_TO_PANEL` que muestra la notificación en el inspector si el POST falla, más un endpoint admin para reenviar.
- Notificaciones **básicas** (id del recurso, no rich/encrypted). `includeResourceData` y cifrado quedan fuera o en un incremento posterior.
- `PATCH /subscriptions/{id}` (renovar), `GET`, `DELETE`.
- Expiración respetada; lifecycle notifications básicas (`reauthorizationRequired`, `subscriptionRemoved`) si el costo es razonable; si no, documentar la ausencia.
- Entrega at-least-once, con reintentos simples y registro en el inspector.
- Delta transversal: users, groups (ya en Etapa 2), messages, events, driveItem (si Graph lo soporta para ese recurso), teams/channel messages — solo donde la doc oficial lista delta o notifications. No inventar delta en recursos que Graph no lo tiene.
- El emulador no puede exigir que el webhook sea "públicamente accesible en Internet" como Microsoft; se documenta la diferencia.

**Endpoints.**

| Método | Path |
|---|---|
| GET/POST | `/subscriptions` |
| GET/PATCH/DELETE | `/subscriptions/{id}` |
| GET | `/{resource}/delta` ya existente + los que se sumen |

**Modelo.** Subscription, NotificationDelivery, ampliación de cursores delta.

**Seeds.** Ninguno obligatorio; un ejemplo de subscription en docs/QA.

**Panel.** Lista de subscriptions, log de deliveries, botón reenviar, toggle "entregar al panel si falla el URL".

**Criterios de aceptación.**

- `POST /subscriptions` a un servidor de test local completa el handshake y devuelve 201.
- Crear un mensaje (Etapa 4) o un user (Etapa 2) dispara una notificación al URL, con `clientState`.
- Renovar y borrar funciona; vencida, deja de entregar.
- El inspector muestra el payload y los reintentos.
- `GET /users/delta` sigue funcionando y, si se implementa, `/me/mailFolders/{id}/messages/delta` (o el path vigente) refleja un mail nuevo.

**Fuera de alcance.** Rich notifications cifradas, Azure Event Hubs / Event Grid como canal, lifecycle completo idéntico a producción, SLA de entrega, tracking de missed notifications al nivel de Graph.

**Esfuerzo estimado:** 3–5 semanas.

---

## 11. Requisitos no funcionales

| Área | Requisito |
|---|---|
| Uso | Solo local / CI aislado. Bind default a `127.0.0.1`. Compose no publica puertos a `0.0.0.0` salvo flag explícito. |
| Performance | En un laptop de dev, `GET /users` de 1.000 users con `$top=100` < 200 ms p95 (estimación objetivo, no un SLA). |
| Arranque | `compose up` listo para login en < 30 s con seed chico (objetivo). |
| Datos | Reset/snapshot en segundos para un tenant de demo (< 5.000 objetos + < 200 MB blobs). |
| Observabilidad | Inspector de requests, logs estructurados JSON, `request-id` en errores. |
| Tests | CI: unit + contrato OIDC/Graph del recorte de las etapas mergeadas. |
| Compatibilidad | Node 22+, Docker, Linux/macOS/Windows (WSL2 aceptable en Windows). |
| Config | Env vars + `microsimulador.config.yaml`. Sin secretos reales. |
| Documentación | README de arranque en 10 minutos, diferencias vs Microsoft, tabla de endpoints por etapa, guía MSAL por lenguaje. |
| Licencia del repo | A definir (recomendación: MIT o Apache-2.0). Incluir aviso de no afiliación. |
| I18N del panel | Español (es-AR) primero; la API Graph y los errores van en inglés, como Microsoft. |

---

## 12. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **MSAL y validación de authority/issuer** | Alto. Si MSAL no acepta el discovery, el proyecto no sirve. | HTTPS + mkcert desde Etapa 0/1; `knownAuthorities`; `instanceDiscovery: false` documentado; tests e2e con MSAL.js y, si se puede, MSAL.NET en CI. Reservar tiempo extra en Etapa 1. |
| **OData es un pantano** | Alto si se persigue el estándar completo. | Subconjunto cerrado (sección 7.4). Cualquier operador nuevo es un incremento explícito. Tests por caso, no "soporte OData". |
| **Drift de Graph / APIs beta** | Medio-alto, sobre todo skills y People. | Recorte versionado de [msgraph-metadata](https://github.com/microsoftgraph/msgraph-metadata); job periódico (manual al inicio) que detecte paths rotos; skills siempre marcado como beta. |
| **Alcance infinito ("que también ande Teams meetings")** | Alto para un dev solo. | Una etapa = un producto; MVP cortado en 0+1+2; lista de fuera de alcance por etapa. |
| **Marcas y presentación** | Legal / reputacional. | Nombre neutro (TBD). Disclaimer en README, login y panel. No usar logos ni nombres de producto de Microsoft como nombre de la app. "Emula comportamiento documentado públicamente para desarrollo." |
| **Confusión con un IdP real** | Seguridad. | Banner, passwords de demo, bind localhost, docs que prohíben secretos reales y exposición a Internet. |
| **Webhooks en local** | Medio (Etapa 8). | Handshake a localhost, modo panel, túnel opcional documentado. |
| **Paridad de permisos** | Medio. Un scope mal mapeado da falsos positivos en la app del dev. | Tabla de scopes por endpoint, tests de 403, flag explícito para relajar (off by default). |
| **Excel "de mentira"** | Bajo-medio. | Documentar el motor simplificado; no reivindicar paridad con Excel. |
| **Elegibilidad del sandbox oficial** | Contexto. | El emulador no lo reemplaza para QA final contra Microsoft; se recomienda un smoke test en un tenant real antes de producción del *producto del usuario*. |

Herramientas existentes (Dev Proxy, Locally, mocks OIDC, el sandbox oficial) **no son la base de código**, pero sí referencias de comportamiento y, en el caso de Dev Proxy, un complemento posible para chaos extra sin mezclarlo con el core.

---

## 13. Métricas de éxito

No es un producto comercial en esta fase. Medimos utilidad para desarrollo:

- Tiempo de un dev nuevo desde clone hasta `GET /me` con MSAL < 15 minutos (objetivo).
- Tests de contrato MSAL + Graph del MVP en verde en CI.
- Reset de un tenant de demo < 10 s (objetivo).
- Porcentaje de endpoints declarados en la etapa actual cubiertos por test de contrato (meta: ≥ 80%).
- "Escapes" a un tenant real: cuántos bugs del emulador aparecen al apuntar la misma app a Microsoft (objetivo: bajar con el tiempo; se lleva un changelog de diferencias).
- El panel permite armar un escenario (tenant + users + app + consent + token) **sin** usar el admin de Microsoft, en < 5 minutos.

---

## 14. Roadmap global (estimaciones)

| Etapa | Producto | Esfuerzo estimado | Dependencias |
|---|---|---|---|
| 0 | Núcleo de plataforma | 3–5 semanas | — |
| 1 | Microsoft Entra ID | 5–8 semanas | 0 |
| 2 | Graph directorio | 2–4 semanas | 1 |
| 3 | People y Profile/Skills | 1–2 semanas | 2 |
| 4 | Outlook / Exchange | 4–6 semanas | 2 |
| 5 | OneDrive / SharePoint | 4–6 semanas | 2 |
| 6 | Microsoft Teams | 4–6 semanas | 2 (idealmente también 5, no bloqueante) |
| 7 | Office 365 (Excel subset) | 3–5 semanas | 5 |
| 8 | Webhooks y delta transversal | 3–5 semanas | 2, y los productos que se quieran notificar (4–6) |

**MVP (etapas 0+1+2):** estimación total **10–17 semanas** de un dev solo enfocado.  
**Plataforma "completa" según este PRD (0–8):** estimación **29–47 semanas**. Son órdenes de magnitud para planificar, no un cronograma cerrado. Etapas 3–8 pueden intercalarse según la app que se esté desarrollando (por ejemplo, 4 antes que 3).

---

## 15. Checklist de aceptación del MVP (Etapas 0 + 1 + 2)

El MVP está aceptado cuando se cumple todo esto:

1. `docker compose up` (o `msim up`) deja el authority, Graph y el panel en HTTPS local con mkcert.
2. Se crea un tenant, users, groups y una app **desde el panel** y **desde un seed YAML**, y se puede resetear / exportar / restaurar un snapshot.
3. Una app de ejemplo con **MSAL** (al menos MSAL Node o MSAL.js) inicia sesión (auth code + PKCE) y obtiene un access token con claims Entra v2.0 verificable contra JWKS. El `issuer` coincide con la authority.
4. Client credentials (daemon) obtiene un token app-only con `roles`.
5. Device Code funciona con la pantalla del emulador.
6. `GET /v1.0/me`, `/users`, `/groups`, `/organization` responden con envelopes `@odata` y el subconjunto OData declarado.
7. CRUD de users/groups por Graph, manager/directReports, foto `$value`, paginado y `$filter` básico.
8. `GET /users/delta` y `/groups/delta` devuelven cambios posteriores a un PATCH.
9. `$batch` JSON (hasta 20) correlaciona `id` y ejecuta GETs/PATCHs de directorio.
10. El panel otorga y revoca consent/scopes **sin** flujo de Microsoft; un token posterior refleja el cambio. Un token sin el scope correcto recibe 403 `Authorization_RequestDenied`.
11. Impersonar / `msim token mint` emite un token usable por el Graph SDK.
12. El inspector registra las llamadas; un fault 429 one-shot es observable.
13. Hay tests de contrato en CI contra el recorte OpenAPI y al menos un SDK oficial (JavaScript). Idealmente también MSAL.NET o Graph .NET, o queda explícito como deuda del MVP.
14. README con disclaimer, guía de 10 minutos, diferencias vs Microsoft y la config MSAL (HTTPS, `knownAuthorities`, certificado).
15. El software no se presenta como producto de Microsoft; el nombre en UI es el placeholder o el definitivo, con leyenda "emulador no oficial para desarrollo local".

---

## 16. Fuera de alcance global (resumen)

- Producción, Internet-facing, alta disponibilidad, compliance (SOC, HIPAA, etc.).
- MFA, Conditional Access, PIM, Identity Protection, Entitlement Management, B2C, B2B completo.
- SAML, WS-Fed, OBO, ROPC, Implicit.
- Nubes GCC / China / DoD.
- Paridad total de Graph, `$search` KQL, `$apply`, metadata OData completa.
- Teams meetings/calling, Outlook de escritorio, clientes de sync, Office Online completo, Copilot, Power Platform, Intune, Purview, Defender.
- People Skills de Copilot (distinto de `/profile/skills`).
- Envío real de correo a Internet.
- Reivindicar compatibilidad "100%" con Microsoft.

---

## 17. Referencias

- [Microsoft Graph OpenAPI (msgraph-metadata)](https://github.com/microsoftgraph/msgraph-metadata)
- [JSON batching](https://learn.microsoft.com/en-us/graph/json-batching)
- [Graph error responses](https://learn.microsoft.com/en-us/graph/errors)
- [Profile skills (beta)](https://learn.microsoft.com/en-us/graph/api/profile-list-skills?view=graph-rest-beta)
- [People API](https://learn.microsoft.com/en-us/graph/api/user-list-people?view=graph-rest-1.0)
- [Change notifications](https://learn.microsoft.com/en-us/graph/change-notifications-overview) y [webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks)
- [Excel Workbook API](https://learn.microsoft.com/en-us/graph/api/resources/excel?view=graph-rest-1.0)
- [M365 Developer Program FAQ](https://learn.microsoft.com/en-us/office/developer-program/microsoft-365-developer-program-faq) (elegibilidad del sandbox oficial)
- [Dev Proxy](https://github.com/dotnet/dev-proxy) (complemento de mocks/chaos, no la base)
- [Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer) (exploración de la API real)

Este PRD no implica afiliación con Microsoft. "Microsoft", "Microsoft 365", "Entra ID", "Azure AD", "Microsoft Graph", "Outlook", "Exchange", "OneDrive", "SharePoint", "Teams", "Office" y "MSAL" son marcas de Microsoft.

---

## 18. Próximos pasos

1. Cerrar el **nombre** definitivo del producto UI (reemplazar "Microsimulador"). El repo ya se llama **ms-sandbox**.
2. ~~Confirmar el stack~~ — **hecho:** TypeScript + Hono + Postgres + Next.js/shadcn + pnpm (`ADR-001`). Variante .NET descartada salvo ADR nuevo.
3. Tras merge del init a `develop`, abrir la **Etapa 0** vía `incu-way-development` (slug sugerido `000-platform-core`).
4. Inmediatamente después, **Etapa 1** con un spike de MSAL en la primera semana, para no descubrir al final que el discovery no cierra.

Si este documento cierra, la implementación puede seguir el orden de las etapas y usar esta lista de aceptación como definición de terminado de cada una.
