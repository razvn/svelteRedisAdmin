import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { deleteKeys, scanPage, type KeyType } from '#lib/server/redis/keys.ts';
import { flush } from '#lib/server/redis/server.ts';
import { serverName } from '#lib/server/config/schema.ts';
import { intParam, resolveDb } from '#lib/server/routing.ts';
import { KEY_TYPES } from '#lib/redis-format.ts';
import { withParams } from '#lib/redis-format.ts';
import type { Actions, PageServerLoad } from './$types';

const querySchema = z.object({
	cursor: z.coerce.number().int().min(0).catch(0),
	filter: z.string().max(512).catch(''),
	type: z.enum(['', ...KEY_TYPES]).catch('')
});

/** Checkbox values are base64 of the raw key bytes (binary-safe round-trip). */
const selectedKeysSchema = z.array(z.string().min(1).max(6827)).min(1).max(1000);

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.server || locals.serverIndex === null) error(404, 'Server not found');
	const db = resolveDb(params, locals.server);
	const cursorParam = url.searchParams.get('cursor');
	const query = querySchema.parse({
		cursor: intParam(cursorParam),
		filter: url.searchParams.get('filter') ?? locals.server.filter ?? '',
		type: url.searchParams.get('type') ?? ''
	});

	const client = await locals.redis(db);
	const page = await scanPage(client, {
		cursor: query.cursor,
		count: locals.config.maxKeyListSize,
		pattern: query.filter || undefined,
		type: (query.type || undefined) as KeyType | undefined
	});
	const dbsize = Number(await client.dbSize());

	return {
		serverIndex: locals.serverIndex,
		db,
		label: serverName(locals.server),
		cursor: page.cursor,
		// SCAN cannot walk backwards: without an explicit cursor this is page one.
		isFirstPage: cursorParam === null,
		keys: page.keys,
		dbsize,
		filter: query.filter,
		type: query.type,
		separator: locals.server.separator
	};
};

export const actions: Actions = {
	delete: async ({ request, locals, params }) => {
		if (!locals.server || locals.serverIndex === null) error(404, 'Server not found');
		const db = resolveDb(params, locals.server);
		const raw = await request.formData();
		const parsed = selectedKeysSchema.safeParse(raw.getAll('keys').map(String));
		if (!parsed.success) {
			return fail(400, { error: 'Select at least one key to delete' });
		}
		const client = await locals.redis(db);
		await deleteKeys(
			client,
			parsed.data.map((key) => Buffer.from(key, 'base64'))
		);
		redirect(
			303,
			withParams(`/server/${locals.serverIndex}/db/${db}`, {
				filter: String(raw.get('filter') ?? ''),
				type: String(raw.get('type') ?? '')
			})
		);
	},
	flush: async ({ locals, params }) => {
		if (!locals.server || locals.serverIndex === null) error(404, 'Server not found');
		const db = resolveDb(params, locals.server);
		const client = await locals.redis(db);
		await flush(client, 'db');
		redirect(303, `/server/${locals.serverIndex}/db/${db}`);
	}
};
