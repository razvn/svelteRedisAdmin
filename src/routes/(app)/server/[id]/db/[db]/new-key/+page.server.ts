import { error, fail, redirect } from '@sveltejs/kit';
import { createKey, createKeySchema } from '#lib/server/redis/create-key.ts';
import { serverName } from '#lib/server/config/schema.ts';
import { resolveDb } from '#lib/server/routing.ts';
import { keyHref } from '#lib/nav/paths.ts';
import type { Actions, PageServerLoad } from './$types';

export interface NewKeyForm {
	error: string;
	key: string;
	type: string;
	value: string;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.server || locals.serverIndex === null) error(404, locals.i18n.t('Server not found'));
	const db = resolveDb(params, locals.server);
	return {
		serverIndex: locals.serverIndex,
		db,
		label: serverName(locals.server)
	};
};

export const actions: Actions = {
	create: async ({ request, locals, params }) => {
		const t = locals.i18n.t;
		if (!locals.server || locals.serverIndex === null) error(404, t('Server not found'));
		const db = resolveDb(params, locals.server);
		const raw = await request.formData();
		const form: NewKeyForm = {
			error: '',
			key: String(raw.get('key') ?? ''),
			type: String(raw.get('type') ?? ''),
			value: String(raw.get('value') ?? '')
		};
		const parsed = createKeySchema.safeParse({
			key: form.key,
			type: form.type,
			value: form.value,
			ttl: String(raw.get('ttl') ?? '').trim() || undefined
		});
		if (!parsed.success) {
			return fail(400, { ...form, error: t(parsed.error.issues[0]?.message ?? 'Invalid input') });
		}

		const client = await locals.redis(db);
		const keyBuf = Buffer.from(parsed.data.key, 'utf8');
		if (await client.exists(keyBuf)) {
			return fail(400, { ...form, error: t('A key with this name already exists') });
		}
		const problem = await createKey(
			client,
			keyBuf,
			parsed.data.type,
			parsed.data.value,
			parsed.data.ttl
		);
		if (problem) return fail(400, { ...form, error: t(problem) });

		redirect(303, keyHref(locals.serverIndex, db, parsed.data.key));
	}
};
