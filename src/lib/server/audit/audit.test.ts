import { describe, expect, it } from 'vitest';
import { auditLogSchema } from '#lib/server/config/schema.ts';
import { noAudit, requestAudit, type Actor } from './index.ts';

const actor: Actor = {
	identity: 'alice',
	role: 'rw',
	groups: ['team-a'],
	server: 'Cache',
	serverId: '0',
	clientIp: '203.0.113.7'
};

function capture(config: Record<string, unknown> = { target: 'stdout' }, who: Actor = actor) {
	const lines: string[] = [];
	const audit = requestAudit(
		auditLogSchema.parse(config),
		who,
		{ write: (l) => lines.push(l) },
		() => new Date('2026-11-06T10:00:00.000Z')
	);
	return { audit, lines, parsed: () => lines.map((l) => JSON.parse(l)) };
}

describe('requestAudit', () => {
	it('writes one JSON object per event with the actor filled in', () => {
		const { audit, lines, parsed } = capture();
		audit.write({ event: 'session' });
		audit.write({ event: 'command', db: 2, command: 'DEL', keys: ['sra_test:a'], ok: true });
		expect(lines.every((l) => !l.includes('\n'))).toBe(true);
		expect(parsed()).toEqual([
			{
				ts: '2026-11-06T10:00:00.000Z',
				event: 'session',
				identity: 'alice',
				role: 'rw',
				groups: ['team-a'],
				server: 'Cache',
				serverId: '0',
				clientIp: '203.0.113.7'
			},
			{
				ts: '2026-11-06T10:00:00.000Z',
				event: 'command',
				identity: 'alice',
				role: 'rw',
				groups: ['team-a'],
				server: 'Cache',
				serverId: '0',
				clientIp: '203.0.113.7',
				db: 2,
				command: 'DEL',
				keys: ['sra_test:a'],
				ok: true
			}
		]);
	});

	it('leaves groups out when there are none, and fills the server in once known', () => {
		const { audit, parsed } = capture(undefined, {
			...actor,
			groups: undefined,
			server: null,
			serverId: null
		});
		audit.write({ event: 'session' });
		audit.setServer({ server: 'redis', serverId: 'k8s:review-1:redis' });
		audit.write({ event: 'logout' });
		const [first, second] = parsed();
		expect(first).not.toHaveProperty('groups');
		expect(first).toMatchObject({ server: null, serverId: null });
		expect(second).toMatchObject({ server: 'redis', serverId: 'k8s:review-1:redis' });
	});

	it('lets an event override the actor (unverified user of a denied request)', () => {
		const { audit, parsed } = capture();
		audit.write(
			{ event: 'denied', reason: 'access-denied', claimedUser: 'm'.repeat(300) },
			{ identity: null, role: null }
		);
		const [line] = parsed();
		expect(line).toMatchObject({ event: 'denied', identity: null, role: null });
		expect(line.claimedUser).toHaveLength(256);
	});

	it('cuts keys and arguments longer than maxArgLength and flags the line', () => {
		const { audit, parsed } = capture({ target: 'stdout', maxArgLength: 4 });
		audit.write({
			event: 'command',
			db: 0,
			command: 'SET',
			keys: ['abcdefgh', { base64: 'AAAAAAAA' }],
			args: ['abcdefgh', 'xy'],
			ok: true
		});
		audit.write({ event: 'command', db: 0, command: 'DEL', keys: ['abcd'], ok: true });
		const [cut, whole] = parsed();
		expect(cut).toMatchObject({
			keys: ['abcd', { base64: 'AAAA' }],
			args: ['abcd', 'xy'],
			truncated: true
		});
		expect(whole).not.toHaveProperty('truncated');
	});

	it('capture switches the mode for the duration of the call, even when it throws', async () => {
		const { audit } = capture();
		expect(audit.mode()).toBe('commands');
		await audit.capture('console', async () => {
			expect(audit.mode()).toBe('console');
		});
		await expect(
			audit.capture('quiet', async () => {
				throw new Error('boom');
			})
		).rejects.toThrow('boom');
		expect(audit.mode()).toBe('commands');
	});

	it('noAudit is off and does nothing', async () => {
		expect(noAudit.enabled).toBe(false);
		noAudit.write({ event: 'session' });
		expect(await noAudit.capture('console', async () => 42)).toBe(42);
	});
});
