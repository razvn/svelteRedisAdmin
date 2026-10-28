import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { exportKeys } from '#lib/server/redis/dump.ts';
import { resolveDb } from '#lib/server/routing.ts';
import type { RequestHandler } from './$types';

const formSchema = z.object({ filter: z.string().max(512).catch('') });

/** POST a downloadable JSON dump of the database (optionally filtered). */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.server || locals.serverIndex === null) error(404, 'Server not found');
	const db = resolveDb(params, locals.server);
	const raw = await request.formData();
	const parsed = formSchema.parse({ filter: String(raw.get('filter') ?? '') });

	const client = await locals.redis(db);
	const dump = await exportKeys(client, { db, filter: parsed.filter || undefined });

	return new Response(JSON.stringify(dump, null, '\t'), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="db${db}-export.json"`
		}
	});
};
