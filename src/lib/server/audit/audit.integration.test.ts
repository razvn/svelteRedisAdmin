/**
 * The audit wrapper on a real connection: what the app's helpers, the console and an import end up
 * logging. Uses db 3 of the dev redis1 instance (127.0.0.1:33380), only `sra_test:audit:*` keys.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { auditLogSchema } from '#lib/server/config/schema.ts';
import { createConnection, type RedisConnection } from '#lib/server/redis/connection.ts';
import { deleteKeys, renameKey, scanPage } from '#lib/server/redis/keys.ts';
import { hashSetField, readKeyValue, setString } from '#lib/server/redis/values.ts';
import { runCommands } from '#lib/server/redis/console.ts';
import { requestAudit, type RequestAudit } from './index.ts';
import { installAudit } from './connection.ts';

const DB = 3;
const SERVER = {
	host: '127.0.0.1',
	port: Number(process.env['REDIS_TEST_PORT'] ?? 33380),
	db: DB,
	databases: 16,
	separator: ':',
	tls: false
};

const available = await createConnection(SERVER, DB).then(
	(client) => ({ ok: true as const, client }),
	() => ({ ok: false as const, client: undefined })
);

const key = (name: string) => Buffer.from(`sra_test:audit:${name}`, 'utf8');

describe.skipIf(!available.ok)('audit log on a Redis connection (integration)', () => {
	let client: RedisConnection;
	let lines: string[];
	let undo: () => void;

	function setup(includeValues = false): RequestAudit {
		lines = [];
		const audit = requestAudit(
			auditLogSchema.parse({ target: 'stdout', includeValues }),
			{
				identity: 'alice',
				role: 'admin',
				server: 'redis1',
				serverId: '0',
				clientIp: '127.0.0.1'
			},
			{ write: (line) => lines.push(line) }
		);
		undo = installAudit(client, audit, DB);
		return audit;
	}

	const events = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);

	async function cleanup() {
		const found = (await client.keys('sra_test:audit:*')) as string[];
		if (found.length > 0) await client.del(found);
	}

	beforeAll(async () => {
		client = available.client!;
		await cleanup();
	});

	afterEach(async () => {
		undo?.();
		await cleanup();
	});

	afterAll(async () => {
		await client?.quit();
	});

	test('logs writes with their keys, not the reads the app runs for its pages', async () => {
		setup();
		await setString(client, key('a'), { kind: 'text', text: 'secret value' });
		await scanPage(client, { count: 10, pattern: 'sra_test:audit:*' });
		await readKeyValue(client, key('a'), 'string');
		await renameKey(client, key('a'), key('b'));
		await deleteKeys(client, [key('b')]);

		expect(events().map((e) => [e.command, e.keys])).toEqual([
			['SET', ['sra_test:audit:a']],
			['RENAME', ['sra_test:audit:a', 'sra_test:audit:b']],
			['DEL', ['sra_test:audit:b']]
		]);
		expect(events()[0]).toMatchObject({ event: 'command', db: DB, ok: true, identity: 'alice' });
		expect(lines.join('\n')).not.toContain('secret value');
	});

	test('includeValues adds the arguments', async () => {
		setup(true);
		await setString(client, key('a'), { kind: 'text', text: 'v1' });
		expect(events()[0]).toMatchObject({
			command: 'SET',
			keys: ['sra_test:audit:a'],
			args: ['sra_test:audit:a', 'v1']
		});
	});

	test('a refused command is logged with its error code, and still throws', async () => {
		setup();
		await setString(client, key('s'), { kind: 'text', text: 'x' });
		await expect(
			hashSetField(client, key('s'), { kind: 'text', text: 'f' }, { kind: 'text', text: 'v' })
		).rejects.toThrow(/WRONGTYPE/);
		expect(events()[1]).toMatchObject({ command: 'HSET', ok: false, errorCode: 'WRONGTYPE' });
		expect(lines[1]).not.toContain('Operation against');
	});

	test('binary key names are logged as base64', async () => {
		setup();
		const binary = Buffer.concat([key('bin:'), Buffer.from([0xff, 0xfe])]);
		await client.set(binary, '1');
		await deleteKeys(client, [binary]);
		expect(events()[1].keys).toEqual([{ base64: binary.toString('base64') }]);
	});

	test('follows SELECT for the db of later commands', async () => {
		setup();
		await client.sendCommand(['SELECT', '1']);
		await client.sendCommand(['DEL', 'sra_test:audit:none']);
		await client.sendCommand(['SELECT', String(DB)]);
		await client.sendCommand(['DEL', 'sra_test:audit:none']);
		expect(events().map((e) => e.db)).toEqual([1, DB]);
	});

	test('console mode logs every command typed, reads included, with keys from the server', async () => {
		const audit = setup();
		await audit.capture('console', () =>
			runCommands(client, 'SET sra_test:audit:c 1\nGET sra_test:audit:c\nPING\nMONITOR')
		);
		expect(events().map((e) => [e.event, e.command, e.keys])).toEqual([
			['console', 'SET', ['sra_test:audit:c']],
			['console', 'GET', ['sra_test:audit:c']],
			['console', 'PING', []]
		]);
		// values stay out by default
		expect(events()[0]).not.toHaveProperty('args');
	});

	test('quiet mode logs nothing (an import logs one event of its own)', async () => {
		const audit = setup();
		await audit.capture('quiet', () => setString(client, key('q'), { kind: 'text', text: '1' }));
		expect(lines).toEqual([]);
	});

	test('administration is logged with its arguments, passwords masked', async () => {
		setup();
		const before = (await client.configGet('maxmemory-policy'))['maxmemory-policy'];
		await client.configSet('maxmemory-policy', before);
		await client.sendCommand(['AUTH', 'nobody', 'wrong-password']).catch(() => null);
		expect(events()).toMatchObject([
			{ command: 'CONFIG SET', keys: [], args: ['maxmemory-policy', before], ok: true },
			{ command: 'AUTH', args: ['nobody', '***'], ok: false }
		]);
		expect(lines.join('\n')).not.toContain('wrong-password');
	});

	test('undo puts the client back', async () => {
		setup();
		undo();
		await setString(client, key('u'), { kind: 'text', text: '1' });
		expect(lines).toEqual([]);
	});
});
