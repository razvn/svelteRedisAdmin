import { error } from '@sveltejs/kit';
import { z } from 'zod';
import type { ServerConfig } from '#lib/server/config/schema.ts';

/** Validate the `[db]` route param against the server's database count. */
export function resolveDb(params: { db: string }, server: ServerConfig): number {
	const db = Number(params.db);
	if (!Number.isInteger(db) || db < 0 || db >= server.databases) error(404, 'Database not found');
	return db;
}

/** Validate the raw (URL-decoded) key name from `key/[...key]`. */
export const keyNameSchema = z
	.string()
	.min(1, 'Enter a key name')
	.max(5120, 'Key names are limited to 5120 characters');

/**
 * Validate an integer cursor/offset query param, falling back to `fallback` on
 * garbage (bad links must not 500 the page).
 */
export function intParam(value: string | null, fallback = 0): number {
	if (value === null || value === '') return fallback;
	const parsed = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).safeParse(value);
	return parsed.success ? parsed.data : fallback;
}
