import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { getSlowlog, slowlogLength, slowlogReset } from '#lib/server/redis/server.ts';
import { serverName } from '#lib/server/config/schema.ts';
import type { Actions, PageServerLoad } from './$types';

const resetSchema = z.object({
	confirm: z.literal('1')
});

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.server) error(404, 'Server not found');
	const client = await locals.redis();

	const entries = await getSlowlog(client, 100);
	const length = await slowlogLength(client);
	const nowSeconds = Date.now() / 1000;

	return {
		serverIndex: locals.serverIndex ?? 0,
		serverLabel: serverName(locals.server),
		length,
		entries: entries.map((entry) => ({
			id: entry.id,
			/** Preformatted on the server to avoid locale mismatches after hydration. */
			timestamp: new Date(entry.timestamp * 1000).toLocaleString('en-US'),
			ageSeconds: Math.max(0, Math.floor(nowSeconds - entry.timestamp)),
			durationMicros: entry.durationMicros,
			command: entry.command.join(' '),
			clientAddress: entry.clientAddress,
			clientName: entry.clientName
		}))
	};
};

export const actions: Actions = {
	reset: async ({ request, locals }) => {
		if (!locals.server) error(404, 'Server not found');

		const raw = await request.formData();
		const parsed = resetSchema.safeParse({ confirm: raw.get('confirm') });
		if (!parsed.success) {
			return fail(400, { error: 'Missing confirmation.' });
		}

		try {
			const client = await locals.redis();
			await slowlogReset(client);
		} catch {
			return fail(400, { error: 'SLOWLOG RESET failed.' });
		}

		redirect(303, `/server/${locals.serverIndex ?? 0}/slowlog`);
	}
};
