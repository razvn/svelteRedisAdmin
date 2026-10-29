import { error, fail } from '@sveltejs/kit';
import { assertWrite, canWrite } from '#lib/server/auth/access.ts';
import { serverName } from '#lib/server/config/schema.ts';
import { resolveDb } from '#lib/server/routing.ts';
import { importDump, importDumpSchema } from '#lib/server/redis/dump.ts';
import type { Actions, PageServerLoad } from './$types';

const MAX_UPLOAD = 64 * 1024 * 1024;
const MAX_SHOWN_ERRORS = 50;

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.server || locals.serverIndex === null) error(404, locals.i18n.t('Server not found'));
	const db = resolveDb(params, locals.server);
	return {
		serverIndex: locals.serverIndex,
		db,
		label: serverName(locals.server),
		canWrite: canWrite(locals.session)
	};
};

export const actions: Actions = {
	import: async ({ request, locals, params }) => {
		const t = locals.i18n.t;
		if (!locals.server || locals.serverIndex === null) error(404, t('Server not found'));
		assertWrite(locals);
		const db = resolveDb(params, locals.server);

		const raw = await request.formData();
		const file = raw.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: t('Choose a JSON dump to import') });
		}
		if (file.size > MAX_UPLOAD) {
			return fail(400, { error: t('The file is too large (max 64 MB)') });
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(await file.text());
		} catch {
			return fail(400, { error: t('The file is not valid JSON') });
		}
		const dump = importDumpSchema.safeParse(parsed);
		if (!dump.success) {
			return fail(400, {
				error: t('Unexpected dump shape: {message}', {
					message: dump.error.issues[0]?.message ?? 'invalid'
				})
			});
		}

		const client = await locals.redis(db);
		const result = await importDump(client, dump.data);
		return {
			total: dump.data.keys.length,
			imported: result.imported,
			errors: result.errors.slice(0, MAX_SHOWN_ERRORS)
		};
	}
};
