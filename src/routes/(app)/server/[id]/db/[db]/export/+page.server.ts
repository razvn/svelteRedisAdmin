import { error } from '@sveltejs/kit';
import { serverName } from '#lib/server/config/schema.ts';
import { resolveDb } from '#lib/server/routing.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.server || locals.serverIndex === null) error(404, 'Server not found');
	const db = resolveDb(params, locals.server);
	return {
		serverIndex: locals.serverIndex,
		db,
		label: serverName(locals.server)
	};
};
