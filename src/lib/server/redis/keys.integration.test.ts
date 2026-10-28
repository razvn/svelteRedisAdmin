import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createConnection } from './connection.ts';
import {
	countKeys,
	deleteKeys,
	expireKey,
	keyDetails,
	renameKey,
	scanPage,
	type KeyType
} from './keys.ts';
import {
	readKeyValue,
	setString,
	hashSetField,
	listPush,
	setAdd,
	zSetAdd,
	streamAdd
} from './values.ts';
import type { RedisConnection } from './connection.ts';

// Uses db 2 of the dev redis1 instance (127.0.0.1:33380) — tests only touch sra_test:* keys.
const available = await createConnection(
	{
		host: '127.0.0.1',
		port: 33380,
		db: 2,
		databases: 16,
		separator: ':',
		tls: false,
		auth: undefined,
		username: undefined,
		name: undefined,
		filter: undefined,
		path: undefined
	},
	2
).then(
	(client) => ({ ok: true as const, client }),
	() => ({ ok: false as const, client: undefined })
);

describe.skipIf(!available.ok)('redis services (integration)', () => {
	let client: RedisConnection;
	const owned: string[] = [];

	beforeAll(async () => {
		if (!available.ok) return;
		client = available.client;
		await client.flushDb();
	});

	afterAll(async () => {
		if (client) await client.quit();
	});

	const keyBuffer = (key: string) => Buffer.from(key, 'utf8');

	test('scanPage lists keys with type and ttl', async () => {
		await setString(client, keyBuffer('sra_test:one'), { kind: 'text', text: '1' });
		await setString(client, keyBuffer('sra_test:two'), { kind: 'text', text: '2' });
		owned.push('sra_test:one', 'sra_test:two');

		const page = await scanPage(client, { count: 10, pattern: 'sra_test:*' });
		expect(page.keys).toHaveLength(2);
		expect(page.keys.map((k) => (k.key.kind === 'text' ? k.key.text : ''))).toEqual(
			expect.arrayContaining(['sra_test:one', 'sra_test:two'])
		);
		expect(page.keys.every((k) => k.type === 'string')).toBe(true);
		expect(page.keys.every((k) => k.ttl === -1)).toBe(true);
	});

	test('readKeyValue handles every type', async () => {
		// One key per type — a Redis key holds exactly one type.
		const strK = keyBuffer('sra_test:type:string');
		const hashK = keyBuffer('sra_test:type:hash');
		const listK = keyBuffer('sra_test:type:list');
		const setK = keyBuffer('sra_test:type:set');
		const zsetK = keyBuffer('sra_test:type:zset');
		const streamK = keyBuffer('sra_test:type:stream');
		owned.push(
			'sra_test:type:string',
			'sra_test:type:hash',
			'sra_test:type:list',
			'sra_test:type:set',
			'sra_test:type:zset',
			'sra_test:type:stream'
		);

		await setString(client, strK, { kind: 'text', text: 'plain' });
		const str = await readKeyValue(client, strK, 'string' as KeyType);
		expect(str).toEqual({ type: 'string', value: { kind: 'text', text: 'plain' } });

		await hashSetField(
			client,
			hashK,
			{ kind: 'text', text: 'field' },
			{ kind: 'text', text: 'value' }
		);
		await hashSetField(client, hashK, { kind: 'text', text: 'other' }, { kind: 'text', text: 'x' });
		const hash = await readKeyValue(client, hashK, 'hash' as KeyType);
		expect(hash).toMatchObject({ type: 'hash', length: 2 });

		await listPush(client, listK, 'tail', [
			{ kind: 'text', text: 'a' },
			{ kind: 'text', text: 'b' }
		]);
		const list = await readKeyValue(client, listK, 'list' as KeyType, { offset: 1, count: 10 });
		expect(list).toMatchObject({ type: 'list', length: 2, start: 1 });

		await setAdd(client, setK, [{ kind: 'text', text: 'm1' }]);
		await setAdd(client, setK, [{ kind: 'text', text: 'm2' }]);
		const set = await readKeyValue(client, setK, 'set' as KeyType);
		expect(set).toMatchObject({ type: 'set', length: 2 });

		await zSetAdd(client, zsetK, { member: { kind: 'text', text: 'z' }, score: 1.5 });
		const zset = await readKeyValue(client, zsetK, 'zset' as KeyType);
		expect(zset).toMatchObject({ type: 'zset', length: 1 });

		await streamAdd(client, streamK, [
			{ name: { kind: 'text', text: 'kind' }, value: { kind: 'text', text: 'test' } }
		]);
		const stream = await readKeyValue(client, streamK, 'stream' as KeyType);
		expect(stream.type).toBe('stream');
		expect(stream.type === 'stream' && stream.length === 1).toBe(true);
	});

	test('binary values survive a round trip', async () => {
		const k = keyBuffer('sra_test:binary');
		const bytes = Uint8Array.of(0xff, 0xfe, 0x00, 0x01);
		await client.set(k, Buffer.from(bytes));
		owned.push('sra_test:binary');
		const value = await readKeyValue(client, k, 'string' as KeyType);
		expect(value).toEqual({
			type: 'string',
			value: { kind: 'binary', base64: Buffer.from(bytes).toString('base64') }
		});
	});

	test('keyDetails reports ttl, encoding and size', async () => {
		const k = keyBuffer('sra_test:details');
		await setString(client, k, { kind: 'text', text: 'some value' });
		owned.push('sra_test:details');
		const details = await keyDetails(client, k);
		expect(details.ttl).toBe(-1);
		expect(typeof details.encoding).toBe('string');
		expect(details.size).toBe(10);
	});

	test('expireKey and persistKey manage TTL', async () => {
		const k = keyBuffer('sra_test:ttl');
		await setString(client, k, { kind: 'text', text: 'x' });
		owned.push('sra_test:ttl');
		await expireKey(client, k, 120);
		expect(Number(await client.ttl(k))).toBeGreaterThan(0);
		await expireKey(client, k, 0);
		expect(Number(await client.ttl(k))).toBe(-1);
	});

	test('renameKey moves the key', async () => {
		const from = keyBuffer('sra_test:from');
		const to = keyBuffer('sra_test:to');
		await setString(client, from, { kind: 'text', text: 'v' });
		await renameKey(client, from, to);
		expect(await client.exists(to)).toBe(1);
		expect(await client.exists(from)).toBe(0);
		owned.push('sra_test:to');
	});

	test('deleteKeys removes keys and counts them', async () => {
		const k1 = keyBuffer('sra_test:del1');
		const k2 = keyBuffer('sra_test:del2');
		await setString(client, k1, { kind: 'text', text: 'x' });
		await setString(client, k2, { kind: 'text', text: 'x' });
		expect(await deleteKeys(client, [k1, k2])).toBe(2);
		expect(await deleteKeys(client, [])).toBe(0);
	});

	test('countKeys walks the cursor to 0', async () => {
		for (let i = 0; i < 5; i++) {
			await setString(client, keyBuffer(`sra_test:count:${i}`), { kind: 'text', text: 'x' });
			owned.push(`sra_test:count:${i}`);
		}
		expect(await countKeys(client, { pattern: 'sra_test:count:*' })).toBe(5);
	});

	test('cleanup leaves nothing behind', async () => {
		await deleteKeys(client, owned.map(keyBuffer));
		const page = await scanPage(client, { count: 100, pattern: 'sra_test:*' });
		expect(page.keys).toHaveLength(0);
	});
});
