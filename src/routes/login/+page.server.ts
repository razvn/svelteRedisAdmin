import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { createSessionToken } from '#lib/server/auth/session.ts';
import type { Actions, PageServerLoad } from './$types';

const loginSchema = z.object({
	username: z.string().trim().min(1, 'Enter the username'),
	password: z.string().min(1, 'Enter the password')
});

export const load: PageServerLoad = async () => {
	return { username: '', error: null };
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		const raw = await request.formData();
		const parsed = loginSchema.safeParse({
			username: raw.get('username'),
			password: raw.get('password')
		});
		if (!parsed.success) {
			return fail(400, {
				username: String(raw.get('username') ?? ''),
				error: parsed.error.issues[0]?.message ?? 'Invalid input'
			});
		}

		const match = locals.config.login?.find(
			(entry) => entry.username === parsed.data.username && entry.password === parsed.data.password
		);
		if (!match) {
			return fail(401, { username: parsed.data.username, error: 'Wrong username or password.' });
		}

		const expires = Math.floor(Date.now() / 1000) + locals.config.cookieLifetime;
		cookies.set(
			locals.config.cookieName,
			createSessionToken({ username: match.username, expires }, locals.config.cookieSecret ?? ''),
			{
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: locals.config.cookieLifetime
			}
		);
		redirect(303, '/');
	}
};
