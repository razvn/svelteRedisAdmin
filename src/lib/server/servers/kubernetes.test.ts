import { describe, expect, it, vi } from 'vitest';
import { serverDiscoverySchema, type ServerDiscoveryConfig } from '#lib/server/config/schema.ts';
import {
	createDiscovery,
	fillTemplate,
	servicePort,
	toServers,
	type NamespaceInfo,
	type ServiceInfo
} from './kubernetes.ts';

function discoveryConfig(extra: Record<string, unknown> = {}): ServerDiscoveryConfig {
	return serverDiscoverySchema.parse({
		type: 'kubernetes',
		namespaceSelector: 'env=review',
		serviceSelector: 'app=redis',
		secret: { name: 'redis-auth', passwordKey: 'redis-password' },
		server: { databases: 4, separator: '/' },
		apiServer: 'https://k8s.test',
		...extra
	});
}

const review1: NamespaceInfo = {
	name: 'review-1',
	labels: { env: 'review', mr: '17' },
	annotations: { 'gitlab.com/mr-title': 'Fix login' }
};
const review2: NamespaceInfo = { name: 'review-2', labels: {}, annotations: {} };
const redis = (
	namespace: string,
	ports: ServiceInfo['ports'] = [{ name: 'redis', port: 6379 }]
) => ({
	name: 'redis',
	namespace,
	ports
});

describe('fillTemplate', () => {
	it('fills the namespace, Service, labels and annotations of the namespace', () => {
		expect(
			fillTemplate(
				'{namespace}/{service} !{label:mr} {annotation:gitlab.com/mr-title}{label:missing}',
				review1,
				'redis'
			)
		).toBe('review-1/redis !17 Fix login');
	});
});

describe('servicePort', () => {
	const ports = [
		{ name: 'redis', port: 6379 },
		{ name: 'metrics', port: 9121 }
	];
	it('takes the named port', () => expect(servicePort(ports, 'metrics')).toBe(9121));
	it('takes a numbered port only when the Service has it', () => {
		expect(servicePort(ports, 6379)).toBe(6379);
		expect(servicePort(ports, 6380)).toBeNull();
	});
	it('falls back to the only port, else none', () => {
		expect(servicePort([{ port: 6380 }], 'redis')).toBe(6380);
		expect(servicePort(ports, 'db')).toBeNull();
	});
});

describe('toServers', () => {
	it('makes a server per Service, with the RBAC check in its own namespace', () => {
		const [entry] = toServers([review1], [redis('review-1')], discoveryConfig());
		expect(entry).toMatchObject({
			id: 'k8s:review-1:redis',
			index: null,
			discovered: { namespace: 'review-1', service: 'redis' },
			server: {
				name: 'review-1',
				host: 'redis.review-1.svc',
				port: 6379,
				db: 0,
				databases: 4,
				separator: '/',
				authorize: {
					type: 'kubernetes-sar',
					namespace: 'review-1',
					resource: { group: '', resource: 'pods', verb: 'get' },
					apiServer: 'https://k8s.test'
				}
			}
		});
		expect(entry.server.auth).toBeUndefined();
	});

	it('leaves the RBAC check out with authorize: false', () => {
		const [entry] = toServers(
			[review1],
			[redis('review-1')],
			discoveryConfig({ authorize: false })
		);
		expect(entry.server.authorize).toBeUndefined();
	});

	it('skips Services outside the matching namespaces or without a usable port, and sorts by id', () => {
		const entries = toServers(
			[review2, review1],
			[
				redis('review-2'),
				redis('other'),
				{ name: 'db', namespace: 'review-1', ports: [{ port: 1 }, { port: 2 }] },
				redis('review-1')
			],
			discoveryConfig()
		);
		expect(entries.map((e) => e.id)).toEqual(['k8s:review-1:redis', 'k8s:review-2:redis']);
	});

	it('uses the name template, falling back to namespace/service when it is blank', () => {
		const cfg = discoveryConfig({ name: '{annotation:gitlab.com/mr-title}' });
		const [a, b] = toServers([review1, review2], [redis('review-1'), redis('review-2')], cfg);
		expect([a.server.name, b.server.name]).toEqual(['Fix login', 'review-2/redis']);
	});
});

/** A fake API: namespaces, services and secrets by path. */
function fakeApi(state: {
	namespaces: NamespaceInfo[];
	services: ServiceInfo[];
	secrets?: Record<string, Record<string, string>>;
	fail?: boolean;
}) {
	return vi.fn(async (_access: unknown, what: string, _method: string, path: string) => {
		if (state.fail) throw new Error(`${what} failed: HTTP 500`);
		if (path.startsWith('/api/v1/namespaces?')) {
			return {
				items: state.namespaces.map((n) => ({
					metadata: { name: n.name, labels: n.labels, annotations: n.annotations }
				}))
			};
		}
		if (path.startsWith('/api/v1/services?')) {
			return {
				items: state.services.map((s) => ({
					metadata: { name: s.name, namespace: s.namespace },
					spec: { ports: s.ports }
				}))
			};
		}
		const secret = /^\/api\/v1\/namespaces\/([^/]+)\/secrets\/([^/]+)$/.exec(path);
		if (secret) {
			const data = state.secrets?.[`${secret[1]}/${secret[2]}`];
			if (!data) throw new Error(`${what} failed: HTTP 404`);
			return {
				data: Object.fromEntries(
					Object.entries(data).map(([k, v]) => [k, Buffer.from(v).toString('base64')])
				)
			};
		}
		throw new Error(`unexpected ${path}`);
	});
}

describe('createDiscovery', () => {
	const setup = (state: Parameters<typeof fakeApi>[0], extra: Record<string, unknown> = {}) => {
		let time = 0;
		const request = fakeApi(state);
		const log = vi.fn();
		const discovery = createDiscovery(discoveryConfig(extra), {
			request: request as never,
			now: () => time,
			log
		});
		return { discovery, request, log, tick: (ms: number) => (time += ms) };
	};
	const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

	it('lists namespaces and Services by label selector', async () => {
		const { discovery, request } = setup({ namespaces: [review1], services: [redis('review-1')] });
		const servers = await discovery.servers();
		expect(servers.map((s) => s.id)).toEqual(['k8s:review-1:redis']);
		expect(request.mock.calls.map((c) => c[3])).toEqual([
			'/api/v1/namespaces?labelSelector=env%3Dreview&limit=500',
			'/api/v1/services?labelSelector=app%3Dredis&limit=500'
		]);
	});

	it('follows continue tokens', async () => {
		const request = vi.fn(async (_a: unknown, _w: string, _m: string, path: string) => {
			if (path.startsWith('/api/v1/services')) return { items: [] };
			return path.includes('continue=next')
				? { items: [{ metadata: { name: 'review-2' } }] }
				: { items: [{ metadata: { name: 'review-1' } }], metadata: { continue: 'next' } };
		});
		const discovery = createDiscovery(discoveryConfig(), { request: request as never });
		await discovery.servers();
		expect(request.mock.calls.map((c) => c[3])).toContain(
			'/api/v1/namespaces?labelSelector=env%3Dreview&limit=500&continue=next'
		);
	});

	it('reuses the list for refreshSeconds, then refreshes in the background', async () => {
		const state = { namespaces: [review1], services: [redis('review-1')] };
		const { discovery, request, tick } = setup(state);
		await discovery.servers();
		tick(29_000);
		await discovery.servers();
		expect(request).toHaveBeenCalledTimes(2);

		state.namespaces = [review1, review2];
		state.services = [redis('review-1'), redis('review-2')];
		tick(1000);
		// stale: answered from the old list while the new one loads
		expect(await discovery.servers()).toHaveLength(1);
		await flush();
		expect(await discovery.servers()).toHaveLength(2);
		expect(request).toHaveBeenCalledTimes(4);
	});

	it('fails the first listing, but keeps the previous list when a refresh fails', async () => {
		const state = { namespaces: [review1], services: [redis('review-1')], fail: true };
		const { discovery, log, tick } = setup(state);
		await expect(discovery.servers()).rejects.toThrow(/HTTP 500/);

		state.fail = false;
		expect(await discovery.servers()).toHaveLength(1);
		state.fail = true;
		tick(30_000);
		expect(await discovery.servers()).toHaveLength(1);
		await flush();
		expect(await discovery.servers()).toHaveLength(1);
		expect(log).toHaveBeenCalledWith(
			'[discovery] cannot refresh the server list:',
			expect.any(Error)
		);
	});

	it('reads the account from the Secret of the namespace and caches it', async () => {
		const { discovery, request } = setup({
			namespaces: [review1],
			services: [redis('review-1')],
			secrets: { 'review-1/redis-auth': { 'redis-password': 's3cret' } }
		});
		const [server] = await discovery.servers();
		expect(await discovery.credentials(server)).toEqual({ auth: 's3cret' });
		await discovery.credentials(server);
		expect(request.mock.calls.filter((c) => String(c[3]).includes('/secrets/'))).toHaveLength(1);
	});

	it('reads the ACL user with usernameKey, and fills the Secret name template', async () => {
		const { discovery } = setup(
			{
				namespaces: [review1],
				services: [redis('review-1')],
				secrets: { 'review-1/redis-admin': { username: 'admin', password: 'pw' } }
			},
			{ secret: { name: '{service}-admin', usernameKey: 'username', passwordKey: 'password' } }
		);
		const [server] = await discovery.servers();
		expect(await discovery.credentials(server)).toEqual({ auth: 'pw', username: 'admin' });
	});

	it('connects without a password when no secret is configured', async () => {
		const { discovery, request } = setup(
			{ namespaces: [review1], services: [redis('review-1')] },
			{ secret: undefined }
		);
		const [server] = await discovery.servers();
		expect(await discovery.credentials(server)).toEqual({});
		expect(request.mock.calls.some((c) => String(c[3]).includes('/secrets/'))).toBe(false);
	});

	it('does not cache a missing Secret or key', async () => {
		const state = {
			namespaces: [review1],
			services: [redis('review-1')],
			secrets: { 'review-1/redis-auth': { other: 'x' } } as Record<string, Record<string, string>>
		};
		const { discovery } = setup(state);
		const [server] = await discovery.servers();
		await expect(discovery.credentials(server)).rejects.toThrow(
			'Secret review-1/redis-auth has no key "redis-password"'
		);
		state.secrets['review-1/redis-auth'] = { 'redis-password': 'late' };
		expect(await discovery.credentials(server)).toMatchObject({ auth: 'late' });
	});

	it('refuses a Secret name that is not a Kubernetes name', async () => {
		const { discovery, request } = setup(
			{ namespaces: [review1], services: [redis('review-1')] },
			{ secret: { name: '{annotation:x}', passwordKey: 'p' } }
		);
		const [server] = await discovery.servers();
		await expect(discovery.credentials(server)).rejects.toThrow(/invalid Secret name/);
		expect(request.mock.calls.some((c) => String(c[3]).includes('/secrets/'))).toBe(false);
	});
});
