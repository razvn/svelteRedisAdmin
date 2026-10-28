import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { getConfig, setConfig } from '#lib/server/redis/server.ts';
import { serverName } from '#lib/server/config/schema.ts';
import type { Actions, PageServerLoad } from './$types';

const setSchema = z.object({
	parameter: z.string().regex(/^[a-zA-Z0-9._-]+$/, 'Invalid parameter name'),
	value: z.string()
});

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.server) error(404, 'Server not found');
	const client = await locals.redis();

	const config = await getConfig(client);
	const entries = Object.entries(config).sort(([a], [b]) => a.localeCompare(b));

	return {
		serverIndex: locals.serverIndex ?? 0,
		serverLabel: serverName(locals.server),
		entries,
		q: url.searchParams.get('q') ?? '',
		edit: url.searchParams.get('edit'),
		saved: url.searchParams.get('saved')
	};
};

export const actions: Actions = {
	set: async ({ request, locals }) => {
		if (!locals.server) error(404, 'Server not found');

		const raw = await request.formData();
		const parsed = setSchema.safeParse({
			parameter: raw.get('parameter'),
			value: raw.get('value')
		});
		if (!parsed.success) {
			return fail(400, { error: 'Invalid parameter name or value.' });
		}

		try {
			const client = await locals.redis();
			await setConfig(client, parsed.data.parameter, parsed.data.value);
		} catch (caught) {
			return fail(400, {
				error: caught instanceof Error ? caught.message : 'CONFIG SET failed.'
			});
		}

		redirect(
			303,
			`/server/${locals.serverIndex ?? 0}/config?saved=${encodeURIComponent(parsed.data.parameter)}`
		);
	}
};
