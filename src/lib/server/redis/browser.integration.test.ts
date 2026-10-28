import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createConnection, type RedisConnection } from './connection.ts';
import { deleteKeys, scanPage } from './keys.ts';
import {
	readKeyValue,
	setString,
	hashSetField,
	listPush,
	setAdd,
	zSetAdd,
	streamAdd
} from './values.ts';
import { createKey } from './create-key.ts';
import { exportKeys, importDump, importDumpSchema } from './dump.ts';

// Uses db 3 of the dev redis1 instance (127.0.0.1:33380) — tests only touch sra_test:* keys.
const available = await createConnection(
	{
		host: '127.0.0.1',
		port: 33380,
		db: 3,
		databases: 16,
		separator: ':',
		tls: false,
		auth: undefined,
		username: undefined,
		name: undefined,
		filter: undefined,
		path: undefined
	},
	3
).then(
	(client) => ({ ok: true as const, client }),
	() => ({ ok: false as const, client: undefined })
);

describe.skipIf(!available.ok)('key browser services (integration)', () => {
	let client: RedisConnection;

	beforeAll(async () => {
		if (!available.ok) return;
		client = available.client;
		await client.flushDb();
	});

	afterAll(async () => {
		if (client) await client.quit();
	});

	const kb = (key: string) => Buffer.from(key, 'utf8');
	const text = (t: string) => ({ kind: 'text' as const, text: t });

	test('scanPage paginates and honours filter + type', async () => {
		for (let i = 0; i < 5; i++) await setString(client, kb(`sra_test:page:${i}`), text(String(i)));
		await client.hSet(kb('sra_test:page:hash'), 'field', 'value');

		let cursor = 0;
		const seen: string[] = [];
		let pages = 0;
		do {
			const page = await scanPage(client, {
				cursor,
				count: 2,
				pattern: 'sra_test:page:*',
				type: 'string'
			});
			cursor = page.cursor;
			pages++;
			for (const item of page.keys) {
				expect(item.type).toBe('string');
				if (item.key.kind === 'text') seen.push(item.key.text);
			}
		} while (cursor !== 0 && pages < 100);

		expect(seen.sort()).toEqual([
			'sra_test:page:0',
			'sra_test:page:1',
			'sra_test:page:2',
			'sra_test:page:3',
			'sra_test:page:4'
		]);
	});

	test('createKey builds every type from the form payload', async () => {
		expect(await createKey(client, kb('sra_test:create:str'), 'string', 'hello')).toBeNull();
		expect(await readKeyValue(client, kb('sra_test:create:str'), 'string')).toEqual({
			type: 'string',
			value: text('hello')
		});

		expect(
			await createKey(client, kb('sra_test:create:hash'), 'hash', '{"a":"1","b":"2"}')
		).toBeNull();
		const hash = await readKeyValue(client, kb('sra_test:create:hash'), 'hash');
		expect(hash).toMatchObject({ type: 'hash', length: 2 });

		// Not a JSON map: falls back to the single field "value".
		expect(await createKey(client, kb('sra_test:create:hash1'), 'hash', 'plain')).toBeNull();
		const hash1 = await readKeyValue(client, kb('sra_test:create:hash1'), 'hash');
		expect(hash1).toMatchObject({ type: 'hash', length: 1 });
		if (hash1.type === 'hash') {
			// HGETALL replies keep string field names, so the field arrives binary-tagged.
			const field = hash1.entries[0]?.field;
			const fieldName =
				field?.kind === 'text'
					? field.text
					: field?.kind === 'binary'
						? Buffer.from(field.base64, 'base64').toString('utf8')
						: '';
			expect(fieldName).toBe('value');
			expect(hash1.entries[0]?.value).toEqual(text('plain'));
		}

		expect(await createKey(client, kb('sra_test:create:list'), 'list', 'a\nb\nc')).toBeNull();
		const list = await readKeyValue(client, kb('sra_test:create:list'), 'list');
		expect(list).toMatchObject({ type: 'list', length: 3 });

		expect(await createKey(client, kb('sra_test:create:set'), 'set', 'm1\nm2')).toBeNull();
		const set = await readKeyValue(client, kb('sra_test:create:set'), 'set');
		expect(set).toMatchObject({ type: 'set', length: 2 });

		expect(
			await createKey(client, kb('sra_test:create:zset'), 'zset', '1.5 one\n2 two')
		).toBeNull();
		const zset = await readKeyValue(client, kb('sra_test:create:zset'), 'zset');
		expect(zset.type === 'zset' && zset.entries).toContainEqual({
			member: text('one'),
			score: 1.5
		});

		expect(
			await createKey(client, kb('sra_test:create:stream'), 'stream', '{"kind":"signup"}')
		).toBeNull();
		const stream = await readKeyValue(client, kb('sra_test:create:stream'), 'stream');
		expect(stream.type).toBe('stream');
		// XRANGE message field names keep string keys, so the name arrives binary-tagged.
		const field = stream.type === 'stream' ? stream.entries[0]?.fields[0] : undefined;
		const fieldName =
			field?.name.kind === 'text'
				? field.name.text
				: field?.name.kind === 'binary'
					? Buffer.from(field.name.base64, 'base64').toString('utf8')
					: '';
		expect(fieldName).toBe('kind');
		expect(field?.value).toEqual(text('signup'));
	});

	test('createKey reports unusable payloads and applies ttl', async () => {
		expect(await createKey(client, kb('sra_test:create:bad'), 'zset', 'oops')).toMatch(
			/score member/
		);
		expect(await createKey(client, kb('sra_test:create:empty'), 'list', '\n\n')).toMatch(
			/per line/
		);
		expect(await client.exists(kb('sra_test:create:bad'))).toBe(0);

		expect(await createKey(client, kb('sra_test:create:ttl'), 'string', 'x', 120)).toBeNull();
		expect(Number(await client.ttl(kb('sra_test:create:ttl')))).toBeGreaterThan(0);
	});

	test('exportKeys builds a portable payload', async () => {
		await setString(client, kb('sra_test:export:str'), text('v'));
		await client.expire(kb('sra_test:export:str'), 60);
		await hashSetField(client, kb('sra_test:export:hash'), text('f'), text('v'));

		const dump = await exportKeys(client, { db: 3, filter: 'sra_test:export:*' });
		expect(dump.format).toBe('svelteRedisAdmin/1');
		expect(dump.db).toBe(3);
		expect(dump.count).toBe(2);
		const str = dump.keys.find(
			(k) => k.key.kind === 'text' && k.key.text === 'sra_test:export:str'
		);
		expect(str?.type).toBe('string');
		expect(str?.ttl).toBeGreaterThan(0);
		expect(str?.value).toEqual({ type: 'string', value: text('v') });
	});

	test('import round-trips an export', async () => {
		await setString(client, kb('sra_test:rt:str'), text('v1'));
		await client.expire(kb('sra_test:rt:str'), 100);
		await hashSetField(client, kb('sra_test:rt:hash'), text('f'), text('v'));
		await listPush(client, kb('sra_test:rt:list'), 'tail', [text('a'), text('b')]);
		await setAdd(client, kb('sra_test:rt:set'), [text('m')]);
		await zSetAdd(client, kb('sra_test:rt:zset'), { member: text('z'), score: 1.5 });
		await streamAdd(client, kb('sra_test:rt:stream'), [{ name: text('k'), value: text('v') }]);

		const dump = await exportKeys(client, { db: 3, filter: 'sra_test:rt:*' });
		expect(dump.count).toBe(6);
		const parsed = importDumpSchema.parse(dump);

		await deleteKeys(
			client,
			dump.keys.map((k) => Buffer.from(k.key.kind === 'text' ? k.key.text : '', 'utf8'))
		);
		expect(await client.exists(kb('sra_test:rt:str'))).toBe(0);

		const result = await importDump(client, parsed);
		expect(result.errors).toEqual([]);
		expect(result.imported).toBe(6);

		expect(await readKeyValue(client, kb('sra_test:rt:list'), 'list')).toMatchObject({
			type: 'list',
			length: 2,
			entries: [
				{ index: 0, value: text('a') },
				{ index: 1, value: text('b') }
			]
		});
		const zset = await readKeyValue(client, kb('sra_test:rt:zset'), 'zset');
		expect(zset.type === 'zset' && zset.entries[0]).toEqual({ member: text('z'), score: 1.5 });
		expect(Number(await client.ttl(kb('sra_test:rt:str')))).toBeGreaterThan(0);
	});

	test('importDump collects per-key errors without stopping', async () => {
		const result = await importDump(client, {
			keys: [
				{
					key: text('sra_test:imp:ok'),
					type: 'string',
					value: { type: 'string', value: text('x') }
				},
				{ key: text('sra_test:imp:bad'), type: 'string', value: { type: 'bogus' } }
			]
		});
		expect(result.imported).toBe(1);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain('sra_test:imp:bad');
	});

	test('cleanup leaves nothing behind', async () => {
		const page = await scanPage(client, { count: 100, pattern: 'sra_test:*' });
		await deleteKeys(
			client,
			page.keys.map((k) =>
				k.key.kind === 'text'
					? Buffer.from(k.key.text, 'utf8')
					: Buffer.from(k.key.base64, 'base64')
			)
		);
		const after = await scanPage(client, { count: 100, pattern: 'sra_test:*' });
		expect(after.keys).toHaveLength(0);
	});
});
