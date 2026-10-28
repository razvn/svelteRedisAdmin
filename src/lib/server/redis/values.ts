import { buffers } from './type-mapping.ts';
import { toWireValue, fromWireValue, type WireValue } from '#lib/value.ts';
import type { KeyType } from './keys.ts';
import type { RedisConnection } from './connection.ts';

export interface StringKey {
	type: 'string';
	value: WireValue;
}

export interface HashEntry {
	field: WireValue;
	value: WireValue;
}

export interface HashKey {
	type: 'hash';
	length: number;
	/** Entries [offset, offset+count) of the hash, SCAN-free (HGETALL then slice). */
	entries: HashEntry[];
}

export interface ListKey {
	type: 'list';
	length: number;
	start: number;
	entries: { index: number; value: WireValue }[];
}

export interface SetKey {
	type: 'set';
	length: number;
	members: WireValue[];
}

export interface ZSetEntry {
	member: WireValue;
	score: number;
}

export interface ZSetKey {
	type: 'zset';
	length: number;
	entries: ZSetEntry[];
}

export interface StreamEntry {
	id: string;
	fields: { name: WireValue; value: WireValue }[];
}

export interface StreamKey {
	type: 'stream';
	length: number;
	entries: StreamEntry[];
}

export type KeyValue = StringKey | HashKey | ListKey | SetKey | ZSetKey | StreamKey;

const PAGE = 100;

/**
 * Reply normalizers: depending on the type mapping the same command comes back as a
 * `Map`, a flat pair array, an array of tuples or a plain object. `withMapping` is
 * always called on the buffers view, so values are Buffers.
 */
function pairEntries(reply: unknown): [Buffer, Buffer][] {
	if (reply instanceof Map) return [...reply.entries()] as [Buffer, Buffer][];
	if (Array.isArray(reply)) {
		if (reply.every((entry) => Array.isArray(entry))) {
			return reply as unknown as [Buffer, Buffer][];
		}
		const flat: [Buffer, Buffer][] = [];
		for (let i = 0; i + 1 < reply.length; i += 2)
			flat.push([reply[i] as Buffer, reply[i + 1] as Buffer]);
		return flat;
	}
	if (reply && typeof reply === 'object') {
		return Object.entries(reply) as unknown as [Buffer, Buffer][];
	}
	return [];
}

function memberList(reply: unknown): Buffer[] {
	if (reply instanceof Set) return [...reply] as Buffer[];
	if (Array.isArray(reply)) return reply as Buffer[];
	const members = (reply as { members?: unknown } | null)?.['members'];
	if (Array.isArray(members)) return members as Buffer[];
	return [];
}

/** Read a key's value, paginated for the collection types. `key` must exist. */
export async function readKeyValue(
	client: RedisConnection,
	key: Buffer,
	type: KeyType,
	options: { offset?: number; count?: number } = {}
): Promise<KeyValue> {
	const raw = buffers(client);
	const offset = Math.max(0, options.offset ?? 0);
	const count = Math.min(Math.max(1, options.count ?? PAGE), 1000);
	switch (type) {
		case 'string': {
			const value = (await raw.get(key)) as unknown as Buffer;
			return { type: 'string', value: toWireValue(value) };
		}
		case 'hash': {
			const length = Number(await raw.hLen(key));
			const entries = pairEntries(await raw.hGetAll(key))
				.slice(offset, offset + count)
				.map(([field, value]) => ({
					field: toWireValue(field),
					value: toWireValue(value)
				}));
			return { type: 'hash', length, entries };
		}
		case 'list': {
			const length = Number(await raw.lLen(key));
			const slice = (await raw.lRange(key, offset, offset + count - 1)) as unknown as Buffer[];
			return {
				type: 'list',
				length,
				start: offset,
				entries: slice.map((value, index) => ({ index: offset + index, value: toWireValue(value) }))
			};
		}
		case 'set': {
			const length = Number(await raw.sCard(key));
			const members = memberList(await raw.sMembers(key))
				.slice(offset, offset + count)
				.map((member) => toWireValue(member));
			return { type: 'set', length, members };
		}
		case 'zset': {
			const length = Number(await raw.zCard(key));
			const all = (await raw.zRangeWithScores(key, 0, -1)) as unknown as {
				value: Buffer;
				score: number | string;
			}[];
			const entries = all.slice(offset, offset + count).map((entry) => ({
				member: toWireValue(entry.value),
				score: Number(entry.score)
			}));
			return { type: 'zset', length, entries };
		}
		case 'stream': {
			const length = Number(await raw.xLen(key));
			const all = (await raw.xRange(key, '-', '+')) as unknown as {
				id: string;
				message: unknown;
			}[];
			const entries = all.slice(offset, offset + count).map((entry) => ({
				id: String(entry.id),
				fields: pairEntries(entry.message).map(([name, value]) => ({
					name: toWireValue(name),
					value: toWireValue(value)
				}))
			}));
			return { type: 'stream', length, entries };
		}
		default:
			throw new Error(`Unsupported key type: ${type}`);
	}
}

/** Write helpers used by the key editor — one targeted command per edit. */

export async function setString(
	client: RedisConnection,
	key: Buffer,
	value: WireValue,
	ttl?: number
): Promise<void> {
	await client.set(key, fromWireValue(value));
	if (ttl !== undefined) await (ttl > 0 ? client.expire(key, ttl) : client.persist(key));
}

export async function hashSetField(
	client: RedisConnection,
	key: Buffer,
	field: WireValue,
	value: WireValue
): Promise<void> {
	await client.hSet(key, fromWireValue(field), fromWireValue(value));
}

export async function hashDeleteField(
	client: RedisConnection,
	key: Buffer,
	field: WireValue
): Promise<void> {
	await client.hDel(key, fromWireValue(field));
}

export async function listSetIndex(
	client: RedisConnection,
	key: Buffer,
	index: number,
	value: WireValue
): Promise<void> {
	await client.lSet(key, index, fromWireValue(value));
}

export async function listPush(
	client: RedisConnection,
	key: Buffer,
	side: 'head' | 'tail',
	values: WireValue[]
): Promise<void> {
	if (values.length === 0) return;
	const buffers_ = values.map((value) => fromWireValue(value));
	await (side === 'head' ? client.lPush(key, buffers_) : client.rPush(key, buffers_));
}

export async function listDeleteIndex(client: RedisConnection, key: Buffer, index: number) {
	// LREM by value: find the element first so only that occurrence is removed.
	const value = (await buffers(client).lIndex(key, index)) as unknown as Buffer | null;
	if (value === null) throw new Error(`No element at index ${index}`);
	const removed = Number(await client.lRem(key, 1, value));
	if (removed === 0) throw new Error(`Element at index ${index} changed before deletion`);
}

export async function setAdd(
	client: RedisConnection,
	key: Buffer,
	members: WireValue[]
): Promise<void> {
	if (members.length === 0) return;
	await client.sAdd(
		key,
		members.map((member) => fromWireValue(member))
	);
}

export async function setRemove(
	client: RedisConnection,
	key: Buffer,
	members: WireValue[]
): Promise<void> {
	if (members.length === 0) return;
	await client.sRem(
		key,
		members.map((member) => fromWireValue(member))
	);
}

export async function zSetAdd(
	client: RedisConnection,
	key: Buffer,
	entry: ZSetEntry
): Promise<void> {
	await client.zAdd(key, { score: entry.score, value: fromWireValue(entry.member) });
}

export async function zSetRemove(
	client: RedisConnection,
	key: Buffer,
	members: WireValue[]
): Promise<void> {
	if (members.length === 0) return;
	await client.zRem(
		key,
		members.map((member) => fromWireValue(member))
	);
}

export async function streamAdd(
	client: RedisConnection,
	key: Buffer,
	fields: { name: WireValue; value: WireValue }[]
): Promise<void> {
	if (fields.length === 0) throw new Error('A stream entry needs at least one field');
	await client.xAdd(
		key,
		'*',
		Object.fromEntries(
			fields.map((field) => [fromWireValue(field.name), fromWireValue(field.value)])
		)
	);
}

export async function streamDelete(
	client: RedisConnection,
	key: Buffer,
	ids: string[]
): Promise<void> {
	if (ids.length === 0) return;
	await client.xDel(key, ids);
}
