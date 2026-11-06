# Audit log

Redis sees one password (or one ACL user) for everyone who uses the app, so its own logs, `MONITOR`
and `CLIENT LIST` cannot tell people apart. This matters most behind single sign-on (see
[Single sign-on and Kubernetes](KUBERNETES.md)). The audit log records, per person, who did what, when, from where and
on which server and database. It works with every auth plugin: with `config` and `http` the person is
the `login` user, and with `header` it is the identity the proxy forwards.

The log is off unless the top-level key `AuditLog` is set. When it is off, connections are not
wrapped and no cookie is set.

## What is logged

One JSON object per line (JSON Lines). Every line has these fields:

| Field      | Meaning                                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ts`       | ISO 8601 time, UTC.                                                                                                                                                          |
| `event`    | `session`, `command`, `console`, `export`, `import`, `logout` or `denied`.                                                                                                   |
| `identity` | The verified person: the session user name. `null` when nobody was verified (most `denied` lines).                                                                           |
| `role`     | The app role of the person: `admin`, `rw` or `ro`. `null` with `identity`.                                                                                                   |
| `groups`   | `header` plugin with `auth.headerGroups` only: the person's groups. Left out when there are none.                                                                            |
| `server`   | Server label: `name`, else `host:port`. `null` outside server pages.                                                                                                         |
| `serverId` | Server id: its position in `Servers` as text (`"0"`), or `k8s:<namespace>:<service>` for a [discovered](KUBERNETES.md#server-discovery) server. `null` outside server pages. |
| `clientIp` | Address of the person. Behind proxies listed in `auth.trustedProxies`, the right-most `X-Forwarded-For` address that is not one of them; otherwise the TCP peer.             |

Key names and arguments are written as text when they are valid UTF-8. Other bytes become
`{"base64": "..."}`: a key name is never decoded lossily.

### `session`

The first request of a person, and the first one after `sessionIdleMinutes` without any request. A
signed browser cookie (`sra_audit`, HMAC-SHA256 with `cookieSecret`) holds who was last seen, on which
server and when. It slides forward on every request. A new session starts when the marker is missing or
tampered with, has expired, or belongs to another person. Moving to another server also starts one.
Pages outside a server (the home page) keep the session going. "Log out" clears the marker.

Without `cookieSecret` (a `header` setup without a login list), the marker is signed with a random key
of the process: after a restart, everyone's next request starts a new session.

```json
{
	"ts": "2026-11-06T09:12:03.120Z",
	"event": "session",
	"identity": "alice",
	"role": "rw",
	"groups": ["team-a"],
	"server": "redis",
	"serverId": "k8s:review-1:redis",
	"clientIp": "203.0.113.7"
}
```

### `command`

Every command that changes data or administers the server, run for the person, whether it succeeded or
failed. Where it comes from in the app does not matter: the key editor, new key, rename, TTL, bulk
delete, flush, the config page, client kill and slow-log reset all go through the same connection.

| Field       | Meaning                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `db`        | The database the command ran on, followed through `SELECT`.                                                                             |
| `command`   | Upper case, with the subcommand of container commands: `SET`, `DEL`, `CONFIG SET`, `CLIENT KILL`, `XGROUP CREATE`.                      |
| `keys`      | The keys it touched: `["a", "b"]` for `RENAME a b`, the destination and sources of `ZUNIONSTORE`, the `numkeys` keys of `EVAL`.         |
| `args`      | The arguments after the command name, secrets masked. Always present for administration (no key), else only with `includeValues`.       |
| `ok`        | `true` when Redis ran it.                                                                                                               |
| `errorCode` | When not `ok`: the first word of the Redis error (`WRONGTYPE`, `NOPERM`, `ERR`), or the client error name. The message is never logged. |
| `truncated` | `true` when a key or an argument was cut to `maxArgLength`.                                                                             |

```json
{"ts":"2026-11-06T09:14:40.002Z","event":"command","identity":"alice","role":"rw","server":"Cache","serverId":"0","clientIp":"203.0.113.7","db":2,"command":"RENAME","keys":["session:41","session:42"],"ok":true}
{"ts":"2026-11-06T09:15:02.871Z","event":"command","identity":"alice","role":"rw","server":"Cache","serverId":"0","clientIp":"203.0.113.7","db":2,"command":"HSET","keys":["user:7"],"ok":false,"errorCode":"WRONGTYPE"}
{"ts":"2026-11-06T09:16:10.420Z","event":"command","identity":"root","role":"admin","server":"Cache","serverId":"0","clientIp":"203.0.113.9","db":0,"command":"CONFIG SET","keys":[],"args":["maxmemory","2gb","requirepass","***"],"ok":true}
```

**Data commands logged**: the commands Redis 7.4 and 8 flag as `write`. That covers strings, hashes
(field expiry included), lists, sets, sorted sets, streams, HyperLogLog, geo and bit operations,
`DEL`/`UNLINK`, `RENAME`, `COPY`, `MOVE`, `EXPIRE`/`PERSIST` and their variants, and `RESTORE`. Also
logged: `MIGRATE`, `SORT` and `GEORADIUS` (they can store), and `EVAL`/`EVALSHA`/`FCALL` (a script can
write).

**Administration logged**: `FLUSHDB`, `FLUSHALL`, `SWAPDB`, `CONFIG SET`/`REWRITE`/`RESETSTAT`,
`CLIENT KILL`/`PAUSE`/`UNPAUSE`/`NO-EVICT`, `SLOWLOG RESET`, `LATENCY RESET`, `ACL SETUSER`/`DELUSER`/
`LOAD`/`SAVE`/`LOG RESET`, `AUTH`, `SAVE`, `BGSAVE`, `BGREWRITEAOF`, `SHUTDOWN`, `REPLICAOF`/`SLAVEOF`,
`FAILOVER`, `MODULE LOAD`/`UNLOAD`, `SCRIPT FLUSH`/`KILL`/`LOAD`, `FUNCTION LOAD`/`DELETE`/`FLUSH`/
`RESTORE`/`KILL`, `MEMORY PURGE`, every `DEBUG …`, and the `CLUSTER` subcommands that change the
cluster.

**Not logged**: reads (`GET`, `SCAN`, `TYPE`, `TTL`, `HGETALL`, `INFO`, `CONFIG GET`, `CLIENT LIST`,
`SLOWLOG GET`, …). The app runs its own reads on the same connection to draw every page, so they say
nothing about what the person did. Reads typed in the console are the exception, see below.

The list is fixed in the app (`src/lib/server/audit/commands.ts`). It does not ask the server, so a
module's own write commands (RedisJSON, RediSearch…) are only logged when typed in the console.

### `console`

Every command typed in the console and sent to Redis, reads included: `KEYS *` or `GET token:alice`
are something the person chose to look at. It has the same fields as `command`. Keys of commands the
fixed list does not know come from the server (`COMMAND GETKEYS`). The console logs no `command` line
of its own, so nothing is counted twice.

Lines the console refuses before they reach Redis (`MONITOR`, `SHUTDOWN`, lines past the per-run limit)
are not logged.

```json
{
	"ts": "2026-11-06T09:20:11.530Z",
	"event": "console",
	"identity": "alice",
	"role": "admin",
	"server": "Cache",
	"serverId": "0",
	"clientIp": "203.0.113.7",
	"db": 0,
	"command": "GET",
	"keys": ["token:alice"],
	"ok": true
}
```

### `export`

A database exported as JSON (the download).

| Field    | Meaning                              |
| -------- | ------------------------------------ |
| `db`     | The database.                        |
| `filter` | The key pattern, when one was given. |
| `keys`   | How many keys the file holds.        |

```json
{
	"ts": "2026-11-06T09:22:40.118Z",
	"event": "export",
	"identity": "alice",
	"role": "rw",
	"server": "Cache",
	"serverId": "0",
	"clientIp": "203.0.113.7",
	"db": 2,
	"filter": "session:*",
	"keys": 1840
}
```

### `import`

A JSON dump imported into a database. One line for the whole import: the commands that restore each
key are not logged one by one.

| Field      | Meaning                         |
| ---------- | ------------------------------- |
| `db`       | The database.                   |
| `total`    | Keys in the file.               |
| `imported` | Keys written.                   |
| `failed`   | Keys that could not be written. |

```json
{
	"ts": "2026-11-06T09:25:03.902Z",
	"event": "import",
	"identity": "alice",
	"role": "rw",
	"server": "Cache",
	"serverId": "0",
	"clientIp": "203.0.113.7",
	"db": 3,
	"total": 1840,
	"imported": 1838,
	"failed": 2
}
```

### `logout`

"Log out" by a signed-in person.

```json
{
	"ts": "2026-11-06T10:02:45.017Z",
	"event": "logout",
	"identity": "alice",
	"role": "rw",
	"server": null,
	"serverId": null,
	"clientIp": "203.0.113.7"
}
```

### `denied`

Refused access. Refusals of an identity carry `claimedUser`, the name that was presented, as sent (at
most 256 characters), and `identity: null` because nobody was verified. Refusals of a signed-in person
keep their `identity`.

| `reason`              | When                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `untrusted-proxy`     | `header`: the user header came from a peer outside `auth.trustedProxies`.                                   |
| `invalid-identity`    | `header`: the trusted proxy sent an unusable user header (control character, comma, header sent twice).     |
| `access-denied`       | `config` login form or `http` Basic: wrong user name or password.                                           |
| `server-not-allowed`  | The server is not in the person's `servers` list (answered as 404).                                         |
| `not-authorized`      | Kubernetes RBAC (`authorize`) refused the person on this server (403).                                      |
| `authorization-error` | Kubernetes RBAC could not be checked: API server unreachable or erroring (503).                             |
| `role`                | The person's role does not allow the action. `action` is `write` (an `ro` person) or `admin` (an `rw` one). |

```json
{"ts":"2026-11-06T09:30:00.441Z","event":"denied","identity":null,"role":null,"server":null,"serverId":null,"clientIp":"198.51.100.9","reason":"untrusted-proxy","claimedUser":"admin"}
{"ts":"2026-11-06T09:31:12.007Z","event":"denied","identity":"bob","role":"rw","groups":["team-b"],"server":"redis","serverId":"k8s:review-1:redis","clientIp":"203.0.113.8","reason":"not-authorized"}
```

Requests without any identity claim (a `header` request without the user header, an `http` request
without credentials) are not logged.

## Configuration

```json
{
	"AuditLog": { "target": "stdout" }
}
```

```json
{
	"AuditLog": {
		"target": "file",
		"path": "./var/audit.jsonl",
		"includeValues": false,
		"sessionIdleMinutes": 30,
		"maxArgLength": 1024
	}
}
```

`AuditLog` is specific to svelteRedisAdmin, not a phpRedisAdmin key.

| Key                  | Default    | Meaning                                                                                                                            |
| -------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `target`             | (required) | `stdout`, or `file`.                                                                                                               |
| `path`               | (none)     | Required with `file`. Relative paths resolve from the directory of the config file. The directory must exist.                      |
| `includeValues`      | `false`    | Also log the arguments of data commands and console lines (the values). See [Values and personal data](#values-and-personal-data). |
| `sessionIdleMinutes` | `30`       | Inactivity after which a person's next request is a new `session`.                                                                 |
| `maxArgLength`       | `1024`     | Longer key names, arguments and export filters are cut, and the line gets `truncated: true`.                                       |

## Why stdout and files, not Redis

The log never goes into Redis. Everyone who can write through the app can also delete keys there, so a
person could erase their own trail. Lines written to stdout leave the process at once. The container
runtime keeps them, and a log collector can ship them off the node where nobody using the app can reach
them.

## Values and personal data

With `includeValues: false`, the log holds command names and key names, never the values: `SET
token:alice <value>` is logged as `SET` on `token:alice`. Key names can still be personal data
(`user:alice@example.com`), and administration commands always carry their arguments.

With `includeValues: true`, every argument is logged, cut to `maxArgLength`: the values written, the
script of an `EVAL`, the values typed in the console. Treat the audit log as personal data: restrict
who can read it, and set a retention period in the log store.

Passwords are masked in both modes: `AUTH`, `HELLO … AUTH`, `CONFIG SET requirepass` / `masterauth` /
`tls-key-file-pass` / `tls-client-key-file-pass`, the password rules of `ACL SETUSER` (`>`, `<`, `#`,
`!`), and `MIGRATE … AUTH` / `AUTH2`. They are logged as `***`.

## Failure behaviour

The log fails open. If a line cannot be written (missing directory, full disk, closed stdout), the error
is reported once with `console.error` and the request goes on. Later lines to that file are dropped
until the app restarts. Watch for the `[audit]` message in the app's own logs.

A refused command is still logged when Redis refuses it (`ok: false`). The log only misses commands
that never reached the connection.

## Shipping it from Kubernetes

Use `"target": "stdout"`. The kubelet writes container output to `/var/log/containers/*.log` on the
node, and a node-level collector (Fluent Bit, Vector, the OpenTelemetry Collector, Promtail) ships it to
your log store. Audit lines are the stdout lines whose JSON starts with `ts` and `event`. Example Fluent
Bit filter that keeps them and drops the rest of the app's output:

```ini
[FILTER]
    Name    grep
    Match   kube.*svelteredisadmin*
    Regex   log ^\{"ts":"[^"]+","event":
```

Then parse `log` as JSON and index `identity`, `event`, `serverId` and `command`. Keep the log store
outside the namespace of the app, so the people the log is about cannot delete it.

With `"target": "file"`, mount a volume at the directory of `path` and run a sidecar that tails the file.
The app only appends to it, so rotate it with a tool that uses copy-and-truncate.

## Limits

- The log records what went through this app only. Someone with the Redis password can still connect
  directly; restrict that with a NetworkPolicy and Redis ACLs.
- The command list is fixed: a new Redis write command, or a module's own, is only logged when it is
  typed in the console. Update `src/lib/server/audit/commands.ts` when Redis adds one.
- An import is one line: it says how many keys were written, not which ones.
- Lines are written as each event happens, one process at a time. With several replicas, the lines of
  one person can be spread over the replicas' logs; sort them by `ts`.
