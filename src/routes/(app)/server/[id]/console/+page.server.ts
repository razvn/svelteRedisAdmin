import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { formatTokens, runCommands, type ConsoleResult } from '#lib/server/redis/console.ts';
import { getServerInfo, infoValue } from '#lib/server/redis/server.ts';
import { serverName } from '#lib/server/config/schema.ts';
import type { Actions, PageServerLoad } from './$types';

const runSchema = z.object({
	input: z.string().max(65_536)
});

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.server) error(404, locals.i18n.t('Server not found'));
	const serverIndex = locals.serverIndex ?? 0;
	const serverLabel = serverName(locals.server);
	const db = locals.server.db;

	let redisVersion: string | null;
	try {
		const info = await getServerInfo(await locals.redis());
		redisVersion = infoValue(info, 'redis_version') ?? null;
	} catch {
		redisVersion = null;
	}

	return { serverIndex, serverLabel, db, redisVersion };
};

export interface ConsoleResultView extends ConsoleResult {
	/** Tokens re-joined for display (formatTokens runs server-side, it is server-only). */
	commandText: string;
}

export const actions: Actions = {
	run: async ({ request, locals }) => {
		const t = locals.i18n.t;
		if (!locals.server) error(404, t('Server not found'));

		const raw = await request.formData();
		const parsed = runSchema.safeParse({ input: raw.get('input') });
		if (!parsed.success) {
			return {
				error: t('Command input is invalid (max 65,536 characters).'),
				results: [],
				input: ''
			};
		}
		const input = parsed.data.input;

		try {
			const client = await locals.redis();
			const results = await runCommands(client, input);
			const views: ConsoleResultView[] = results.map((result) => ({
				...result,
				commandText: formatTokens(result.command)
			}));
			return { results: views, input };
		} catch (caught) {
			return {
				error: caught instanceof Error ? caught.message : String(caught),
				results: [] as ConsoleResultView[],
				input
			};
		}
	}
};
