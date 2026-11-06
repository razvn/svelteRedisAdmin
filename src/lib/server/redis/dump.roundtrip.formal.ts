import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { RESP_TYPES } from 'redis';
import { createConnection, type RedisConnection } from './connection.ts';
import { exportKeys, importDump, importDumpSchema } from './dump.ts';
import { EXCLUDE_KNOWN_FINDINGS, isUtf8, redisBytes } from '#lib/value.arbitraries.ts';

// Formal check (generated inputs) for the promise in dump.ts: restoring the JSON export of a database
// reproduces every exported key byte for byte. Each run writes a generated set of keys into db 0 with raw
// Redis commands, exports them with exportKeys(), sends the dump through JSON and importDumpSchema, imports
// it into db 1 with importDump(), then reads both databases back with raw commands and compares.
// Only `sra_test:dumprt:<pid>:*` keys are touched; nothing is flushed. Covered by the
// verify-dump-roundtrip skill (.claude/skills/verify-dump-roundtrip).

const SRC_DB = 0;
const DST_DB = 1;
const RUNS = 40;
// Fixed by default so a rerun replays the same cases; SRA_FC_SEED=<n> explores other ones.
const SEED = Number(process.env['SRA_FC_SEED'] ?? 20261102);
const PREFIX = `sra_test:dumprt:${process.pid}:`;
const SERVER = {
	host: '127.0.0.1',
	port: Number(process.env['REDIS_TEST_PORT'] ?? 33380),
	db: 0,
	databases: 16,
	separator: ':',
	tls: false,
	auth: undefined,
	username: undefined,
	name: undefined,
	filter: undefined,
	path: undefined
};

const available = await createConnection(SERVER, SRC_DB).then(
	(client) => ({ ok: true as const, client }),
	() => ({ ok: false as const, client: undefined })
);

type Bytes = Buffer;
type Raw = (args: (string | Buffer)[]) => Promise<unknown>;

const hex = (b: Bytes) => b.toString('hex');
const uniqueBy = <T>(arb: fc.Arbitrary<T>, key: (t: T) => string, min: number, max: number) =>
	fc.uniqueArray(arb, { selector: key, minLength: min, maxLength: max });

const ttl = fc.option(fc.integer({ min: 100, max: 100_000 }), { nil: null });
// Redis scores are any double but NaN; the infinities and -0 are drawn explicitly, plain fc.double rarely hits them.
const score = fc.oneof(fc.double({ noNaN: true }), fc.constantFrom(Infinity, -Infinity, -0));
const fieldPairs = fc.array(fc.tuple(redisBytes, redisBytes), { minLength: 1, maxLength: 3 });

// Field names may repeat inside one entry (Redis keeps every pair); `trim` empties the stream while the
// key stays (XTRIM MAXLEN 0), a state Redis allows for streams only.
const streamAny = fc.record({
	entries: fc.array(fieldPairs, { minLength: 1, maxLength: 3 }),
	trim: fc.boolean()
});
// Random streams nearly always hit F3/F5, so filtering them would skip almost every case: in exclude
// mode build streams with distinct UTF-8 field names that are never emptied instead.
const utf8Name = fc.string({ unit: 'binary', maxLength: 8 }).map((t) => Buffer.from(t, 'utf8'));
const streamAvoidingKnown = fc.record({
	entries: fc.array(
		uniqueBy(fc.tuple(utf8Name, redisBytes), ([f]) => hex(f), 1, 3),
		{ minLength: 1, maxLength: 3 }
	),
	trim: fc.constant(false)
});

/** Generated contents per type, as plain data so a counterexample prints as bytes. */
const dataByType = {
	string: redisBytes,
	hash: uniqueBy(fc.tuple(redisBytes, redisBytes), ([f]) => hex(f), 1, 5),
	list: fc.array(redisBytes, { minLength: 1, maxLength: 6 }),
	set: uniqueBy(redisBytes, hex, 1, 5),
	zset: uniqueBy(fc.tuple(redisBytes, score), ([m]) => hex(m), 1, 5),
	stream: EXCLUDE_KNOWN_FINDINGS ? streamAvoidingKnown : streamAny
} as const;

type GenType = keyof typeof dataByType;
type GenKey = { type: GenType; suffix: Bytes; ttl: number | null; data: unknown };

const keysOf = (type: GenType) =>
	uniqueBy(
		fc.record({
			type: fc.constant(type),
			suffix: redisBytes,
			ttl,
			data: dataByType[type] as fc.Arbitrary<unknown>
		}),
		(k) => hex(k.suffix),
		1,
		4
	);

/**
 * Which open finding (see value.arbitraries.ts) a generated key would hit, or null. Only consulted with
 * SRA_KNOWN_FINDINGS=exclude.
 *   F2 a hash field name is not valid UTF-8 (HGETALL comes back as an object: names decoded lossily)
 *   F3 a stream field name is not valid UTF-8 or repeats in one entry (same object decoding)
 *   F4 a zset score is +/-inf (JSON has no Infinity: exported as null, import rejects it)
 *   F5 an empty stream (importDump writes nothing, the key is not recreated)
 */
function knownFinding(k: GenKey): string | null {
	switch (k.type) {
		case 'string':
		case 'list':
		case 'set':
			return null;
		case 'hash': {
			const pairs = k.data as [Bytes, Bytes][];
			return pairs.some(([f]) => !isUtf8(f)) ? 'F2' : null;
		}
		case 'zset': {
			const entries = k.data as [Bytes, number][];
			return entries.some(([, s]) => !Number.isFinite(s)) ? 'F4' : null;
		}
		case 'stream': {
			const { entries, trim } = k.data as { entries: [Bytes, Bytes][][]; trim: boolean };
			const names = (pairs: [Bytes, Bytes][]) => pairs.map(([f]) => hex(f));
			if (
				entries.some(
					(pairs) => pairs.some(([f]) => !isUtf8(f)) || new Set(names(pairs)).size < pairs.length
				)
			)
				return 'F3';
			return trim ? 'F5' : null;
		}
	}
}

/** Create one generated key with raw commands (independent of the app's writers). */
async function writeKey(raw: Raw, key: Bytes, k: GenKey) {
	switch (k.type) {
		case 'string':
			await raw(['SET', key, k.data as Bytes]);
			break;
		case 'hash':
			await raw(['HSET', key, ...(k.data as [Bytes, Bytes][]).flat()]);
			break;
		case 'list':
			await raw(['RPUSH', key, ...(k.data as Bytes[])]);
			break;
		case 'set':
			await raw(['SADD', key, ...(k.data as Bytes[])]);
			break;
		case 'zset':
			await raw([
				'ZADD',
				key,
				...(k.data as [Bytes, number][]).flatMap(([m, s]) => [String(s), m])
			]);
			break;
		case 'stream': {
			const { entries, trim } = k.data as { entries: [Bytes, Bytes][][]; trim: boolean };
			for (const pairs of entries) await raw(['XADD', key, '*', ...pairs.flat()]);
			if (trim) await raw(['XTRIM', key, 'MAXLEN', '0']);
			break;
		}
	}
	if (k.ttl !== null) await raw(['EXPIRE', key, String(k.ttl)]);
}

/** Canonical, comparable snapshot of one key read with raw commands (no app code involved). */
async function snapshot(raw: Raw, key: Bytes, ignoreStreamIds: boolean) {
	const type = String(await raw(['TYPE', key]));
	const pairs = (flat: Bytes[]) => {
		const out: [string, string][] = [];
		for (let i = 0; i < flat.length; i += 2) out.push([hex(flat[i]), hex(flat[i + 1])]);
		return out;
	};
	let value: unknown;
	switch (type) {
		case 'string':
			value = hex((await raw(['GET', key])) as Bytes);
			break;
		case 'hash':
			value = pairs((await raw(['HGETALL', key])) as Bytes[]).sort();
			break;
		case 'list':
			value = ((await raw(['LRANGE', key, '0', '-1'])) as Bytes[]).map(hex);
			break;
		case 'set':
			value = ((await raw(['SMEMBERS', key])) as Bytes[]).map(hex).sort();
			break;
		case 'zset':
			value = pairs((await raw(['ZRANGE', key, '0', '-1', 'WITHSCORES'])) as Bytes[]).map(
				([m, s]) => [m, Number(Buffer.from(s, 'hex').toString()) + 0] // + 0 folds -0 into 0
			);
			break;
		case 'stream':
			value = ((await raw(['XRANGE', key, '-', '+'])) as [Bytes, Bytes[]][]).map(([id, flat]) =>
				ignoreStreamIds ? pairs(flat) : [String(id), pairs(flat)]
			);
			break;
	}
	return { type, value, ttl: Number(await raw(['TTL', key])) };
}

describe.skipIf(!available.ok)('export -> import round-trip (property, integration)', () => {
	let src: RedisConnection;
	let dst: RedisConnection;
	let rawSrc: Raw;
	let rawDst: Raw;

	async function clean() {
		for (const raw of [rawSrc, rawDst]) {
			let cursor = '0';
			do {
				const [next, keys] = (await raw([
					'SCAN',
					cursor,
					'MATCH',
					`${PREFIX}*`,
					'COUNT',
					'500'
				])) as [Bytes, Bytes[]];
				cursor = String(next);
				if (keys.length > 0) await raw(['DEL', ...keys]);
			} while (cursor !== '0');
		}
	}

	beforeAll(async () => {
		src = available.client!;
		dst = await createConnection(SERVER, DST_DB);
		// Bulk replies as Buffers, so binary names and values are compared byte for byte. (sendCommand
		// ignores the withCommandOptions view used by the app; the mapping must be passed per call.)
		const asBuffers = { typeMapping: { [RESP_TYPES.BLOB_STRING]: Buffer } };
		rawSrc = (args) => src.sendCommand(args, asBuffers);
		rawDst = (args) => dst.sendCommand(args, asBuffers);
		await clean();
	});

	afterAll(async () => {
		await clean();
		await src.quit();
		await dst.quit();
	});

	/** P(type): for every generated db state of that type, import(JSON(export(state))) reproduces it. */
	async function roundTrip(keys: GenKey[], ignoreStreamIds: boolean) {
		fc.pre(!(EXCLUDE_KNOWN_FINDINGS && keys.some((k) => knownFinding(k) !== null)));
		await clean();
		const names = keys.map((k) => Buffer.concat([Buffer.from(PREFIX), k.suffix]));
		for (const [i, k] of keys.entries()) await writeKey(rawSrc, names[i], k);
		const dump = await exportKeys(src, { db: SRC_DB, filter: `${PREFIX}*` });
		const result = await importDump(dst, importDumpSchema.parse(JSON.parse(JSON.stringify(dump))));
		expect(result.errors).toEqual([]);
		for (const name of names) {
			const before = await snapshot(rawSrc, name, ignoreStreamIds);
			const after = await snapshot(rawDst, name, ignoreStreamIds);
			expect({ key: hex(name), type: after.type, value: after.value }).toEqual({
				key: hex(name),
				type: before.type,
				value: before.value
			});
			if (before.ttl === -1) expect(after.ttl).toBe(-1);
			else expect(Math.abs(after.ttl - before.ttl)).toBeLessThanOrEqual(2);
		}
	}

	for (const type of Object.keys(dataByType) as GenType[]) {
		test(`${type} keys survive export -> import byte for byte`, async () => {
			await fc.assert(
				fc.asyncProperty(keysOf(type), (keys) => roundTrip(keys, true)),
				{ numRuns: RUNS, seed: SEED }
			);
		});
	}

	// F6: importDump re-adds stream entries with XADD '*', so every entry gets a new ID.
	test.skipIf(EXCLUDE_KNOWN_FINDINGS)('stream entry IDs survive export -> import', async () => {
		await fc.assert(
			fc.asyncProperty(keysOf('stream'), (keys) => roundTrip(keys, false)),
			{ numRuns: RUNS, seed: SEED }
		);
	});
});
