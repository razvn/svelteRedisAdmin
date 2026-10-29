import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { formatIfJson } from '#lib/value.ts';
import { deleteKeys, expireKey, keyDetails, renameKey } from '#lib/server/redis/keys.ts';
import {
	readKeyValue,
	setString,
	hashSetField,
	hashDeleteField,
	listSetIndex,
	listPush,
	listDeleteIndex,
	setAdd,
	setRemove,
	zSetAdd,
	zSetRemove,
	streamAdd,
	streamDelete
} from '#lib/server/redis/values.ts';
import { buffers } from '#lib/server/redis/type-mapping.ts';
import { serverName } from '#lib/server/config/schema.ts';
import { intParam, keyNameSchema, resolveDb } from '#lib/server/routing.ts';
import { KEY_TYPES } from '#lib/redis-format.ts';
import { dbHref, keyHref } from '#lib/nav/paths.ts';
import type { Actions, PageServerLoad } from './$types';

const MAX_VALUE = 1_000_000;

/** Everything every action needs: validated params plus an open connection. */
async function keyContext(locals: App.Locals, params: { db: string; key?: string }) {
	const t = locals.i18n.t;
	if (!locals.server || locals.serverIndex === null) error(404, t('Server not found'));
	const db = resolveDb(params, locals.server);
	const key = keyNameSchema.safeParse(params.key);
	if (!key.success) error(404, t('Key not found'));
	const client = await locals.redis(db);
	return {
		serverIndex: locals.serverIndex,
		db,
		key: key.data,
		keyBuf: Buffer.from(key.data, 'utf8'),
		client
	};
}

/** Form fields as a plain string record (files are ignored). */
async function payload(request: Request): Promise<Record<string, string>> {
	const raw = await request.formData();
	const data: Record<string, string> = {};
	for (const [name, value] of raw.entries()) {
		if (typeof value === 'string') data[name] = value;
	}
	return data;
}

function parseOr400<T>(
	parsed: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } },
	t: (msgid: string) => string
): T {
	if (!parsed.success) {
		throw fail(400, { error: t(parsed.error.issues[0]?.message ?? 'Invalid input') });
	}
	return parsed.data;
}

function backToKey(serverIndex: number, db: number, key: string, offset: number): never {
	redirect(
		303,
		offset > 0 ? `${keyHref(serverIndex, db, key)}?offset=${offset}` : keyHref(serverIndex, db, key)
	);
}

const fieldSchema = z.string().min(1, 'Enter a field name').max(5120);
const memberSchema = z.string().min(1, 'Enter a value').max(MAX_VALUE);
const indexSchema = z.coerce.number().int().min(0);
const offsetOf = (data: Record<string, string>) => intParam(data['offset'] ?? null);

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const t = locals.i18n.t;
	if (!locals.server || locals.serverIndex === null) error(404, t('Server not found'));
	const db = resolveDb(params, locals.server);
	const key = keyNameSchema.safeParse(params.key);
	if (!key.success) error(404, t('Key not found'));

	const client = await locals.redis(db);
	const keyBuf = Buffer.from(key.data, 'utf8');
	if (!(await client.exists(keyBuf))) error(404, t('Key not found'));

	const type = String(await client.type(keyBuf));
	if (!KEY_TYPES.includes(type as (typeof KEY_TYPES)[number])) {
		error(400, t('Unsupported key type: {type}', { type }));
	}

	const [details, value] = await Promise.all([
		keyDetails(client, keyBuf),
		readKeyValue(client, keyBuf, type as (typeof KEY_TYPES)[number], {
			offset: intParam(url.searchParams.get('offset')),
			count: 100
		})
	]);

	return {
		serverIndex: locals.serverIndex,
		db,
		label: serverName(locals.server),
		key: key.data,
		type,
		ttl: details.ttl,
		encoding: details.encoding,
		size: details.size,
		offset: intParam(url.searchParams.get('offset')),
		value,
		json:
			value.type === 'string' && value.value.kind === 'text'
				? formatIfJson(value.value.text)
				: null,
		separator: locals.server.separator
	};
};

export const actions: Actions = {
	'save-string': async ({ request, locals, params }) => {
		const ctx = await keyContext(locals, params);
		const t = locals.i18n.t;
		const data = await payload(request);
		const value = parseOr400(z.object({ value: z.string().max(MAX_VALUE) }).safeParse(data), t);
		// SET removes the expiry — read the TTL first and re-apply it.
		const ttl = Number(await buffers(ctx.client).ttl(ctx.keyBuf));
		await setString(ctx.client, ctx.keyBuf, { kind: 'text', text: value.value }, ttl > 0 ? ttl : 0);
		backToKey(ctx.serverIndex, ctx.db, ctx.key, offsetOf(data));
	},

	ttl: async ({ request, locals, params }) => {
		const ctx = await keyContext(locals, params);
		const t = locals.i18n.t;
		const data = await payload(request);
		// Empty input (or 0) persists the key.
		const seconds = parseOr400(
			z
				.object({ seconds: z.coerce.number().int().min(0).max(2_147_483_647).catch(0) })
				.safeParse(data),
			t
		);
		await expireKey(ctx.client, ctx.keyBuf, seconds.seconds);
		backToKey(ctx.serverIndex, ctx.db, ctx.key, offsetOf(data));
	},

	rename: async ({ request, locals, params }) => {
		const ctx = await keyContext(locals, params);
		const t = locals.i18n.t;
		const data = await payload(request);
		const name = parseOr400(z.object({ name: keyNameSchema }).safeParse(data), t);
		const to = Buffer.from(name.name, 'utf8');
		if (await ctx.client.exists(to)) {
			return fail(400, { error: t('A key with this name already exists') });
		}
		try {
			await renameKey(ctx.client, ctx.keyBuf, to);
		} catch {
			return fail(400, { error: t('Could not rename the key') });
		}
		redirect(303, keyHref(ctx.serverIndex, ctx.db, name.name));
	},

	delete: async ({ locals, params }) => {
		const ctx = await keyContext(locals, params);
		await deleteKeys(ctx.client, [ctx.keyBuf]);
		redirect(303, dbHref(ctx.serverIndex, ctx.db));
	},

	hset: async ({ request, locals, params }) => {
		const ctx = await keyContext(locals, params);
		const t = locals.i18n.t;
		const data = await payload(request);
		const parsed = parseOr400(
			z.object({ field: fieldSchema, value: z.string().max(MAX_VALUE) }).safeParse(data),
			t
		);
		await hashSetField(
			ctx.client,
			ctx.keyBuf,
			{ kind: 'text', text: parsed.field },
			{ kind: 'text', text: parsed.value }
		);
		backToKey(ctx.serverIndex, ctx.db, ctx.key, offsetOf(data));
	},

	hdel: async ({ request, locals, params }) => {
		const ctx = await keyContext(locals, params);
		const t = locals.i18n.t;
		const data = await payload(request);
		const parsed = parseOr400(z.object({ field: fieldSchema }).safeParse(data), t);
		await hashDeleteField(ctx.client, ctx.keyBuf, { kind: 'text', text: parsed.field });
		backToKey(ctx.serverIndex, ctx.db, ctx.key, offsetOf(data));
	},

	lset: async ({ request, locals, params }) => {
		const ctx = await keyContext(locals, params);
		const t = locals.i18n.t;
		const data = await payload(request);
		const parsed = parseOr400(
			z.object({ index: indexSchema, value: z.string().max(MAX_VALUE) }).safeParse(data),
			t
		);
		await listSetIndex(ctx.client, ctx.keyBuf, parsed.index, { kind: 'text', text: parsed.value });
		backToKey(ctx.serverIndex, ctx.db, ctx.key, offsetOf(data));
	},

	ldel: async ({ request, locals, params }) => {
		const ctx = await keyContext(locals, params);
		const t = locals.i18n.t;
		const data = await payload(request);
		const parsed = parseOr400(z.object({ index: indexSchema }).safeParse(data), t);
		await listDeleteIndex(ctx.client, ctx.keyBuf, parsed.index);
		backToKey(ctx.serverIndex, ctx.db, ctx.key, offsetOf(data));
	},

	lpush: async ({ request, locals, params }) => {
		const ctx = await keyContext(locals, params);
		const t = locals.i18n.t;
		const data = await payload(request);
		const parsed = parseOr400(z.object({ value: memberSchema }).safeParse(data), t);
		await listPush(ctx.client, ctx.keyBuf, 'tail', [{ kind: 'text', text: parsed.value }]);
		backToKey(ctx.serverIndex, ctx.db, ctx.key, offsetOf(data));
	},

	sadd: async ({ request, locals, params }) => {
		const ctx = await keyContext(locals, params);
		const t = locals.i18n.t;
		const data = await payload(request);
		const parsed = parseOr400(z.object({ member: memberSchema }).safeParse(data), t);
		await setAdd(ctx.client, ctx.keyBuf, [{ kind: 'text', text: parsed.member }]);
		backToKey(ctx.serverIndex, ctx.db, ctx.key, offsetOf(data));
	},

	srem: async ({ request, locals, params }) => {
		const ctx = await keyContext(locals, params);
		const t = locals.i18n.t;
		const data = await payload(request);
		const parsed = parseOr400(z.object({ member: memberSchema }).safeParse(data), t);
		await setRemove(ctx.client, ctx.keyBuf, [{ kind: 'text', text: parsed.member }]);
		backToKey(ctx.serverIndex, ctx.db, ctx.key, offsetOf(data));
	},

	zadd: async ({ request, locals, params }) => {
		const ctx = await keyContext(locals, params);
		const t = locals.i18n.t;
		const data = await payload(request);
		const parsed = parseOr400(
			z.object({ member: memberSchema, score: z.coerce.number().finite() }).safeParse(data),
			t
		);
		await zSetAdd(ctx.client, ctx.keyBuf, {
			member: { kind: 'text', text: parsed.member },
			score: parsed.score
		});
		backToKey(ctx.serverIndex, ctx.db, ctx.key, offsetOf(data));
	},

	zrem: async ({ request, locals, params }) => {
		const ctx = await keyContext(locals, params);
		const t = locals.i18n.t;
		const data = await payload(request);
		const parsed = parseOr400(z.object({ member: memberSchema }).safeParse(data), t);
		await zSetRemove(ctx.client, ctx.keyBuf, [{ kind: 'text', text: parsed.member }]);
		backToKey(ctx.serverIndex, ctx.db, ctx.key, offsetOf(data));
	},

	xadd: async ({ request, locals, params }) => {
		const ctx = await keyContext(locals, params);
		const t = locals.i18n.t;
		const data = await payload(request);
		const parsed = parseOr400(
			z.object({ name: fieldSchema, value: z.string().max(MAX_VALUE) }).safeParse(data),
			t
		);
		await streamAdd(ctx.client, ctx.keyBuf, [
			{ name: { kind: 'text', text: parsed.name }, value: { kind: 'text', text: parsed.value } }
		]);
		backToKey(ctx.serverIndex, ctx.db, ctx.key, offsetOf(data));
	},

	xdel: async ({ request, locals, params }) => {
		const ctx = await keyContext(locals, params);
		const t = locals.i18n.t;
		const data = await payload(request);
		const parsed = parseOr400(z.object({ id: z.string().min(1) }).safeParse(data), t);
		await streamDelete(ctx.client, ctx.keyBuf, [parsed.id]);
		backToKey(ctx.serverIndex, ctx.db, ctx.key, offsetOf(data));
	}
};
