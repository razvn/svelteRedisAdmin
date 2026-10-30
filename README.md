# svelteRedisAdmin

A modern web admin for Redis databases — a SvelteKit + Svelte 5 re-implementation of
[phpRedisAdmin](https://github.com/erikdubbelboer/phpRedisAdmin) with the look of a
NextAdmin-style dashboard (shared with [svelteMyAdmin](../svelteMyAdmin)).

## Features

- Multi-server config (phpRedisAdmin-compatible keys) with a server switcher
- Key browser per database: SCAN pagination, glob + type filters, TTL/type pills, bulk delete
- Key viewer/editor for all types: string (JSON pretty-print), hash, list, set, zset, stream
- TTL editing (expire/persist), rename, delete, new keys, flush database
- Export/import a database as JSON
- Server level: overview stats, INFO browser, CONFIG get/set, client list + kill, slow log
- Cookie login (config `login` list) or auto-auth when no login is configured
- Light/dark theme

## Stack

SvelteKit 3 (adapter-node), Svelte 5 runes, TypeScript strict, Tailwind CSS v4,
shadcn-svelte (bits-ui), mode-watcher, zod, node-redis v5, Vitest + Playwright, pnpm.

## Getting started

```sh
pnpm install
pnpm db:up        # dev Redis on :33380 (seeded) and :33381
cp config.sample.json config.json   # then edit servers / login
pnpm dev
```

Configuration lives in `config.json` (git-ignored; override the path with `SRA_CONFIG`).
Key names follow phpRedisAdmin: `Servers[]` with `name`, `host`, `port`, `auth`, `db`,
`databases`, `filter`, `separator`, plus `login[]` + `cookieSecret` for authentication.

## Development

```sh
pnpm check          # svelte-check
pnpm lint           # prettier + eslint
pnpm test           # unit + component tests
pnpm test:integration   # needs `pnpm db:up`
pnpm test:e2e       # needs `pnpm db:up`
```

See `docs/ROADMAP.md` (architecture, phases) and `docs/DESIGN.md` (UI conventions).
`AGENTS.md` holds the conventions for implementer agents.

## Presentation site

`site/` holds the static landing page, deployed to **GitHub Pages** automatically on every push to
`main` that touches `site/` (see `.github/workflows/pages.yml`). To regenerate the screenshots:

```sh
pnpm db:up && pnpm dev --port 5173   # in one terminal
pnpm site:screenshots                # in another — writes site/assets/screenshots/*.png
```

## License

GPL-2.0-or-later — see [LICENSE](LICENSE).
