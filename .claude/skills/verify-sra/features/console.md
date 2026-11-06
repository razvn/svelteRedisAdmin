# Console

A user with write access runs a batch of Redis commands, one per line, and sees one result card per
command; `SELECT` carries over to the following lines; dangerous commands are refused; read-only users see
the console disabled.

## Sub-features

- `console-batch` one result card (`console-result`) per non-empty, non-comment line, in order.
- `console-select` `SELECT n` applies to later lines of the same batch.
- `console-blocked` `SHUTDOWN` and `MONITOR` answer `<CMD> is not allowed from the console.`
- `console-readonly` `viewer` sees `Read-only access: the console is disabled.` and a disabled `Run`.
- `console-examples` example buttons fill the textarea.

## How to get to it (user POV)

- Server tab bar `Console`, or `/server/0/console`.

## Driving it with sra-verify

Preconditions:

- Live run, user `admin`.

- **Batch.** Fill `textarea[name="input"]` with `SELECT 5`, a `#` comment line, `SET <key('console')> hello`, `GET <key('console')>`, `SHUTDOWN`; click `Run`. 4 `console-result`; the `GET` card's `console-reply` contains `hello`; Redis db 5 has the key.
- **Blocked.** The `SHUTDOWN` card shows `SHUTDOWN is not allowed from the console.`
- **Read-only.** Log out, `login('viewer')`, open the console. Alert text visible, `Run` disabled.
- **Run.** `sra-verify drive <RUN_ID> console`.

## Gotchas

- Only full-line `#` comments are skipped. A trailing `# ...` is sent to Redis as arguments (`SET k v # c` gives `ERR syntax error`), although the textarea placeholder shows `HGETALL user:1 # comments ok`.
- Without `SELECT` the batch runs on the server's default db 0, which integration tests flush: always `SELECT 5` first.
- The textarea has no label; use `textarea[name="input"]`.
