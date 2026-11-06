import { describe, expect, test, vi } from 'vitest';
import { parseConfig } from '#lib/server/config/loader.ts';
import {
	connectionSettings,
	discoveryFor,
	findConfiguredServer,
	findServer,
	listServers
} from './index.ts';

const header = { plugin: 'header', header: 'x-user', trustedProxies: ['127.0.0.1'] };

/** Answers the namespace/service lists and the Secret of `review-1`. */
const api = vi.fn(async (_access: unknown, _what: string, _method: string, path: string) => {
	if (path.startsWith('/api/v1/namespaces?'))
		return { items: [{ metadata: { name: 'review-1' } }] };
	if (path.startsWith('/api/v1/services?')) {
		return {
			items: [
				{ metadata: { name: 'redis', namespace: 'review-1' }, spec: { ports: [{ port: 6379 }] } }
			]
		};
	}
	return { data: { password: Buffer.from('s3cret').toString('base64') } };
});

function config() {
	const cfg = parseConfig({
		Servers: [{ name: 'local', port: 33380 }],
		auth: header,
		ServerDiscovery: {
			type: 'kubernetes',
			namespaceSelector: 'env=review',
			serviceSelector: 'app=redis',
			secret: { name: 'redis-auth', passwordKey: 'password' },
			apiServer: 'https://k8s.test'
		}
	});
	discoveryFor(cfg, { request: api as never });
	return cfg;
}

describe('server registry', () => {
	test('names configured servers by position, nothing else', () => {
		const cfg = parseConfig({ Servers: [{}, {}] });
		expect(findConfiguredServer(cfg, '1')?.index).toBe(1);
		expect(findConfiguredServer(cfg, '2')).toBeNull();
		expect(findConfiguredServer(cfg, '1e0')).toBeNull();
		expect(findConfiguredServer(cfg, 'k8s:a:b')).toBeNull();
	});

	test('lists configured servers first, then the discovered ones', async () => {
		const cfg = config();
		expect((await listServers(cfg)).map((e) => e.id)).toEqual(['0', 'k8s:review-1:redis']);
	});

	test('finds a discovered server by id and reads its password from the Secret', async () => {
		const cfg = config();
		const entry = await findServer(cfg, 'k8s:review-1:redis');
		expect(entry?.server.host).toBe('redis.review-1.svc');
		expect(entry?.server.auth).toBeUndefined();
		expect(await connectionSettings(cfg, entry!)).toMatchObject({
			host: 'redis.review-1.svc',
			port: 6379,
			auth: 's3cret'
		});
		expect(await findServer(cfg, 'k8s:review-9:redis')).toBeNull();
	});

	test('a configured server keeps its own settings', async () => {
		const cfg = config();
		const entry = (await findServer(cfg, '0'))!;
		expect(await connectionSettings(cfg, entry)).toBe(entry.server);
	});
});
