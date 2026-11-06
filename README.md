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
- Cookie login (config `login` list) or auto-auth when no login is configured; roles (`admin`, `rw`,
  `ro`) and per-user server lists
- Single sign-on behind an SSO proxy (oauth2-proxy…) with trusted identity headers, Kubernetes RBAC
  per server and discovery of the Redis Services of review namespaces — see
  [docs/KUBERNETES.md](docs/KUBERNETES.md)
- Per-person audit log (JSON Lines on stdout or a file): sessions, every write and admin command with
  its keys, console lines, exports, imports and refusals — see [docs/AUDIT.md](docs/AUDIT.md)
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

## Single sign-on and Kubernetes

Behind an SSO proxy, the `header` plugin reads who the person is from headers the proxy sets, only on
requests coming from `auth.trustedProxies`. On Kubernetes, a server's `authorize` asks the API server
(SubjectAccessReview) whether that person may use the server's namespace, and `ServerDiscovery` turns the
Redis Services of labelled namespaces into servers, with the password read from a Secret:

```json
{
	"Servers": [],
	"auth": {
		"plugin": "header",
		"header": "x-auth-request-user",
		"headerGroups": "x-auth-request-groups",
		"trustedProxies": ["10.42.0.0/16"]
	},
	"cookieSecret": "a-random-string-of-32-characters-or-more",
	"ServerDiscovery": {
		"type": "kubernetes",
		"namespaceSelector": "env=review",
		"serviceSelector": "app.kubernetes.io/name=redis",
		"secret": { "name": "redis-auth", "passwordKey": "redis-password" },
		"authorize": { "userPrefix": "oidc:", "groupsPrefix": "oidc:" }
	}
}
```

Full reference (proxy setups, RBAC for the app, troubleshooting): [docs/KUBERNETES.md](docs/KUBERNETES.md).
A `Dockerfile` and ready-made manifests with a local walkthrough are in
[deploy/kubernetes](deploy/kubernetes/README.md).

## Audit log

Everyone behind SSO shares one Redis password, so Redis cannot tell them apart. Turn on the audit log
to record who did what, from where, on which server and database:

```json
{ "AuditLog": { "target": "stdout" } }
```

```json
{
	"ts": "2026-11-06T09:14:40.002Z",
	"event": "command",
	"identity": "alice",
	"role": "rw",
	"server": "Cache",
	"serverId": "0",
	"clientIp": "203.0.113.7",
	"db": 2,
	"command": "DEL",
	"keys": ["session:41"],
	"ok": true
}
```

Values stay out of the log unless `includeValues` is on, and passwords are always masked. Events,
options and how to ship the log from Kubernetes: [docs/AUDIT.md](docs/AUDIT.md).

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
