import { z } from 'zod';
import { KEY_TYPES, parseZSetLine, splitLines, type EditableKeyType } from '#lib/redis-format.ts';
import type { WireValue } from '#lib/value.ts';
import { setString, hashSetField, listPush, setAdd, zSetAdd, streamAdd } from './values.ts';
import { expireKey } from './keys.ts';
import type { RedisConnection } from './connection.ts';

/** Payload of the new-key form (`?/create`). */
export const createKeySchema = z.object({
	key: z.string().min(1, 'Enter a key name').max(5120, 'Key names are limited to 5120 characters'),
	type: z.enum(KEY_TYPES),
	value: z.string().max(1_000_000, 'Value is too large').default(''),
	ttl: z.coerce
		.number()
		.int()
		.min(0, 'TTL must not be negative')
		.max(2_147_483_647, 'TTL is too large')
		.optional()
});

const wire = (text: string): WireValue => ({ kind: 'text', text });

/**
 * Parse a JSON `{field: value}` map with primitive values only; null when the
 * payload is not such a map (the caller falls back to a single field).
 */
function jsonMap(value: string): Record<string, string> | null {
	const trimmed = value.trim();
	if (!trimmed.startsWith('{')) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return null;
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
	const map: Record<string, string> = {};
	for (const [field, entry] of Object.entries(parsed)) {
		if (typeof entry !== 'string' && typeof entry !== 'number' && typeof entry !== 'boolean') {
			return null;
		}
		map[field] = String(entry);
	}
	return map;
}

/**
 * Create a key of `type` from the new-key form's text payload: string as-is,
 * hash/stream as a JSON `{field: value}` map (falling back to a single field),
 * list/set one member per line, zset one `score member` per line. Applies `ttl`
 * when > 0. Returns an error message for unusable payloads, null on success.
 */
export async function createKey(
	client: RedisConnection,
	key: Buffer,
	type: EditableKeyType,
	value: string,
	ttl?: number
): Promise<string | null> {
	const payloadError = validatePayload(type, value);
	if (payloadError) return payloadError;

	switch (type) {
		case 'string':
			await setString(client, key, wire(value), ttl);
			break;
		case 'hash': {
			const map = jsonMap(value);
			if (map === null) {
				await hashSetField(client, key, wire('value'), wire(value));
			} else {
				for (const [field, entry] of Object.entries(map)) {
					await hashSetField(client, key, wire(field), wire(entry));
				}
			}
			break;
		}
		case 'list':
			await listPush(client, key, 'tail', splitLines(value).map(wire));
			break;
		case 'set':
			await setAdd(client, key, splitLines(value).map(wire));
			break;
		case 'zset': {
			for (const line of splitLines(value)) {
				const parsed = parseZSetLine(line);
				if (parsed)
					await zSetAdd(client, key, { member: wire(parsed.member), score: parsed.score });
			}
			break;
		}
		case 'stream': {
			const map = jsonMap(value);
			const fields = map
				? Object.entries(map).map(([name, entry]) => ({ name: wire(name), value: wire(entry) }))
				: [{ name: wire('value'), value: wire(value) }];
			await streamAdd(client, key, fields);
			break;
		}
	}
	if (ttl !== undefined && ttl > 0) await expireKey(client, key, ttl);
	return null;
}

/** Guard so a bulk payload that parses to zero entries does not create nothing. */
function validatePayload(type: EditableKeyType, value: string): string | null {
	if (type === 'string' || type === 'hash' || type === 'stream') return null;
	if (type === 'zset') {
		return splitLines(value).some((line) => parseZSetLine(line) === null)
			? 'Sorted-set lines must be "score member", e.g. "1.5 player:42"'
			: null;
	}
	if (splitLines(value).length === 0) {
		return type === 'list' ? 'Enter one list element per line' : 'Enter one set member per line';
	}
	return null;
}
