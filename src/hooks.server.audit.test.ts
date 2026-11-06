/**
 * `handle` with `AuditLog` on and the header plugin: session detection and refusals (no Redis
 * needed: connections are lazy).
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HttpError, RequestEvent } from '@sveltejs/kit';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

let dir: string;
let handle: typeof import('./hooks.server.ts').handle;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), 'sra-audit-hooks-'));
	const configFile = join(dir, 'config.json');
	await writeFile(
		configFile,
		JSON.stringify({
			Servers: [
				{ name: 'cache', host: '127.0.0.1', port: 1 },
				{ name: 'queue', host: '127.0.0.1', port: 2 }
			],
			auth: {
				plugin: 'header',
				header: 'x-auth-request-user',
				headerServers: 'x-auth-request-servers',
				headerGroups: 'x-auth-request-groups',
				trustedProxies: ['10.0.0.1']
			},
			cookieSecret: 'test-secret-at-least-16-chars',
			AuditLog: { target: 'stdout' }
		})
	);
	vi.stubEnv('SRA_CONFIG', configFile);
	({ handle } = await import('./hooks.server.ts'));
});

afterAll(async () => {
	vi.unstubAllEnvs();
	await rm(dir, { recursive: true, force: true });
});

afterEach(() => vi.restoreAllMocks());

function event(
	id: string | undefined,
	headers: Record<string, string>,
	jar: Map<string, string>,
	peer: string
) {
	const url = new URL(id === undefined ? 'http://app/' : `http://app/server/${id}`);
	return {
		url,
		params: id === undefined ? {} : { id },
		request: new Request(url, { headers }),
		cookies: {
			get: (name: string) => jar.get(name),
			set: (name: string, value: string) => void jar.set(name, value),
			delete: (name: string) => void jar.delete(name)
		},
		getClientAddress: () => peer,
		locals: {}
	} as unknown as RequestEvent;
}

/** Run `handle` and return its status plus the audit lines it wrote to stdout. */
async function run(
	id: string | undefined,
	headers: Record<string, string>,
	{ jar = new Map<string, string>(), peer = '10.0.0.1' } = {}
) {
	const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
	let status: number;
	try {
		status = (
			await handle({
				event: event(id, headers, jar, peer),
				resolve: async () => new Response('ok')
			})
		).status;
	} catch (caught) {
		status = (caught as HttpError).status;
	}
	const lines = out.mock.calls
		.map((call) => String(call[0]))
		.filter((line) => line.startsWith('{"ts"'))
		.map((line) => JSON.parse(line) as Record<string, unknown>);
	out.mockRestore();
	return { status, lines };
}

const alice = { 'x-auth-request-user': 'alice', 'x-auth-request-groups': 'team-a' };

describe('handle with the audit log', () => {
	test('logs a session on the first request only, with who, from where and on which server', async () => {
		const jar = new Map<string, string>();
		const first = await run('0', alice, { jar });
		const second = await run('0', alice, { jar });
		expect(first.status).toBe(200);
		expect(first.lines).toEqual([
			{
				ts: expect.any(String),
				event: 'session',
				identity: 'alice',
				role: 'admin',
				groups: ['team-a'],
				server: 'cache',
				serverId: '0',
				clientIp: '10.0.0.1'
			}
		]);
		expect(second.lines).toEqual([]);
	});

	test('identity headers from a peer outside trustedProxies: denied untrusted-proxy, 401', async () => {
		const { status, lines } = await run('0', alice, { peer: '203.0.113.9' });
		expect(status).toBe(401);
		expect(lines).toEqual([
			expect.objectContaining({
				event: 'denied',
				reason: 'untrusted-proxy',
				identity: null,
				role: null,
				claimedUser: 'alice',
				clientIp: '203.0.113.9'
			})
		]);
	});

	test('an unusable identity: denied invalid-identity', async () => {
		const { status, lines } = await run(undefined, { 'x-auth-request-user': 'alice, bob' });
		expect(status).toBe(401);
		expect(lines).toEqual([
			expect.objectContaining({
				event: 'denied',
				reason: 'invalid-identity',
				claimedUser: 'alice, bob'
			})
		]);
	});

	test('a server outside the person list: denied server-not-allowed, 404', async () => {
		const { status, lines } = await run('0', {
			...alice,
			'x-auth-request-servers': '1'
		});
		expect(status).toBe(404);
		expect(lines).toEqual([
			expect.objectContaining({
				event: 'denied',
				reason: 'server-not-allowed',
				identity: 'alice',
				server: 'cache',
				serverId: '0'
			})
		]);
	});

	test('behind a trusted proxy, clientIp is the address X-Forwarded-For names', async () => {
		const { lines } = await run('1', { ...alice, 'x-forwarded-for': '203.0.113.7' });
		expect(lines).toEqual([
			expect.objectContaining({ event: 'session', serverId: '1', clientIp: '203.0.113.7' })
		]);
	});

	test('requests without any identity are not logged', async () => {
		const { status, lines } = await run(undefined, {});
		expect(status).toBe(401);
		expect(lines).toEqual([]);
	});
});
