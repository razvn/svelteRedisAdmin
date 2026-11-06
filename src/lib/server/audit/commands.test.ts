import { describe, expect, it } from 'vitest';
import {
	commandName,
	errorCode,
	isAdminCommand,
	isAuditedCommand,
	knownKeys,
	loggedArg,
	maskSecrets
} from './commands.ts';

describe('commandName', () => {
	it('upper-cases the name and joins the subcommand of container commands', () => {
		expect(commandName(['set', 'k', 'v'])).toEqual({ name: 'SET', words: 1 });
		expect(commandName(['config', 'set', 'maxmemory', '1gb'])).toEqual({
			name: 'CONFIG SET',
			words: 2
		});
		expect(commandName(['CLIENT'])).toEqual({ name: 'CLIENT', words: 1 });
	});
});

describe('isAuditedCommand', () => {
	it('logs data changes and server administration', () => {
		for (const args of [
			['SET', 'k', 'v'],
			['del', 'a', 'b'],
			['HSET', 'h', 'f', 'v'],
			['EXPIRE', 'k', '10'],
			['RENAME', 'a', 'b'],
			['FLUSHDB'],
			['SWAPDB', '0', '1'],
			['CONFIG', 'SET', 'maxmemory', '1gb'],
			['CLIENT', 'KILL', 'ID', '7'],
			['SLOWLOG', 'RESET'],
			['ACL', 'SETUSER', 'bob', 'on'],
			['ACL', 'LOG', 'RESET'],
			['XGROUP', 'CREATE', 's', 'g', '$'],
			['DEBUG', 'SLEEP', '0'],
			['EVAL', 'return 1', '0']
		]) {
			expect(isAuditedCommand(args), args.join(' ')).toBe(true);
		}
	});

	it('ignores reads, including the ones the app runs for its pages', () => {
		for (const args of [
			['GET', 'k'],
			['SCAN', '0'],
			['TYPE', 'k'],
			['TTL', 'k'],
			['INFO'],
			['CONFIG', 'GET', '*'],
			['CLIENT', 'LIST'],
			['SLOWLOG', 'GET', '10'],
			['ACL', 'LOG'],
			['OBJECT', 'ENCODING', 'k'],
			['SELECT', '1'],
			['PING']
		]) {
			expect(isAuditedCommand(args), args.join(' ')).toBe(false);
		}
	});
});

describe('knownKeys', () => {
	it('finds the keys of each shape of command', () => {
		expect(knownKeys(['SET', 'k', 'v', 'EX', '10'])).toEqual(['k']);
		expect(knownKeys(['DEL', 'a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
		expect(knownKeys(['MSET', 'a', '1', 'b', '2'])).toEqual(['a', 'b']);
		expect(knownKeys(['RENAME', 'old', 'new'])).toEqual(['old', 'new']);
		expect(knownKeys(['BITOP', 'AND', 'dest', 'x', 'y'])).toEqual(['dest', 'x', 'y']);
		expect(knownKeys(['BLPOP', 'a', 'b', '5'])).toEqual(['a', 'b']);
		expect(knownKeys(['EVAL', 'return 1', '2', 'k1', 'k2', 'arg'])).toEqual(['k1', 'k2']);
		expect(knownKeys(['ZUNIONSTORE', 'dest', '2', 'a', 'b', 'WEIGHTS', '1', '2'])).toEqual([
			'dest',
			'a',
			'b'
		]);
		expect(knownKeys(['LMPOP', '2', 'a', 'b', 'LEFT'])).toEqual(['a', 'b']);
		expect(knownKeys(['SORT', 'src', 'BY', 'w_*', 'STORE', 'dest'])).toEqual(['src', 'dest']);
		expect(knownKeys(['MIGRATE', 'h', '6379', '', '0', '5000', 'KEYS', 'a', 'b'])).toEqual([
			'a',
			'b'
		]);
		expect(knownKeys(['XGROUP', 'CREATE', 'stream', 'group', '$'])).toEqual(['stream']);
	});

	it('keeps binary key names as bytes', () => {
		const key = Buffer.from([0xff, 0x00, 0x41]);
		expect(knownKeys(['DEL', key])).toEqual([key]);
	});

	it('returns null for commands it does not list', () => {
		expect(knownKeys(['GET', 'k'])).toBeNull();
		expect(knownKeys(['FLUSHDB'])).toBeNull();
	});
});

describe('isAdminCommand', () => {
	it('is true for keyless administration only', () => {
		expect(isAdminCommand(['CONFIG', 'SET', 'maxmemory', '1gb'])).toBe(true);
		expect(isAdminCommand(['FLUSHALL'])).toBe(true);
		expect(isAdminCommand(['SET', 'k', 'v'])).toBe(false);
	});
});

describe('maskSecrets', () => {
	it('masks passwords and leaves the rest', () => {
		expect(maskSecrets(['AUTH', 'pw'])).toEqual(['***']);
		expect(maskSecrets(['AUTH', 'bob', 'pw'])).toEqual(['bob', '***']);
		expect(maskSecrets(['HELLO', '3', 'AUTH', 'bob', 'pw', 'SETNAME', 'x'])).toEqual([
			'3',
			'AUTH',
			'bob',
			'***',
			'SETNAME',
			'x'
		]);
		expect(
			maskSecrets(['CONFIG', 'SET', 'maxmemory', '1gb', 'requirepass', 'pw', 'masterauth', 'm'])
		).toEqual(['maxmemory', '1gb', 'requirepass', '***', 'masterauth', '***']);
		expect(
			maskSecrets(['ACL', 'SETUSER', 'bob', 'on', '>pw', '#abc', '<old', '!h', '~*', '+@all'])
		).toEqual(['bob', 'on', '***', '***', '***', '***', '~*', '+@all']);
		expect(
			maskSecrets(['MIGRATE', 'h', '1', '', '0', '9', 'AUTH2', 'u', 'pw', 'KEYS', 'AUTH', 'k'])
		).toEqual(['h', '1', '', '0', '9', 'AUTH2', 'u', '***', 'KEYS', 'AUTH', 'k']);
		expect(maskSecrets(['SET', 'k', 'v'])).toEqual(['k', 'v']);
	});
});

describe('loggedArg', () => {
	it('keeps UTF-8 as text and tags other bytes as base64', () => {
		expect(loggedArg('café')).toBe('café');
		expect(loggedArg(Buffer.from('café', 'utf8'))).toBe('café');
		expect(loggedArg(Buffer.from([0xff, 0xfe]))).toEqual({ base64: '//4=' });
	});
});

describe('errorCode', () => {
	it('keeps the first word of the Redis error, never the message', () => {
		expect(
			errorCode(new Error('WRONGTYPE Operation against a key holding the wrong kind of value'))
		).toBe('WRONGTYPE');
		expect(
			errorCode(new Error("NOPERM User bob has no permissions to run the 'set' command"))
		).toBe('NOPERM');
		expect(errorCode(new Error('wrong number of arguments'))).toBe('UNKNOWN');
		class ClientClosedError extends Error {
			override name = 'ClientClosedError';
		}
		expect(errorCode(new ClientClosedError('The client is closed'))).toBe('ClientClosedError');
	});
});
