import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { killClient, listClients } from '#lib/server/redis/server.ts';
import { serverName } from '#lib/server/config/schema.ts';
import type { Actions, PageServerLoad } from './$types';

const killSchema = z.object({
	id: z.string().regex(/^\d+$/, 'Invalid client id')
});

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.server) error(404, locals.i18n.t('Server not found'));
	const client = await locals.redis();

	const clients = await listClients(client);
	const rows = [...clients].sort((a, b) => Number(a['id'] ?? 0) - Number(b['id'] ?? 0));

	return {
		serverIndex: locals.serverIndex ?? 0,
		serverLabel: serverName(locals.server),
		clients: rows
	};
};

export const actions: Actions = {
	kill: async ({ request, locals }) => {
		const t = locals.i18n.t;
		if (!locals.server) error(404, t('Server not found'));

		const raw = await request.formData();
		const parsed = killSchema.safeParse({ id: raw.get('id') });
		if (!parsed.success) {
			return fail(400, { error: t('Invalid client id.') });
		}

		try {
			const client = await locals.redis();
			await killClient(client, parsed.data.id);
		} catch {
			return fail(400, { error: t('CLIENT KILL failed for id {id}.', { id: parsed.data.id }) });
		}

		redirect(303, `/server/${locals.serverIndex ?? 0}/clients`);
	}
};
