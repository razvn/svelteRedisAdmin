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

const PROXY = '10.42.0.7';

const authenticate = async (
	headers: Record<string, string>,
	auth: Record<string, unknown>,
	peerAddress: string | null = PROXY
) =>
	headerPlugin.authenticate({
		request: new Request('http://localhost/', { headers }),
		cookies,
		config: config({ trustedProxies: ['10.42.0.0/16'], ...auth }),
		peerAddress
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

	test('ignores the identity headers unless the TCP peer is a trusted proxy', async () => {
		const auth = { plugin: 'header', header: 'x-user' };
		expect(await authenticate({ 'x-user': 'mallory' }, auth, '192.168.1.5')).toBeNull();
		expect(await authenticate({ 'x-user': 'mallory' }, auth, null)).toBeNull();
		// IPv4 peers on a dual-stack socket arrive IPv4-mapped.
		expect(await authenticate({ 'x-user': 'alice' }, auth, '::ffff:10.42.3.4')).toEqual({
			username: 'alice',
			role: 'admin'
		});
	});

	test('accepts single addresses and IPv6 ranges', async () => {
		const auth = { plugin: 'header', header: 'x-user', trustedProxies: ['127.0.0.1', 'fd00::/8'] };
		expect(await authenticate({ 'x-user': 'a' }, auth, '127.0.0.1')).not.toBeNull();
		expect(await authenticate({ 'x-user': 'a' }, auth, 'fd12::1')).not.toBeNull();
		expect(await authenticate({ 'x-user': 'a' }, auth, '127.0.0.2')).toBeNull();
		expect(await authenticate({ 'x-user': 'a' }, auth, 'fe80::1')).toBeNull();
	});

	test('refuses a user header sent twice (joined with a comma)', async () => {
		const auth = { plugin: 'header', header: 'x-user' };
		expect(await authenticate({ 'x-user': 'alice, mallory' }, auth)).toBeNull();
	});

	test('reads the groups header for Kubernetes RBAC', async () => {
		const facts = await authenticate(
			{ 'x-user': 'alice', 'x-groups': 'team-a, ops ,' },
			{ plugin: 'header', header: 'x-user', headerGroups: 'x-groups' }
		);
		expect(facts).toEqual({ username: 'alice', role: 'admin', groups: ['team-a', 'ops'] });
	});

	test('getAuthPlugin refuses the header plugin without a header or trusted proxies', () => {
		expect(() => getAuthPlugin(config({ plugin: 'header', trustedProxies: ['10.0.0.1'] }))).toThrow(
			ConfigError
		);
		expect(() => getAuthPlugin(config({ plugin: 'header', header: 'x-user' }))).toThrow(
			/trustedProxies/
		);
		expect(() => getAuthPlugin(config({ plugin: 'nope' }))).toThrow(ConfigError);
		expect(
			getAuthPlugin(config({ plugin: 'header', header: 'x-user', trustedProxies: ['10.0.0.1'] }))
				.name
		).toBe('header');
		expect(getAuthPlugin(config({})).name).toBe('config');
	});
});
