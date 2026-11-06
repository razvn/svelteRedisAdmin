# svelteRedisAdmin verification map

The maintained source for verifying the user-facing behaviour of svelteRedisAdmin. Read this index, then
the feature file for what you changed, and drive it with `sra-verify` (see `../SKILL.md`).

## Baseline preconditions

- A live run from `sra-verify up`; `sra-verify doctor <RUN_ID>` reports no `FAIL` and no build `WARN`.
- Users from the run config: `admin/admin` (admin, all servers), `writer/writer` (rw, server 0 only),
  `viewer/viewer` (ro, all servers). Servers: 0 = "Verify redis1" (:33380), 1 = "Verify redis2" (:33381).
- Journeys work in db 5 of server 0 with keys from `key('...')` (`sra_verify:<RUN_ID>:...`) and create
  their own preconditions. Never depend on the dev seed (`docker/initdb/seed.sh`): a container started by
  `up` is empty, because Redis runs without persistence and the `seed` service is not started.
- Never drive an instance that `sra-verify list` does not show as yours.

## Driving conventions

- Start from the logged-in home page (the driver logs in) unless the journey runs as `none`.
- Prefer roles and English accessible names, then labels, then `data-testid`. No CSS classes, no positions.
- Actions that appear twice (tab bar and page-header button) are scoped with `getByTestId('tab-bar')`.
- After a submit, wait for the reloaded page's content before the next click.
- Journeys delete their own keys first, so a rerun in the same RUN_ID starts clean.

## Proof and skip reporting

- `proof(step)` before and after each user action: screenshot + ARIA snapshot with the URL.
- Every mutation is read back from Redis with `note(step, data)`.
- Report an unreachable entry point with the command run and the unmet precondition; never count it as
  verified through a different entry point.

## Feature entry contract

Each feature file: H1 title, one paragraph of user-visible behaviour, then exactly `Sub-features`,
`How to get to it (user POV)`, `Driving it with sra-verify`, `Gotchas`.

## Features

- [Login and server visibility](./login.md): sign in, wrong password, logout, per-user server list. Journey `login`.
- [Key editor](./key-editor.md): create, edit, TTL, rename, delete a key. Journey `key-lifecycle`.
- [Key browser](./key-browser.md): filter, type filter, list/tree view, bulk delete. Journey `key-browser`.
- [Console](./console.md): multi-command batches, blocked commands, read-only users. Journey `console`.
- [Server pages](./server-pages.md): overview, info, config, clients, slow log. No journey yet.
