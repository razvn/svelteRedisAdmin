import { describe, expect, test } from 'vitest';
import { parseConfig } from '#lib/server/config/loader.ts';
import { httpPlugin, loginFromBasicAuth } from './http.ts';

const config = () =>
	parseConfig({
		Servers: [{}],
		login: [
			{ username: 'admin', password: 'admin-pw' },
			{ username: 'dev', password: 'dev-pw', role: 'rw', servers: [0] }
		],
		cookieSecret: 'test-secret-at-least-16-chars'
	});

const basic = (username: string, password: string) =>
	`Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;

describe('loginFromBasicAuth', () => {
	test('parses a base64 Authorization header against the login list', () => {
		expect(loginFromBasicAuth(config(), basic('dev', 'dev-pw'))).toEqual({
			username: 'dev',
			role: 'rw',
			servers: [0]
		});
	});

	test('defaults the role to admin', () => {
		expect(loginFromBasicAuth(config(), basic('admin', 'admin-pw'))).toEqual({
			username: 'admin',
			role: 'admin',
			servers: null
		});
	});

	test('returns null when absent, malformed or wrong', () => {
		expect(loginFromBasicAuth(config(), null)).toBeNull();
		expect(loginFromBasicAuth(config(), 'Bearer abc')).toBeNull();
		expect(loginFromBasicAuth(config(), 'Basic !!!!')).toBeNull();
		expect(
			loginFromBasicAuth(config(), `Basic ${Buffer.from('nocolon', 'utf8').toString('base64')}`)
		).toBeNull();
		expect(loginFromBasicAuth(config(), basic('dev', 'wrong'))).toBeNull();
		expect(loginFromBasicAuth(config(), basic('ghost', 'dev-pw'))).toBeNull();
	});

	test('supports colons inside the password', () => {
		const cfg = parseConfig({
			Servers: [{}],
			login: [{ username: 'a', password: 'p:w' }],
			cookieSecret: 'test-secret-at-least-16-chars'
		});
		expect(loginFromBasicAuth(cfg, basic('a', 'p:w'))?.username).toBe('a');
	});
});

describe('http plugin', () => {
	test('authenticates from the request header', async () => {
		const request = new Request('http://localhost/', {
			headers: { authorization: basic('dev', 'dev-pw') }
		});
		const facts = await httpPlugin.authenticate({
			request,
			cookies: {} as never,
			config: config(),
			peerAddress: null
		});
		expect(facts?.username).toBe('dev');
	});

	test('yields null without credentials', async () => {
		const facts = await httpPlugin.authenticate({
			request: new Request('http://localhost/'),
			cookies: {} as never,
			config: config(),
			peerAddress: null
		});
		expect(facts).toBeNull();
	});
});

describe('denials', () => {
	test('reports the claimed user of wrong credentials, not of missing or malformed ones', async () => {
		const denied: [string, string][] = [];
		const deny = (reason: string, user: string) => void denied.push([reason, user]);
		const ask = (authorization: string | null) =>
			httpPlugin.authenticate({
				request: new Request('http://app/', {
					headers: authorization ? { authorization } : {}
				}),
				cookies: {} as never,
				config: config(),
				peerAddress: null,
				deny
			});
		expect(await ask(basic('dev', 'nope'))).toBeNull();
		expect(await ask(null)).toBeNull();
		expect(await ask('Bearer abc')).toBeNull();
		expect(await ask(basic('dev', 'dev-pw'))).not.toBeNull();
		expect(denied).toEqual([['access-denied', 'dev']]);
	});
});
