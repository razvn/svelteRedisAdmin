import { z } from 'zod';
import { fromWireValue, type WireValue } from '#lib/value.ts';
import { scanPage, expireKey, type KeyType } from './keys.ts';
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

/**
 * Export/import: JSON dumps of one database that round-trip through the key
 * writers. Shape per key: `{key, type, ttl, value}` — `key` and every string in
 * `value` are tagged WireValues so binary data survives the trip.
 */
export interface ExportedKey {
	key: WireValue;
	type: KeyType;
	/** Seconds to live at export time (-1 = no expiry). */
	ttl: number;
	/** The readKeyValue() shape for the type, capped at MAX_ENTRIES. */
	value: unknown;
}

export interface ExportDump {
	format: 'svelteRedisAdmin/1';
	db: number;
	generatedAt: string;
	count: number;
	keys: ExportedKey[];
}

/** Hard caps so a huge database cannot OOM the node process. */
export const MAX_EXPORT_KEYS = 50_000;
export const MAX_EXPORT_ENTRIES = 1000;

/** Walk SCAN to completion and decode every key into an export dump. */
export async function exportKeys(
	client: RedisConnection,
	options: { db: number; filter?: string }
): Promise<ExportDump> {
	const keys: ExportedKey[] = [];
	let cursor = 0;
	do {
		const page = await scanPage(client, {
			cursor,
			count: 500,
			pattern: options.filter || undefined
		});
		cursor = page.cursor;
		for (const item of page.keys) {
			if (item.type === 'unknown' || keys.length >= MAX_EXPORT_KEYS) continue;
			const value = await readKeyValue(client, fromWireValue(item.key), item.type, {
				count: MAX_EXPORT_ENTRIES
			});
			keys.push({ key: item.key, type: item.type, ttl: item.ttl, value });
		}
	} while (cursor !== 0 && keys.length < MAX_EXPORT_KEYS);
	return {
		format: 'svelteRedisAdmin/1',
		db: options.db,
		generatedAt: new Date().toISOString(),
		count: keys.length,
		keys
	};
}

const wireSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('text'), text: z.string() }),
	z.object({ kind: z.literal('binary'), base64: z.string() })
]);

export const importDumpSchema = z.object({
	keys: z
		.array(
			z.object({
				key: wireSchema,
				type: z.enum(['string', 'hash', 'list', 'set', 'zset', 'stream']),
				ttl: z.number().int().optional(),
				value: z.unknown()
			})
		)
		.max(MAX_EXPORT_KEYS)
});

const valueSchemas = {
	string: z.object({ type: z.literal('string'), value: wireSchema }),
	hash: z.object({
		type: z.literal('hash'),
		length: z.number(),
		entries: z.array(z.object({ field: wireSchema, value: wireSchema }))
	}),
	list: z.object({
		type: z.literal('list'),
		length: z.number(),
		start: z.number(),
		entries: z.array(z.object({ index: z.number().int(), value: wireSchema }))
	}),
	set: z.object({ type: z.literal('set'), length: z.number(), members: z.array(wireSchema) }),
	zset: z.object({
		type: z.literal('zset'),
		length: z.number(),
		entries: z.array(z.object({ member: wireSchema, score: z.number().finite() }))
	}),
	stream: z.object({
		type: z.literal('stream'),
		length: z.number(),
		entries: z.array(
			z.object({
				id: z.string(),
				fields: z.array(z.object({ name: wireSchema, value: wireSchema }))
			})
		)
	})
} as const;

const keyLabel = (key: WireValue) =>
	key.kind === 'text' ? key.text : `base64:${key.base64.slice(0, 12)}`;

/**
 * Recreate every key of a dump with the value writers, applying `ttl` when > 0.
 * One broken key never stops the import; its message lands in `errors`.
 */
export async function importDump(
	client: RedisConnection,
	dump: z.infer<typeof importDumpSchema>
): Promise<{ imported: number; errors: string[] }> {
	let imported = 0;
	const errors: string[] = [];
	for (const entry of dump.keys) {
		const label = keyLabel(entry.key);
		try {
			const key = fromWireValue(entry.key);
			const value = valueSchemas[entry.type].parse(entry.value);
			switch (value.type) {
				case 'string':
					await setString(client, key, value.value);
					break;
				case 'hash':
					for (const item of value.entries) await hashSetField(client, key, item.field, item.value);
					break;
				case 'list':
					await listPush(
						client,
						key,
						'tail',
						[...value.entries].sort((a, b) => a.index - b.index).map((item) => item.value)
					);
					break;
				case 'set':
					await setAdd(client, key, value.members);
					break;
				case 'zset':
					for (const item of value.entries)
						await zSetAdd(client, key, { member: item.member, score: item.score });
					break;
				case 'stream':
					for (const item of value.entries) await streamAdd(client, key, item.fields);
					break;
			}
			if (entry.ttl !== undefined && entry.ttl > 0) await expireKey(client, key, entry.ttl);
			imported++;
		} catch (error) {
			errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return { imported, errors };
}
