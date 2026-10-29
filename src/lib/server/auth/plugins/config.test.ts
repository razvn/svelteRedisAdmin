import { describe, expect, test } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { parseConfig } from '#lib/server/config/loader.ts';
import { configPlugin, secretEquals, verifyLogin } from './config.ts';
import { createSessionToken } from '#lib/server/auth/session.ts';
import type { PluginSession } from './types.ts';

const SECRET = 'test-secret-at-least-16-chars';

const config = () =>
	parseConfig({
		Servers: [{}, {}, {}],
		login: [
			{ username: 'admin', password: 'admin-pw' },
			{ username: 'dev', password: 'dev-pw', role: 'rw', servers: [0, 2] },
			{ username: 'viewer', password: 'viewer-pw', role: 'ro' }
		],
		cookieSecret: SECRET
	});

const cookiesWith = (token?: string): Cookies => ({ get: () => token }) as unknown as Cookies;

const ctx = (token?: string) => {
	const cfg = config();
	return {
		config: cfg,
		cookies: cookiesWith(token),
		request: new Request('http://localhost/')
	};
};

describe('secretEquals / verifyLogin', () => {
	test('compares passwords without leaking timing', () => {
		expect(secretEquals('abc', 'abc')).toBe(true);
		expect(secretEquals('abc', 'abd')).toBe(false);
	});

	test('verifies a username/password pair', () => {
		expect(verifyLogin(config(), 'dev', 'dev-pw')?.role).toBe('rw');
		expect(verifyLogin(config(), 'dev', 'wrong')).toBeNull();
		expect(verifyLogin(config(), 'ghost', 'dev-pw')).toBeNull();
	});
});

describe('config plugin', () => {
	test('returns null without a cookie', async () => {
		expect(await configPlugin.authenticate(ctx(undefined))).toBeNull();
	});

	test('reads role and servers from the signed cookie', async () => {
		const token = createSessionToken(
			{ username: 'dev', role: 'rw', servers: [0, 2], expires: Math.floor(Date.now() / 1000) + 60 },
			SECRET
		);
		const facts: PluginSession | null = await configPlugin.authenticate(ctx(token));
		expect(facts).toEqual({ username: 'dev', role: 'rw', servers: [0, 2] });
	});

	test('rejects a tampered cookie', async () => {
		const token = createSessionToken(
			{ username: 'dev', role: 'rw', servers: null, expires: Math.floor(Date.now() / 1000) + 60 },
			'another-secret-16-chars!'
		);
		expect(await configPlugin.authenticate(ctx(token))).toBeNull();
	});
});
