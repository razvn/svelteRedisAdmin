import { describe, expect, test } from 'vitest';
import { ConfigError, parseConfig } from './loader.ts';

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
			auth: { plugin: 'header', header: 'x-forwarded-user' }
		});
		expect(config.login?.[0]).toEqual({
			username: 'dev',
			password: 'pw',
			role: 'rw',
			servers: [0, 2]
		});
		expect(config.auth).toEqual({ plugin: 'header', header: 'x-forwarded-user' });
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
