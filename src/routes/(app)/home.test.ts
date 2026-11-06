import { describe, expect, test } from 'vitest';
import { load } from './+page.server.ts';
import type { SessionInfo } from '#lib/server/auth/session.ts';
import { configuredServers } from '#lib/server/servers/index.ts';
import { visibleServers } from '#lib/server/servers/access.ts';

// Port 1 refuses connections, so every probe fails fast and no Redis is needed: the test only checks
// which servers are listed.
const server = (name: string) => ({ name, host: '127.0.0.1', port: 1, db: 0, databases: 16 });

function run(servers: SessionInfo['servers']) {
	const session = { username: 'u', role: 'rw', servers, expires: 0 } as SessionInfo;
	const config = { Servers: [server('a'), server('b'), server('c')] };
	// Same visibility rule as hooks.server.ts (`locals.servers`).
	const locals = {
		config,
		session,
		servers: () => visibleServers(session, [], configuredServers(config as never))
	};
	return load({ locals } as never) as Promise<{ servers: { id: string; label: string }[] }>;
}

describe('home load', () => {
	test('lists only the servers the user may access', async () => {
		const data = await run([0, 2]);
		expect(data.servers.map((s) => [s.id, s.label])).toEqual([
			['0', 'a'],
			['2', 'c']
		]);
	});

	test('lists every server when the user has no restriction', async () => {
		const data = await run(null);
		expect(data.servers.map((s) => s.id)).toEqual(['0', '1', '2']);
	});
});
