# Key editor

A user creates a key from the `New key` form, sees it on its key page, edits the value, sets a TTL, renames
it (value and TTL kept) and deletes it after a confirmation dialog, landing back on the key browser.

## Sub-features

- `key-create` creates a key of any type (`string`, `hash`, `list`, `set`, `zset`, `stream`) with an initial value and optional TTL.
- `key-edit-string` saves a new string value; JSON values get `Pretty print` / `Raw`.
- `key-ttl` sets or removes (empty or 0) an expiry from the `TTL` dialog.
- `key-rename` moves the key from the `Rename` dialog.
- `key-delete` deletes it from the `Delete` alert dialog.
- `key-edit-collections` per-type editors (`hash-fields`, `list-items`, `set-members`, `zset-entries`, `stream-entries`). Not in the shipped journey.

## How to get to it (user POV)

- Key browser tab bar `New key` (`getByTestId('tab-bar')`), or the `New key` header button.
- Click a key name in the key browser (list or tree) to open its page.
- Direct URL `/server/0/db/5/key/<key>`.

## Driving it with sra-verify

Preconditions:

- Live run, user `admin` (or `writer`; `viewer` sees `You are not allowed to modify data.`).

- **Create.** On `/server/0/db/5` click tab-bar link `New key`; fill `Key name` = `key('lifecycle')`, `Type` = `string`, `Initial value` = `{"step":1}`; click `Create key`. `key-view` visible, heading = key name, text `This value parses as JSON.`; Redis `GET` = `{"step":1}`.
- **Edit.** Fill `#save-string-form textarea[name="value"]` = `{"step":2}`, click `Save` (exact). Redis `GET` = `{"step":2}`; after reload the textarea shows it.
- **TTL.** Click `TTL`; in dialog `Edit TTL` fill `Seconds` = `600`, click `Apply`. Redis `TTL` > 500.
- **Rename.** Click `Rename`; in dialog `Rename key` fill `New name`, click `Rename`. Heading = new name; old key gone; value and TTL kept.
- **Delete.** Click `Delete`; in the alertdialog click `Delete key`. URL back on `/server/0/db/5`; no link for the key; Redis `EXISTS` = 0.
- **Run.** `sra-verify drive <RUN_ID> key-lifecycle`.

## Gotchas

- `New key` matches two links on the key browser; scope to the tab bar or the strict-mode locator fails.
- `Save` without `exact: true` also matches other buttons on collection pages.
- Non-UTF-8 string values show `Binary value` and cannot be edited; seed them with a Buffer through `redis` to test that path.
