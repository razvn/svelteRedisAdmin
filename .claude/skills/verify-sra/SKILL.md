---
name: verify-sra
description: Drive the real svelteRedisAdmin web UI (SvelteKit app + Docker Redis) in Chromium the way a user does, and capture proof (screenshots, ARIA snapshots, Redis side effects). Use to prove a UI/route/form-action change works end to end, or to reproduce a user-facing bug, before claiming it is done.
---

# Verify svelteRedisAdmin

The user surface is the web UI: log in, pick a server, browse keys in a database, edit keys, run console
commands, read server pages. Everything below is scripted in `.claude/skills/verify-sra/`; run all
commands from the repo root. `V=.claude/skills/verify-sra/bin/sra-verify` is assumed below.

Read `features/README.md` before driving, then the feature file for what you changed.

## Launch

```bash
V=.claude/skills/verify-sra/bin/sra-verify
$V up                      # prints RUN_ID, URL, EVIDENCE; or `$V up my-run` to name it
```

`up` does, in order:

1. Starts the shared Docker Redis (`sra-redis1` :33380, `sra-redis2` :33381) via `docker compose up -d --wait`
   only if they are not answering, and records that it did. Docker must be running.
2. `pnpm build` (log: `.verify/runs/<RUN_ID>/build.log`). `SRA_VERIFY_SKIP_BUILD=1` reuses the last build:
   only when you changed nothing under `src/` since.
3. Writes its own config to `.verify/runs/<RUN_ID>/config.json` (users `admin/admin` admin, `writer/writer`
   rw limited to server 0, `viewer/viewer` ro; servers "Verify redis1"/"Verify redis2"). The user's
   `config.json` is never read.
4. Serves the build with `vite preview` on a free port (same as `playwright.config.ts`).
5. Ready = `/login` renders the login form. Fails with the log path if the app exits or 60 s pass.

Isolation: app instances are per run (own port, config, cookie secret), so several runs can coexist.
Redis is shared, so every run writes only keys prefixed `sra_verify:<RUN_ID>:` in **db 5** (integration
tests flush db 0-3; db 0-1 hold the dev seed). A rebuild (`up` without skip) swaps the code under every
live run: do not rebuild while another agent's run is live (`$V list`).

## Doctor

```bash
$V doctor <RUN_ID>
```

Read-only. Checks: process alive, port owned by our PID, `/login` renders, admin login accepted, both Redis
containers answer `PING`, and that the build revision matches the checkout (`WARN` = you changed `src/`
after `up`: `down` then `up` again). Run it first whenever anything looks off.

## Drive

```bash
$V drive <RUN_ID> <journey> [admin|writer|viewer|none]
```

Runs `journeys/<journey>.mjs` (or a path to your own `.mjs`) in headless Chromium at 1440x900, English UI
(`sra_lang=en` cookie), already logged in as the given user (default `admin`; `none` = not logged in).
Shipped journeys: `login` (run with `none`), `key-lifecycle`, `key-browser`, `console`.

To prove a new change, write a journey next to the others; the contract (arguments: `page`, `base`,
`login`, `key`, `db`, `redis`, `proof`, `note`, `expect`) is documented at the top of `lib/drive.mjs`.
Rules:

- Use the user's path: click links/buttons, fill labelled fields, submit forms. Never call form actions
  with `fetch`, never set Redis state to fake a UI result. `redis` is for preconditions and for reading
  side effects back.
- Handles, in order of preference: `getByRole` with the English accessible name, `getByLabel`,
  `getByTestId` (`data-testid` values are stable English literals: `home`, `server-card`, `key-browser`,
  `key-table`, `key-row`, `key-tree`, `key-view`, `new-key`, `tab-bar`, `console-page`, `console-result`,
  `console-reply`, `login-error`, `app-sidebar`, `hash-fields`, `list-items`, `set-members`, `zset-entries`,
  `stream-entries`, `server-overview`, `server-info`, `server-config`, `server-clients`, `server-slowlog`).
  Several actions exist twice on a page (tab bar + header button): scope with `getByTestId('tab-bar')`.
- Every key name goes through `key('...')`. Browse db 5: `${base}/server/0/db/${db}`. Key URLs are
  `${base}/server/0/db/${db}/key/<encodeURIComponent per "/" segment>`.
- After a submit that reloads the page, wait for something the new page shows before the next click;
  links on the key browser are built from the current URL and go stale during navigation.

## Evidence

Everything lands in `.verify/runs/<RUN_ID>/evidence/<journey>/` (git-ignored, survives `down`):

- `NN-<step>.png` full-page screenshot and `NN-<step>.aria.txt` (URL + ARIA snapshot) per `proof(step)`.
- `notes.jsonl`: side effects read back from Redis per `note(step, data)`.
- `trace.zip`: Playwright trace (`pnpm exec playwright show-trace <path>`); `FAILED.png` on failure.

Proof standard: capture the action and the resulting state (one `proof` before submit, one after), and for
every mutation read the stored value back from Redis with `note`. A toast or a redirect alone is not proof.
Run the journey for every entry point the feature file lists that your change touches, as the user role the
change concerns (`writer`/`viewer` for permission work).

## Cleanup

```bash
$V down <RUN_ID>
```

Kills only this run's PID, deletes `sra_verify:<RUN_ID>:*` from db 5, stops the Redis containers only if
this run started them and no other live run remains, deletes the run config, renames `state.env` to
`state.done.env`. Evidence stays. Run `down` after failed attempts too. Never `pkill node`/`vite`.

## Known findings

None open. (The home page used to list and probe servers hidden from a restricted user; fixed by
filtering with `canAccessServer` in `src/routes/(app)/+page.server.ts`. The `login` journey guards it.)
