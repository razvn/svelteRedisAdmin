---
name: verify-dump-roundtrip
description: Generated-input check that svelteRedisAdmin's export -> import (JSON dump) and the WireValue byte codec reproduce Redis data byte for byte, for every key type and binary key names. Use before merging any change to src/lib/value.ts, src/lib/server/redis/dump.ts, values.ts (readers/writers), keys.ts (scanPage/expireKey) or type-mapping.ts, or when a user reports a value that changed after a save, export or import.
---

# Verify the export -> import round-trip

## The promise and the harm

- **Property.** For every Redis database content in scope, importing the JSON export of it into an empty
  database recreates every key with the same name bytes, type, contents (values, hash fields, list order,
  set and zset members, zset scores, stream entries) and TTL (within 2 s).
- **Codec property.** For every byte string, `fromWireValue(toWireValue(bytes))` returns the same bytes,
  also after a JSON trip. The key editor's read-then-save path depends on this too.
- **Harm.** A user who backs up a database with Export and restores it with Import, or who opens and saves
  a key, silently gets different data.

## Why generated inputs and not a proof

No verifier runs on this TypeScript, and the property depends on real Redis replies and node-redis
decoding. So the check runs the real code (`exportKeys`, `importDump`, `importDumpSchema`, `toWireValue`,
`fromWireValue`) against the real dev Redis on thousands of generated inputs with fast-check, which
shrinks any failure to a minimal counterexample. Inputs are built on purpose on the text/binary boundary:
valid UTF-8 of any code point, the UTF-8 BOM, invalid sequences (lone continuation, overlong, surrogate,
truncated), raw bytes, empty strings, the zset scores +/-inf and -0, repeated stream field names, emptied
streams. Uniform random bytes almost never reach those cases.

## Run it

```bash
pnpm db:up                                       # Redis on :33380 (REDIS_TEST_PORT overrides)
pnpm verify:dump                                 # findings mode: fails on every open finding
SRA_KNOWN_FINDINGS=exclude pnpm verify:dump      # regression mode: skips open findings, must pass
SRA_FC_SEED=12345 pnpm verify:dump               # other cases than the fixed default seed
```

About 10 s. It runs the Vitest project `formal` (`vite.config.ts`), which holds
`src/lib/value.roundtrip.formal.ts` (codec, 5000 cases per property) and
`src/lib/server/redis/dump.roundtrip.formal.ts` (40 generated databases per key type, 1-4 keys each,
1-6 entries per key). They are kept out of `pnpm test` and `pnpm test:integration`, which they would turn
red while findings are open.

**A skipped dump file is not a pass.** If Redis is unreachable the dump properties are skipped
(`describe.skipIf`), and Vitest prints `skipped` for them. Regression mode must show
`8 passed | 1 skipped (9)`, where the one skip is the stream-ID property (F6). Anything else skipped means
Redis was not reached.

The dump properties write only `sra_test:dumprt:<pid>:*` keys into db 0 (source) and db 1 (target) and
delete them afterwards. Nothing is flushed, so they are safe next to the dev seed and other tests.

## When a change needs this check

Run regression mode on every change to a covered function (see Coverage). Run findings mode when you
fix a finding, and check that its counterexample is gone.

## Reading a failure

fast-check prints `Counterexample: [...]` (the shrunk input), then Vitest prints the expected/received
diff. Values in the diff are hex.

- Codec: `Counterexample: [Buffer.from([239,187,191])]` means those bytes did not survive
  `toWireValue` -> `fromWireValue`.
- Dump: `[[{"type":"list","suffix":Buffer.from([]),"ttl":null,"data":[Buffer.from([]),Buffer.from([226,130])]}]]`
  means: one list key `sra_test:dumprt:<pid>:` (empty suffix) with no TTL, holding `""` and `E2 82`, did not
  come back identical. The diff shows which part (`type`, `value`, or the TTL assertion) changed.
  `expected [ ... ] to deeply equal []` on `result.errors` means `importDump` rejected a key. The message
  names the key and the zod error.

To tell it in the code's words: find which step changed the bytes. `exportKeys` reads them with
`readKeyValue`, then `toWireValue` encodes, JSON and `importDumpSchema` carry the dump, and `importDump`
writes it back with `setString`/`hashSetField`/`listPush`/`setAdd`/`zSetAdd`/`streamAdd` and `expireKey`.

**Real bug or modeling error?** The harness writes and reads with raw commands (`sendCommand` with a
Buffer type mapping passed per call), never with the app's readers or writers. So a difference between
the source and target snapshot is an app difference, unless the harness itself mis-reads. Re-run the
counterexample by hand: `docker exec sra-redis1 redis-cli -n 0` to create it, then export and import
through the UI (or `verify-sra`), then compare with `redis-cli`. If the harness disagrees with
`redis-cli`, fix the harness. Never weaken a property or remove a generator case to make it pass.

## Open findings (as of 4a611cb)

Each is excluded in regression mode by `knownFinding()` (dump) or `startsWithBom` (codec). Delete the
exclusion in the same change that fixes the finding.

| ID  | What breaks                                                                                                                                                                       | Minimal counterexample                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| F2  | A hash field name that is not valid UTF-8 is decoded lossily. node-redis returns HGETALL as an object, so `rawPairs` (values.ts) gets string keys and the bytes are already gone. | field `C0 AF` (with a 2nd field `""`) does not come back   |
| F3  | Stream field names: the same object decoding (`xRange` message) mangles non-UTF-8 names and collapses repeated names in one entry. Export keeps only the last pair.               | entry `a=1 a=2` comes back as `a=2`; name `FF` as `U+FFFD` |
| F4  | A zset score of `inf`/`-inf` exports as `null` (JSON has no Infinity), and `importDumpSchema`/`z.number().finite()` rejects the key on import.                                    | member `""` with score `+inf`                              |
| F5  | An empty stream (exists, 0 entries) exports with `entries: []`, so `importDump` writes nothing and the key is gone.                                                               | `XADD` then `XTRIM MAXLEN 0`                               |
| F6  | Stream entry IDs are not preserved: `streamAdd` uses `XADD key *`, so every entry gets a new ID.                                                                                  | any stream                                                 |

Fixed: F1 (a value, field or member starting with the UTF-8 BOM lost those 3 bytes, because
`TextDecoder` strips a leading BOM; `toWireValue` now passes `ignoreBOM: true`). The codec properties and
the string/list/set dump properties now pass in findings mode, and `src/lib/value.test.ts` pins the case.
F3 was confirmed with a direct export of such a stream.

## Scope: what a pass covers and what it does not

Covered: keys of every type with arbitrary name bytes after the test prefix, contents up to the generator
bounds above, TTLs from 100 to 100000 s or none, and one dump through `JSON.stringify` -> `JSON.parse` ->
`importDumpSchema` -> `importDump`, into a database without those keys. Cases are drawn at random under
a fixed seed. A pass says these cases held, not that every input does.

Not covered:

- Collections over `MAX_EXPORT_ENTRIES` (1000) or databases over `MAX_EXPORT_KEYS` (50000). Export
  truncates them by design.
- Importing over existing keys (import merges: HSET/RPUSH/SADD onto what is there).
- Keys that change or expire during the export (SCAN guarantees, concurrency).
- The HTTP layer: the download route's `JSON.stringify(dump, null, '\t')` and the import form's file
  upload (`file.text()`). These are the same JSON operations the property applies, but they are not
  executed here. Use `verify-sra` for the UI path.
- Redis modules types, `-0` vs `0` scores (compared as equal), stream consumer groups, key encodings.

## Coverage record

Last confirmed that the check describes the code at commit **4a611cb** (2026-11-02, includes the F1 fix).

| File                                   | Functions the check relies on                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/value.ts`                     | `toWireValue`, `fromWireValue`                                                                                                     |
| `src/lib/server/redis/dump.ts`         | `exportKeys`, `importDumpSchema`, `valueSchemas`, `importDump`                                                                     |
| `src/lib/server/redis/values.ts`       | `readKeyValue`, `pairEntries`, `rawPairs`, `memberList`, `setString`, `hashSetField`, `listPush`, `setAdd`, `zSetAdd`, `streamAdd` |
| `src/lib/server/redis/keys.ts`         | `scanPage`, `expireKey`                                                                                                            |
| `src/lib/server/redis/type-mapping.ts` | `buffers`                                                                                                                          |

To see whether the check may be stale:

```bash
git diff --stat 4a611cb -- src/lib/value.ts src/lib/server/redis/dump.ts src/lib/server/redis/values.ts src/lib/server/redis/keys.ts src/lib/server/redis/type-mapping.ts
```

If that shows changes, re-read the changed functions against the generators and the snapshot before
trusting a pass. Look for: a new key type, a new dump field (for example stream IDs once F6 is fixed),
a changed TTL rule, or a new reader path. Extend `dataByType`, `writeKey` and `snapshot` in
`dump.roundtrip.formal.ts` to match. Move the commit above forward only after you have confirmed that
the check describes the code at the new commit and regression mode passes.

## Proving a change to the check itself

After editing a generator, the snapshot or an exclusion, make a scratch break in the real code that the
property should catch, and confirm it fails in regression mode. Examples that were caught when this check
was built: reversing the list sort in `importDump` (counterexample: a 2-element list), and
`fatal: false` in `toWireValue` (counterexample: `80`). Then restore the file with `git checkout -- <file>`
and confirm regression mode passes again.
