/**
 * `handle` with the header plugin, Kubernetes RBAC and server discovery, against a fake Kubernetes
 * API server (no cluster and no Redis needed: connections are lazy).
 */
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HttpError, RequestEvent } from '@sveltejs/kit';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

let api: Server;
let dir: string;
let handle: typeof import('./hooks.server.ts').handle;
/** Who RBAC lets in, per namespace. */
const allowed: Record<string, string[]> = {
	'review-1': ['alice'],
	'review-2': ['team-b'],
	'review-3': ['carol']
};
let secretFails = false;

beforeAll(async () => {
	api = createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => {
			const url = req.url ?? '';
			const json = (status: number, body: unknown) => {
				res.writeHead(status, { 'content-type': 'application/json' });
				res.end(JSON.stringify(body));
			};
			if (url.startsWith('/apis/authorization.k8s.io/v1/subjectaccessreviews')) {
				const { spec } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
				const who = allowed[spec.resourceAttributes.namespace] ?? [];
				const ok = who.includes(spec.user) || spec.groups.some((g: string) => who.includes(g));
				return json(201, { status: { allowed: ok } });
			}
			if (url.startsWith('/api/v1/namespaces?')) {
				return json(200, {
					items: ['review-1', 'review-2', 'review-3'].map((name) => ({ metadata: { name } }))
				});
			}
			if (url.startsWith('/api/v1/services?')) {
				return json(200, {
					items: ['review-1', 'review-2', 'review-3'].map((namespace) => ({
						metadata: { name: 'redis', namespace },
						spec: { ports: [{ name: 'redis', port: 6379 }] }
					}))
				});
			}
			if (url.includes('/secrets/redis-auth')) {
				if (secretFails) return json(403, { reason: 'Forbidden' });
				return json(200, { data: { password: Buffer.from('s3cret').toString('base64') } });
			}
			json(404, {});
		});
	});
	await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
	const apiServer = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
	dir = await mkdtemp(join(tmpdir(), 'sra-hooks-'));
	const tokenFile = join(dir, 'token');
	await writeFile(tokenFile, 'token');
	const configFile = join(dir, 'config.json');
	await writeFile(
		configFile,
		JSON.stringify({
			Servers: [{ name: 'shared', host: '127.0.0.1', port: 1 }],
			auth: {
				plugin: 'header',
				header: 'x-auth-request-user',
				headerGroups: 'x-auth-request-groups',
				trustedProxies: ['10.0.0.1']
			},
			cookieSecret: 'test-secret-at-least-16-chars',
			ServerDiscovery: {
				type: 'kubernetes',
				namespaceSelector: 'env=review',
				serviceSelector: 'app=redis',
				secret: { name: 'redis-auth', passwordKey: 'password' },
				apiServer,
				tokenFile,
				caFile: join(dir, 'unused-ca')
			}
		})
	);
	vi.stubEnv('SRA_CONFIG', configFile);
	({ handle } = await import('./hooks.server.ts'));
});

afterAll(async () => {
	vi.unstubAllEnvs();
	api.closeAllConnections();
	await new Promise((resolve) => api.close(resolve));
	await rm(dir, { recursive: true, force: true });
});

function event(id: string | undefined, headers: Record<string, string>, peer = '10.0.0.1') {
	const url = new URL(id === undefined ? 'http://app/' : `http://app/server/${id}`);
	return {
		url,
		params: id === undefined ? {} : { id },
		request: new Request(url, { headers }),
		cookies: { get: () => undefined, set: () => {} },
		getClientAddress: () => peer,
		locals: {}
	} as unknown as RequestEvent;
}

/** Run `handle`; returns the locals on success, or the HTTP error / response status. */
async function run(id: string | undefined, headers: Record<string, string>, peer?: string) {
	const ev = event(id, headers, peer);
	try {
		const response = await handle({ event: ev, resolve: async () => new Response('ok') });
		return { status: response.status, locals: ev.locals };
	} catch (caught) {
		const err = caught as HttpError & { location?: string };
		return { status: err.status, message: err.body?.message, location: err.location };
	}
}

const alice = { 'x-auth-request-user': 'alice' };

describe('handle with Kubernetes RBAC and discovery', () => {
	test('opens a discovered server RBAC allows, with the password of its Secret', async () => {
		const result = await run('k8s:review-1:redis', alice);
		expect(result.status).toBe(200);
		expect(result.locals?.serverId).toBe('k8s:review-1:redis');
		expect(result.locals?.server).toMatchObject({ host: 'redis.review-1.svc', auth: 's3cret' });
	});

	test('answers 403 when RBAC of the namespace denies the person', async () => {
		expect(await run('k8s:review-2:redis', alice)).toMatchObject({
			status: 403,
			message: 'You do not have access to this server (Kubernetes namespace review-2).'
		});
	});

	test('lets groups from the groups header in', async () => {
		const result = await run('k8s:review-2:redis', {
			'x-auth-request-user': 'bob',
			'x-auth-request-groups': 'team-b'
		});
		expect(result.status).toBe(200);
	});

	test('lists only the servers the person may use', async () => {
		const result = await run(undefined, alice);
		const servers = await result.locals!.servers();
		expect(servers.map((e: { id: string }) => e.id)).toEqual(['0', 'k8s:review-1:redis']);
	});

	test('404s an unknown server id', async () => {
		expect(await run('k8s:review-9:redis', alice)).toMatchObject({ status: 404 });
	});

	test('ignores identity headers from an untrusted peer', async () => {
		expect(await run('0', alice, '192.168.1.9')).toMatchObject({ status: 401 });
	});

	test('answers 503 when the Secret cannot be read', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		secretFails = true;
		try {
			// Only this test opens review-3, so its Secret is not cached yet.
			expect(await run('k8s:review-3:redis', { 'x-auth-request-user': 'carol' })).toMatchObject({
				status: 503,
				message: 'Cannot read the password of this server right now.'
			});
		} finally {
			secretFails = false;
			log.mockRestore();
		}
	});
});

describe('health probe', () => {
	test('answers without an identity, before any auth or Kubernetes call', async () => {
		const ev = event(undefined, {}, '192.168.1.9');
		(ev as { url: URL }).url = new URL('http://app/api/health');
		const response = await handle({ event: ev, resolve: async () => new Response('ok') });
		expect(response.status).toBe(200);
	});
});
