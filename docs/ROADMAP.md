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

## Working process (orchestration)

Same as svelteMyAdmin: orchestrator writes task briefs, `builder` implements with tests,
`checker` runs `pnpm check && pnpm lint && pnpm test` (+ integration when Redis is up).
