# Key browser

The database page lists keys with SCAN pagination; a user filters by glob pattern and type, switches
between a list and a separator-based tree, and bulk-deletes selected keys.

## Sub-features

- `browse-filter` glob filter (`Key filter`) applied with `Apply`; `Clear` resets.
- `browse-type` type filter (`Key type`: `All types`, `string`, `hash`, ...).
- `browse-tree` `Tree` view: folders by separator `:`, `Expand <path>` / `Collapse <path>` buttons.
- `browse-bulk-delete` row checkboxes `Select <key>`, `Delete selected` (no confirmation dialog).
- `browse-paginate` `Previous page` / `Next page` (not in the shipped journey; needs > 100 keys).
- `browse-flush` `Flush db5` with confirmation (never run it outside db 5).

## How to get to it (user POV)

- Sidebar `DATABASES` > `db5`, or `/server/0/db/5`.
- Breadcrumb `Database: db5` from a key page.

## Driving it with sra-verify

Preconditions:

- Live run, user `admin`. The journey writes `app:config`, `app:counter`, `leaf` (strings) and `user:1` (hash) under `key()`.

- **Filter.** Fill `Key filter` = `<prefix>app:*`, click `Apply`. 2 `key-row`; `leaf` absent.
- **Type.** Filter `<prefix>*`, `Key type` = `hash`, `Apply`. 1 row, `user:1`.
- **Tree.** `Key type` = `All types`, `Apply`, wait for `user:1` and `leaf` links; click `Tree`. URL has `view=tree`; click `Expand sra_verify`, `Expand sra_verify:<RUN_ID>`, `Expand <prefix>app` (all `exact: true`); `app:counter` link visible.
- **Bulk delete.** Click `List`; check `Select <app:config>` and `Select <app:counter>`; `2 selected`; click `Delete selected`. Those links gone, `leaf` stays; Redis confirms.
- **Run.** `sra-verify drive <RUN_ID> key-browser`.

## Gotchas

- `List`/`Tree` links carry the current filter and type; clicking them before the `Apply` reload finishes uses the old query.
- Other journeys in the same run share the prefix: assert on your own keys, not on row totals.
- `Delete selected` deletes immediately; the page reloads with the same filter.
