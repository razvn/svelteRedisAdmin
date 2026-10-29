import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { assertWrite, canWrite } from '#lib/server/auth/access.ts';
import { getSlowlog, slowlogLength, slowlogReset } from '#lib/server/redis/server.ts';
import { serverName } from '#lib/server/config/schema.ts';
import type { Actions, PageServerLoad } from './$types';

const resetSchema = z.object({
	confirm: z.literal('1')
});

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.server) error(404, locals.i18n.t('Server not found'));
	const client = await locals.redis();

	const entries = await getSlowlog(client, 100);
	const length = await slowlogLength(client);
	const nowSeconds = Date.now() / 1000;

	return {
		serverIndex: locals.serverIndex ?? 0,
		serverLabel: serverName(locals.server),
		length,
		canWrite: canWrite(locals.session),
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
		const t = locals.i18n.t;
		if (!locals.server) error(404, t('Server not found'));
		assertWrite(locals);

		const raw = await request.formData();
		const parsed = resetSchema.safeParse({ confirm: raw.get('confirm') });
		if (!parsed.success) {
			return fail(400, { error: t('Missing confirmation.') });
		}

		try {
			const client = await locals.redis();
			await slowlogReset(client);
		} catch {
			return fail(400, { error: t('SLOWLOG RESET failed.') });
		}

		redirect(303, `/server/${locals.serverIndex ?? 0}/slowlog`);
	}
};
