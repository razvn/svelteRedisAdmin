import { describe, expect, test } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, loadConfig, parseConfig } from './loader.ts';

describe('parseConfig', () => {
	test('fills defaults for a minimal servers list', () => {
		const config = parseConfig({ Servers: [{}] });
		expect(config.Servers).toHaveLength(1);
		const server = config.Servers[0];
		expect(server).toMatchObject({
			host: '127.0.0.1',
			port: 6379,
			db: 0,
			databases: 16,
			separator: ':',
			tls: false
		});
		expect(server.name).toBeUndefined();
	});

	test('keeps phpRedisAdmin-style keys', () => {
		const config = parseConfig({
			Servers: [
				{
					name: 'Local',
					host: 'r.example.test',
					port: 6380,
					auth: 'secret',
					db: 2,
					filter: 'app:*',
					databases: 4
				}
			]
		});
		expect(config.Servers[0]).toMatchObject({
			name: 'Local',
			host: 'r.example.test',
			port: 6380,
			auth: 'secret',
			db: 2,
			filter: 'app:*',
			databases: 4
		});
	});

	test('accepts a login list with a cookie secret', () => {
		const config = parseConfig({
			Servers: [{ name: 'x' }],
			login: [{ username: 'admin', password: 'admin' }],
			cookieSecret: '0123456789abcdef'
		});
		expect(config.login).toEqual([{ username: 'admin', password: 'admin', role: 'admin' }]);
		expect(config.auth).toMatchObject({ plugin: 'config' });
	});

	test('parses roles, per-user server lists and the auth plugin', () => {
		const config = parseConfig({
			Servers: [{ name: 'x' }],
			login: [{ username: 'dev', password: 'pw', role: 'rw', servers: [0, 2] }],
			cookieSecret: '0123456789abcdef',
			auth: { plugin: 'header', header: 'x-forwarded-user', trustedProxies: ['10.0.0.0/8'] }
		});
		expect(config.login?.[0]).toEqual({
			username: 'dev',
			password: 'pw',
			role: 'rw',
			servers: [0, 2]
		});
		expect(config.auth).toEqual({
			plugin: 'header',
			header: 'x-forwarded-user',
			trustedProxies: ['10.0.0.0/8']
		});
	});

	test('validates trusted proxies as IPs or CIDR ranges', () => {
		const auth = (trustedProxies: string[]) => ({
			Servers: [{}],
			auth: { plugin: 'header', header: 'x-user', trustedProxies }
		});
		expect(
			parseConfig(auth(['10.42.0.0/16', '127.0.0.1', 'fd00::/8'])).auth.trustedProxies
		).toEqual(['10.42.0.0/16', '127.0.0.1', 'fd00::/8']);
		for (const bad of ['10.0.0.0/33', 'proxy.local', '10.0.0.1/8/1', 'fd00::/129']) {
			expect(() => parseConfig(auth([bad]))).toThrow(/trustedProxies/);
		}
	});

	test('needs a server unless ServerDiscovery can find them', () => {
		expect(() => parseConfig({})).toThrow(/at least one server/);
		const config = parseConfig({
			auth: { plugin: 'header', header: 'x-user', trustedProxies: ['127.0.0.1'] },
			ServerDiscovery: {
				type: 'kubernetes',
				namespaceSelector: 'env=review',
				serviceSelector: 'app.kubernetes.io/name=redis',
				secret: { name: 'redis-auth', passwordKey: 'redis-password' }
			}
		});
		expect(config.Servers).toEqual([]);
		expect(config.ServerDiscovery).toMatchObject({
			port: 'redis',
			host: '{service}.{namespace}.svc',
			name: '{namespace}',
			refreshSeconds: 30,
			authorize: { type: 'kubernetes-sar', resource: { resource: 'pods', verb: 'get' } },
			server: { db: 0, databases: 16, separator: ':', tls: false }
		});
	});

	test('rejects unknown discovery placeholders and server keys discovery fills in', () => {
		const discovery = (extra: Record<string, unknown>) => ({
			auth: { plugin: 'header', header: 'x-user', trustedProxies: ['127.0.0.1'] },
			ServerDiscovery: {
				type: 'kubernetes',
				namespaceSelector: 'env=review',
				serviceSelector: 'app=redis',
				...extra
			}
		});
		expect(() => parseConfig(discovery({ name: '{namespace} {pod}' }))).toThrow(/placeholders/);
		expect(() => parseConfig(discovery({ server: { host: 'x' } }))).toThrow(ConfigError);
	});

	test('Kubernetes RBAC and discovery need the header plugin', () => {
		expect(() =>
			parseConfig({ Servers: [{ authorize: { type: 'kubernetes-sar', namespace: 'review-1' } }] })
		).toThrow(/Servers.0.authorize needs auth.plugin "header"/);
		expect(() =>
			parseConfig({
				ServerDiscovery: { type: 'kubernetes', namespaceSelector: 'a=b', serviceSelector: 'c=d' }
			})
		).toThrow(/ServerDiscovery needs auth.plugin "header"/);
		expect(() =>
			parseConfig({
				Servers: [{ authorize: { type: 'kubernetes-sar', namespace: 'Not_A_Label' } }]
			})
		).toThrow(/DNS-1123/);
	});

	test('rejects an unknown role and negative server indexes', () => {
		expect(() =>
			parseConfig({
				Servers: [{}],
				login: [{ username: 'a', password: 'b', role: 'superuser' }],
				cookieSecret: '0123456789abcdef'
			})
		).toThrow(ConfigError);
		expect(() =>
			parseConfig({
				Servers: [{}],
				login: [{ username: 'a', password: 'b', servers: [-1] }],
				cookieSecret: '0123456789abcdef'
			})
		).toThrow(ConfigError);
	});

	test('rejects login without cookieSecret', () => {
		expect(() =>
			parseConfig({ Servers: [{}], login: [{ username: 'admin', password: 'admin' }] })
		).toThrow(ConfigError);
	});

	test('rejects short cookie secrets', () => {
		expect(() =>
			parseConfig({
				Servers: [{}],
				login: [{ username: 'a', password: 'b' }],
				cookieSecret: 'short'
			})
		).toThrow(ConfigError);
	});

	test('rejects empty server lists and wrong ports', () => {
		expect(() => parseConfig({ Servers: [] })).toThrow(ConfigError);
		expect(() => parseConfig({ Servers: [{ port: 0 }] })).toThrow(ConfigError);
		expect(() => parseConfig({ Servers: [{ port: 70000 }] })).toThrow(ConfigError);
	});

	test('rejects non-object input', () => {
		expect(() => parseConfig(null)).toThrow(ConfigError);
		expect(() => parseConfig('nope')).toThrow(ConfigError);
	});
});

describe('AuditLog', () => {
	test('is off by default and has defaults when set', () => {
		expect(parseConfig({ Servers: [{}] }).AuditLog).toBeUndefined();
		expect(parseConfig({ Servers: [{}], AuditLog: { target: 'stdout' } }).AuditLog).toEqual({
			target: 'stdout',
			includeValues: false,
			sessionIdleMinutes: 30,
			maxArgLength: 1024
		});
	});

	test('needs a path for the file target', () => {
		expect(() => parseConfig({ Servers: [{}], AuditLog: { target: 'file' } })).toThrow(
			/AuditLog\.path/
		);
		expect(() => parseConfig({ Servers: [{}], AuditLog: { target: 'syslog' } })).toThrow(
			ConfigError
		);
	});

	test('a relative file path resolves from the directory of the config file', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'sra-config-'));
		try {
			const file = join(dir, 'config.json');
			await writeFile(
				file,
				JSON.stringify({ Servers: [{}], AuditLog: { target: 'file', path: 'var/audit.jsonl' } })
			);
			expect(loadConfig(file).AuditLog).toMatchObject({ path: join(dir, 'var/audit.jsonl') });
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
