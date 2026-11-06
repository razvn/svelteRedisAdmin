# Server pages

For one server a user reads an overview with KPI cards, the INFO sections, CONFIG parameters (and sets
one), the client list (and kills a client), and the slow log (and resets it).

## Sub-features

- `server-overview` KPI cards (`server-overview`).
- `server-info` INFO sections (`server-info`).
- `server-config` filter `Filter parameters…`, CONFIG SET (admin only).
- `server-clients` CLIENT LIST, kill (`server-clients`).
- `server-slowlog` SLOWLOG GET / reset (`server-slowlog`).

## How to get to it (user POV)

- Home `Open server` on a card, or sidebar server name: `/server/0`.
- Server tab bar: `Overview`, `Info`, `Config`, `Clients`, `Slow log`, `Console`.

## Driving it with sra-verify

Preconditions:

- Live run, user `admin`. No shipped journey: write `journeys/server-pages.mjs` before claiming a change here is verified.

- **Overview.** Click tab-bar `Overview`. `server-overview` visible with `Redis version`.
- **Info.** Click `Info`. `server-info` visible, heading `Info`.
- **Config read.** Click `Config`, fill `Filter parameters…` = `maxmemory`. Only matching rows remain.
- **Clients / Slow log.** Click `Clients` / `Slow log`. `server-clients` / `server-slowlog` visible.

## Gotchas

- CONFIG SET, CLIENT KILL and SLOWLOG RESET act on the shared dev Redis for every run and every developer.
  Only set a parameter you restore in the same journey (read it first with `redis.configGet`), only kill a
  client the journey opened itself, and prefer `redis2` (server 1) for slow-log resets.
