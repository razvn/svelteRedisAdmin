import { buffers } from './type-mapping.ts';
import { toWireValue, type WireValue } from '#lib/value.ts';
import type { RedisConnection } from './connection.ts';

export type KeyType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream' | 'unknown';

export interface KeyListItem {
	/** Raw key bytes, tagged for the wire. */
	key: WireValue;
	type: KeyType;
	/** Seconds to live; -1 = no expiry, -2 = key missing. */
	ttl: number;
}

export interface ScanPage {
	/** Next SCAN cursor; 0 means the full keyspace has been walked. */
	cursor: number;
	keys: KeyListItem[];
}

const KNOWN_TYPES = new Set(['string', 'hash', 'list', 'set', 'zset', 'stream']);

export async function scanPage(
	client: RedisConnection,
	options: { cursor?: number; count: number; pattern?: string; type?: KeyType }
): Promise<ScanPage> {
	const raw = buffers(client);
	const reply = await raw.scan(String(options.cursor ?? 0), {
		MATCH: options.pattern,
		COUNT: options.count,
		TYPE: options.type && options.type !== 'unknown' ? options.type : undefined
	});
	const nextCursor = Number(reply.cursor);
	const keys: KeyListItem[] = [];
	// With the buffers view SCAN's key names come back as Buffers (binary-safe).
	for (const name of reply.keys as unknown as Buffer[]) {
		const type = (await raw.type(name)) as unknown;
		keys.push({
			key: toWireValue(name),
			type: KNOWN_TYPES.has(type as string) ? (type as KeyType) : 'unknown',
			ttl: Number(await raw.ttl(name))
		});
	}
	return { cursor: nextCursor, keys };
}

/** Count keys matching `pattern` by walking SCAN to completion (bounded for safety). */
export async function countKeys(
	client: RedisConnection,
	options: { pattern?: string; max?: number } = {}
): Promise<number> {
	const raw = buffers(client);
	const max = options.max ?? 100_000;
	let cursor = 0;
	let total = 0;
	do {
		const reply = await raw.scan(String(cursor), { MATCH: options.pattern });
		cursor = Number(reply.cursor);
		total += reply.keys.length;
	} while (cursor !== 0 && total < max);
	return total;
}

/** TTL plus encoding/length facts shown next to a key (`OBJECT ENCODING`, type size). */
export async function keyDetails(
	client: RedisConnection,
	key: Buffer
): Promise<{ ttl: number; encoding: string | null; size: number | null }> {
	const raw = buffers(client);
	const ttl = Number(await raw.ttl(key));
	let encoding: string | null = null;
	try {
		encoding = (await raw.sendCommand(['OBJECT', 'ENCODING', key])) as unknown as string;
		if (Buffer.isBuffer(encoding)) encoding = encoding.toString('utf8');
	} catch {
		// OBJECT is optional (e.g. in cluster proxies); show nothing instead of failing.
	}
	return { ttl, encoding, size: await keySize(client, key) };
}

/** Logical size of a key: string length, or number of entries. -1 when unknown. */
export async function keySize(client: RedisConnection, key: Buffer): Promise<number | null> {
	const raw = buffers(client);
	const type = (await raw.type(key)) as unknown as string;
	switch (type) {
		case 'string':
			return Number(await raw.strLen(key));
		case 'hash':
			return Number(await raw.hLen(key));
		case 'list':
			return Number(await raw.lLen(key));
		case 'set':
			return Number(await raw.sCard(key));
		case 'zset':
			return Number(await raw.zCard(key));
		case 'stream':
			return Number(await raw.xLen(key));
		default:
			return null;
	}
}

export async function deleteKeys(client: RedisConnection, keys: Buffer[]): Promise<number> {
	if (keys.length === 0) return 0;
	return Number(await client.del(keys));
}

export async function renameKey(client: RedisConnection, from: Buffer, to: Buffer): Promise<void> {
	await client.rename(from, to);
}

export async function expireKey(
	client: RedisConnection,
	key: Buffer,
	seconds: number
): Promise<void> {
	if (seconds <= 0) await client.persist(key);
	else await client.expire(key, seconds);
}
