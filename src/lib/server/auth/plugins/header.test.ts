import { describe, expect, test } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { ConfigError, parseConfig } from '#lib/server/config/loader.ts';
import { getAuthPlugin } from './index.ts';
import { headerPlugin } from './header.ts';

const SECRET = 'test-secret-at-least-16-chars';

const config = (auth: Record<string, unknown>) =>
	parseConfig({
		Servers: [{}, {}, {}],
		login: [{ username: 'admin', password: 'pw' }],
		cookieSecret: SECRET,
		auth
	});

const cookies: Cookies = { get: () => undefined } as unknown as Cookies;

const authenticate = async (headers: Record<string, string>, auth: Record<string, unknown>) =>
	headerPlugin.authenticate({
		request: new Request('http://localhost/', { headers }),
		cookies,
		config: config(auth)
	});

describe('header plugin', () => {
	test('reads the username from the configured header, role defaults to admin', async () => {
		const facts = await authenticate(
			{ 'x-forwarded-user': 'alice' },
			{
				plugin: 'header',
				header: 'x-forwarded-user'
			}
		);
		expect(facts).toEqual({ username: 'alice', role: 'admin' });
	});

	test('reads role and server list from optional headers', async () => {
		const facts = await authenticate(
			{ 'x-user': 'bob', 'x-role': 'ro', 'x-servers': '0, 2' },
			{ plugin: 'header', header: 'x-user', headerRole: 'x-role', headerServers: 'x-servers' }
		);
		expect(facts).toEqual({ username: 'bob', role: 'ro', servers: [0, 2] });
	});

	test('an unknown role falls back to admin; missing servers header means all', async () => {
		const facts = await authenticate(
			{ 'x-user': 'bob', 'x-role': 'superuser' },
			{ plugin: 'header', header: 'x-user', headerRole: 'x-role', headerServers: 'x-servers' }
		);
		expect(facts).toEqual({ username: 'bob', role: 'admin' });
	});

	test('returns null when the identity header is absent', async () => {
		const facts = await authenticate({}, { plugin: 'header', header: 'x-forwarded-user' });
		expect(facts).toBeNull();
	});

	test('getAuthPlugin refuses the header plugin without a configured header', () => {
		expect(() => getAuthPlugin(config({ plugin: 'header' }))).toThrow(ConfigError);
		expect(() => getAuthPlugin(config({ plugin: 'nope' }))).toThrow(ConfigError);
		expect(getAuthPlugin(config({ plugin: 'header', header: 'x-user' })).name).toBe('header');
		expect(getAuthPlugin(config({})).name).toBe('config');
	});
});
