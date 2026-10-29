# svelteRedisAdmin — Roadmap

A modern, JavaScript/TypeScript re-implementation of **phpRedisAdmin**
(https://github.com/erikdubbelboer/phpRedisAdmin) built with **SvelteKit + Svelte 5**, sharing the
tech stack and the NextAdmin-inspired look of `../svelteMyAdmin`. Goal: feature parity where it
makes sense, with a modern UI and a maintainable test suite.

## Architecture decisions

| Concern         | Choice                                                                | Why                                                   |
| --------------- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| Framework       | SvelteKit 3, Svelte 5 (runes), TypeScript strict                      | Same stack as svelteMyAdmin; SSR + endpoints          |
| Runtime         | `@sveltejs/adapter-node`                                              | Redis connections need a long-lived Node server       |
| Redis driver    | `redis` (node-redis v5)                                               | Official client, SCAN cursor API, all data types, TLS |
| Styling         | Tailwind CSS v4 + shadcn-svelte (bits-ui) + mode-watcher              | Modern look (see `DESIGN.md`), light/dark             |
| Validation      | `zod` on every form action / endpoint                                 | Typed, testable input handling                        |
| Tests           | Vitest (unit + component) against a real Redis (Docker :33380/:33381) | Real server behaviour                                 |
| E2E             | Playwright                                                            | Critical user flows                                   |
| Package manager | pnpm, Node >= 22                                                      |                                                       |

### Server-side layout

- `src/lib/server/config/` — loads `config.json` (or `config.sample.json`) with a zod schema using
  **phpRedisAdmin-compatible keys** (`Servers[i].name/host/port/auth/db/filter/...`, admin login
  `login`/`password`, `cookieSecret`). Supports env overrides `SRA_CONFIG` (path) and
  `REDIS_URLS` (quick setup).
- `src/lib/server/redis/` — connection manager (`createConnection` per server+db, closed after the
  request), key-type services (`getString`, `getHash`, `getList`, `getSet`, `getZSet`, `getStream`)
  built on SCAN cursors, TTL/rename/delete helpers, `info`/`config`/`client`/`slowlog` readers,
  serializers (JSON pretty-print, base64 for binary).
- `src/lib/server/auth/` — signed http-only cookie session (HMAC via `cookieSecret`); users come
  from `config.login`; when no login is configured the app auto-authenticates (config-auth mode,
  like phpRedisAdmin's default install).

### Routing

```
/login  /logout
/                                     home: server cards
/server/[id]                          server overview (stats, KPI cards)
/server/[id]/info                     INFO sections (accordion, raw toggle)
/server/[id]/config                   CONFIG GET + SET
/server/[id]/clients                  CLIENT LIST + kill
/server/[id]/slowlog                  SLOWLOG GET + LEN + reset
/server/[id]/db/[db]                  key browser: SCAN cursor pagination, glob filter, tree/list view
/server/[id]/db/[db]/new-key          add key (type picker + editor)
/server/[id]/db/[db]/key/*key         key view/edit (per type), TTL edit, delete/rename/persist
/server/[id]/db/[db]/export           export keys/DB as JSON (streamed download)
/server/[id]/db/[db]/import           import JSON dump
```

## Compatibility with phpRedisAdmin

1. **Config keys** keep phpRedisAdmin's names (`Servers`, `name`, `db`, `filter`, `separator`,
   `login`/`password`, …) in a JSON `config.json` instead of PHP includes.
2. **Semantics**: SCAN-based key listing with the same filter (`glob`), same key type set
   (string, hash, list, set, zset, stream), TTL display, rename/delete, flushDB.
3. **Export** emits JSON (`{key, type, ttl, value}` records) that `import` can read back.

## Phases

- [x] **Phase 0 — Foundation**: scaffold (Tailwind v4, shadcn-svelte, ESLint/Prettier, Vitest,
      Playwright), docker-compose (Redis 7.4 ×2 on :33380/:33381 + seed), config loader (zod,
      unit-tested), cookie auth, app shell (sidebar: servers → databases, top bar, theme).
- [x] **Phase 1 — Server level**: home server cards, overview KPIs, INFO page, CONFIG, clients,
      slowlog, flush db/all (guarded).
- [x] **Phase 2 — Key browser**: SCAN pagination + filter, type badges, TTL pills, bulk delete,
      add key, rename, delete, export/import.
- [x] **Phase 3 — Key editor**: view/edit string (with JSON detection), hash, list, set, zset,
      stream; TTL edit/persist; value formatting (pretty print, base64 for binary).
- [x] **Phase 4 — Extras**: command-line console (multi-command REPL) and key tree by separator done;
      slowlog charts and pub/sub monitor remain.
- [ ] **Phase 5 — Users, roles & pluggable authentication**

  Deployment target: **one app instance for many Redis servers**, users identified by an external
  identity layer (SSO at the ingress), each user allowed to see only the servers/nodes they have
  access to.

  ### 5a — App roles + per-user server visibility (app-side, ships first)
  - **Config** (BC-compatible additions, zod-validated):
    ```jsonc
    "login": [
      { "username": "admin", "password": "...", "role": "admin" },        // default: admin
      { "username": "dev",   "password": "...", "role": "rw", "servers": [0, 1] },
      { "username": "viewer", "password": "...", "role": "ro" }           // servers absent = all
    ]
    ```
    Roles: `admin` (everything), `rw` (data read/write, no admin pages/CONFIG SET/CLIENT KILL/SLOWLOG
    RESET), `ro` (read-only: no key mutations, no flush, no console).
  - **Session**: `SessionInfo` gains `role` and `servers: number[] | null` (null = all). Still one
    HMAC-signed cookie; re-sign on login only.
  - **Enforcement points** (server-side is the boundary; UI hiding is a courtesy):
    - `src/lib/server/auth/access.ts`: `assertServerAccess(locals)`, `assertWrite(locals)`,
      `assertAdmin(locals)` → `error(403)`; hooks 404s `/server/[id]` routes the user cannot see
      (so the existence of a server is not leaked).
    - Every destructive form action calls the right assert; console + CONFIG SET + CLIENT KILL +
      SLOWLOG RESET require `rw` (admin for CONFIG SET); flush requires `rw` + admin config flag
      optional.
    - `(app)/+layout.server.ts` filters the sidebar/switcher to `session.servers` and exposes
      `session.role`; `.ro` hides destructive buttons/dialogs in the key browser/editor, console
      input is disabled with an explanation.
  - **Login page**: optional server selector when the user's first server is ambiguous (phpRedisAdmin
    style) — deferred if `servers` defaults to "all" in practice.

  ### 5b — Pluggable authentication (delegation / extensions)
  - **Plugin interface** (`src/lib/server/auth/plugins/`):
    ```ts
    export interface AuthPlugin {
    	name: string;
    	// Return session facts for a request, or null when unauthenticated.
    	authenticate(ctx: {
    		request: Request;
    		cookies: Cookies;
    		config: AppConfig;
    	}): Promise<PluginSession | null>;
    }
    // PluginSession: { username: string; role?: Role; servers?: number[] | null }
    ```
    Selected by `config.auth = { "plugin": "config" | "http" | "header" | <custom> }` (default
    `config`). The signed-cookie session is the session _store_, plugins are the _source of truth_:
    plugin runs first, session cookie only caches the result for the `cookieLifetime`.
  - **Built-ins**:
    - `config` — the current login list + role/servers (5a), with the `/login` form.
    - `http` — HTTP Basic against the `login` list (no login page; 401 when wrong).
    - `header` — **trust an ingress/proxy identity header** (`config.auth.header = "X-Forwarded-User"`,
      plus optional role/servers headers). This is the k8s pattern: oauth2-proxy / Istio / Cloudflare
      Access authenticate at the edge, the app trusts the sanitized header. Must refuse when the
      header comes directly from outside (documented deployment requirement: ingress strips/sets it).
  - **Later plugins** (same interface, no core changes): OIDC/OAuth2 authorization-code flow; JWT /
    PAM-style validation; **k8s TokenReview** (validate a bearer token against the cluster API and
    map RBAC/claims to servers — "user has access to that node → gets those RedisAdmin servers").

  ### 5c — Later (recorded, not scheduled)
  - **Per-user Redis credentials**: login entries may carry `redis: {username, password}` so Redis 6+
    ACLs enforce command-level permissions end-to-end; ACL DENIED errors render as friendly
    "not permitted" alerts instead of 500s.
  - **Dynamic server discovery** for the k8s model: servers from ConfigMap/CRD/service labels instead
    of static `config.json` (config.json keeps bootstrap + credentials).
  - **Group→server mapping**: `auth.groups = [{ group: "team-a", servers: [0, 2] }, ...]` applied to
    plugin-provided group claims.
  - Password hashing (bcrypt/argon2) in `login` entries; login rate limiting; `secure` cookie flag.

## Working process (orchestration)

Same as svelteMyAdmin: orchestrator writes task briefs, `builder` implements with tests,
`checker` runs `pnpm check && pnpm lint && pnpm test` (+ integration when Redis is up).
