/**
 * Which Redis commands the audit log records, which of their arguments are keys, and how secrets are
 * masked. A fixed list (Redis 7.4 / 8 `write` commands plus server administration), so what is logged
 * does not depend on the server's `COMMAND` output.
 */
import type { LoggedArg } from './events.ts';

/** A command argument as node-redis sends it. */
export type Arg = string | Buffer;

const text = (arg: Arg | undefined): string =>
	arg === undefined ? '' : typeof arg === 'string' ? arg : arg.toString('latin1');

const upper = (arg: Arg | undefined): string => text(arg).toUpperCase();

/** Commands whose second word is a subcommand (`CONFIG SET`, `CLIENT KILL`, `XGROUP CREATE`). */
const CONTAINERS = new Set([
	'ACL',
	'CLIENT',
	'CLUSTER',
	'COMMAND',
	'CONFIG',
	'DEBUG',
	'FUNCTION',
	'LATENCY',
	'MEMORY',
	'MODULE',
	'OBJECT',
	'PUBSUB',
	'SCRIPT',
	'SLOWLOG',
	'XGROUP',
	'XINFO'
]);

/** `CONFIG SET`, `GET`: the name as logged, and how many leading arguments it takes. */
export function commandName(args: readonly Arg[]): { name: string; words: number } {
	const first = upper(args[0]);
	if (CONTAINERS.has(first) && args.length > 1) {
		return { name: `${first} ${upper(args[1])}`, words: 2 };
	}
	return { name: first, words: 1 };
}

/** Keys of a command: `[first, last, step]` positions in the full argument list (last < 0 counts from the end). */
type Range = readonly [first: number, last: number, step: number];
type KeySpec = Range | ((args: readonly Arg[]) => Arg[]);

function range(args: readonly Arg[], [first, last, step]: Range): Arg[] {
	const end = last < 0 ? args.length + last : last;
	const keys: Arg[] = [];
	for (let i = first; i <= end && i < args.length; i += step) keys.push(args[i]);
	return keys;
}

/** `<numkeys> key...` starting at `at` (EVAL, LMPOP, ZUNIONSTORE...). */
function numkeys(at: number, before: readonly number[] = []): (args: readonly Arg[]) => Arg[] {
	return (args) => {
		const n = Number(text(args[at]));
		const keys = before.map((i) => args[i]).filter((a) => a !== undefined);
		if (!Number.isInteger(n) || n < 0) return keys;
		return [...keys, ...args.slice(at + 1, at + 1 + n)];
	};
}

/** The key, plus the target of a `STORE`/`STOREDIST` option (SORT, GEORADIUS...). */
function withStore(args: readonly Arg[]): Arg[] {
	const keys: Arg[] = args[1] === undefined ? [] : [args[1]];
	for (let i = 2; i < args.length - 1; i++) {
		const word = upper(args[i]);
		if (word === 'STORE' || word === 'STOREDIST') keys.push(args[i + 1]);
	}
	return keys;
}

/** `MIGRATE host port key|"" db timeout [COPY] [REPLACE] [AUTH pw | AUTH2 user pw] [KEYS key...]`. */
function migrateKeys(args: readonly Arg[]): Arg[] {
	const keys: Arg[] = text(args[3]) === '' ? [] : [args[3]];
	const at = args.findIndex((a, i) => i > 5 && upper(a) === 'KEYS');
	return at === -1 ? keys : [...keys, ...args.slice(at + 1)];
}

const ONE: Range = [1, 1, 1];
const ALL: Range = [1, -1, 1];
const TWO: Range = [1, 2, 1];

/** Commands that change data, with where their keys are. */
const KEYED: Record<string, KeySpec> = {
	APPEND: ONE,
	BITFIELD: ONE,
	BITOP: [2, -1, 1],
	BLMOVE: TWO,
	BLMPOP: numkeys(2),
	BLPOP: [1, -2, 1],
	BRPOP: [1, -2, 1],
	BRPOPLPUSH: TWO,
	BZMPOP: numkeys(2),
	BZPOPMAX: [1, -2, 1],
	BZPOPMIN: [1, -2, 1],
	COPY: TWO,
	DECR: ONE,
	DECRBY: ONE,
	DEL: ALL,
	EVAL: numkeys(2),
	EVALSHA: numkeys(2),
	EXPIRE: ONE,
	EXPIREAT: ONE,
	FCALL: numkeys(2),
	GEOADD: ONE,
	GEORADIUS: withStore,
	GEORADIUSBYMEMBER: withStore,
	GEOSEARCHSTORE: TWO,
	GETDEL: ONE,
	GETEX: ONE,
	GETSET: ONE,
	HDEL: ONE,
	HEXPIRE: ONE,
	HEXPIREAT: ONE,
	HGETDEL: ONE,
	HGETEX: ONE,
	HINCRBY: ONE,
	HINCRBYFLOAT: ONE,
	HMSET: ONE,
	HPERSIST: ONE,
	HPEXPIRE: ONE,
	HPEXPIREAT: ONE,
	HSET: ONE,
	HSETEX: ONE,
	HSETNX: ONE,
	INCR: ONE,
	INCRBY: ONE,
	INCRBYFLOAT: ONE,
	LINSERT: ONE,
	LMOVE: TWO,
	LMPOP: numkeys(1),
	LPOP: ONE,
	LPUSH: ONE,
	LPUSHX: ONE,
	LREM: ONE,
	LSET: ONE,
	LTRIM: ONE,
	MIGRATE: migrateKeys,
	MOVE: ONE,
	MSET: [1, -1, 2],
	MSETNX: [1, -1, 2],
	PERSIST: ONE,
	PEXPIRE: ONE,
	PEXPIREAT: ONE,
	PFADD: ONE,
	PFMERGE: ALL,
	PSETEX: ONE,
	RENAME: TWO,
	RENAMENX: TWO,
	RESTORE: ONE,
	RPOP: ONE,
	RPOPLPUSH: TWO,
	RPUSH: ONE,
	RPUSHX: ONE,
	SADD: ONE,
	SDIFFSTORE: ALL,
	SET: ONE,
	SETBIT: ONE,
	SETEX: ONE,
	SETNX: ONE,
	SETRANGE: ONE,
	SINTERSTORE: ALL,
	SMOVE: TWO,
	SORT: withStore,
	SPOP: ONE,
	SREM: ONE,
	SUNIONSTORE: ALL,
	XACK: ONE,
	XADD: ONE,
	XAUTOCLAIM: ONE,
	XCLAIM: ONE,
	XDEL: ONE,
	'XGROUP CREATE': [2, 2, 1],
	'XGROUP CREATECONSUMER': [2, 2, 1],
	'XGROUP DELCONSUMER': [2, 2, 1],
	'XGROUP DESTROY': [2, 2, 1],
	'XGROUP SETID': [2, 2, 1],
	XSETID: ONE,
	XTRIM: ONE,
	ZADD: ONE,
	ZDIFFSTORE: numkeys(2, [1]),
	ZINCRBY: ONE,
	ZINTERSTORE: numkeys(2, [1]),
	ZMPOP: numkeys(1),
	ZPOPMAX: ONE,
	ZPOPMIN: ONE,
	ZRANGESTORE: TWO,
	ZREM: ONE,
	ZREMRANGEBYLEX: ONE,
	ZREMRANGEBYRANK: ONE,
	ZREMRANGEBYSCORE: ONE,
	ZUNIONSTORE: numkeys(2, [1])
};

/** Server administration and keyless data changes: always logged with their (masked) arguments. */
const ADMIN = new Set([
	'ACL DELUSER',
	'ACL LOAD',
	'ACL SAVE',
	'ACL SETUSER',
	'AUTH',
	'BGREWRITEAOF',
	'BGSAVE',
	'CLIENT KILL',
	'CLIENT NO-EVICT',
	'CLIENT PAUSE',
	'CLIENT UNPAUSE',
	'CLUSTER ADDSLOTS',
	'CLUSTER ADDSLOTSRANGE',
	'CLUSTER BUMPEPOCH',
	'CLUSTER DELSLOTS',
	'CLUSTER DELSLOTSRANGE',
	'CLUSTER FAILOVER',
	'CLUSTER FLUSHSLOTS',
	'CLUSTER FORGET',
	'CLUSTER MEET',
	'CLUSTER REPLICATE',
	'CLUSTER RESET',
	'CLUSTER SAVECONFIG',
	'CLUSTER SET-CONFIG-EPOCH',
	'CLUSTER SETSLOT',
	'CONFIG RESETSTAT',
	'CONFIG REWRITE',
	'CONFIG SET',
	'FAILOVER',
	'FLUSHALL',
	'FLUSHDB',
	'FUNCTION DELETE',
	'FUNCTION FLUSH',
	'FUNCTION KILL',
	'FUNCTION LOAD',
	'FUNCTION RESTORE',
	'LATENCY RESET',
	'MEMORY PURGE',
	'MODULE LOAD',
	'MODULE LOADEX',
	'MODULE UNLOAD',
	'REPLICAOF',
	'SAVE',
	'SCRIPT FLUSH',
	'SCRIPT KILL',
	'SCRIPT LOAD',
	'SHUTDOWN',
	'SLAVEOF',
	'SLOWLOG RESET',
	'SWAPDB'
]);

/** Debugging commands can crash or rewrite the server: every `DEBUG ...` is logged. */
const isAdmin = (name: string): boolean => ADMIN.has(name) || name.startsWith('DEBUG ');

/** True when the audit log records this command (`args[0]` is the command name). */
export function isAuditedCommand(args: readonly Arg[]): boolean {
	const { name } = commandName(args);
	return name in KEYED || isAdmin(name) || (name === 'ACL LOG' && upper(args[2]) === 'RESET');
}

/** The keys of a data command; null when its keys are not known (unlisted command). */
export function knownKeys(args: readonly Arg[]): Arg[] | null {
	const spec = KEYED[commandName(args).name];
	if (spec === undefined) return null;
	return typeof spec === 'function' ? spec(args) : range(args, spec);
}

/** True for a command logged with its arguments whatever `includeValues` says (no data values). */
export function isAdminCommand(args: readonly Arg[]): boolean {
	const { name } = commandName(args);
	return isAdmin(name) || name === 'ACL LOG';
}

const MASK = '***';
const SECRET_CONFIG = /^(?:requirepass|masterauth|tls-key-file-pass|tls-client-key-file-pass)$/i;
/** ACL SETUSER rules that carry a password or its hash: `>pw`, `<pw`, `#hash`, `!hash`. */
const SECRET_RULE = /^[<>#!]/;

/** The arguments after the command name, with every password masked. */
export function maskSecrets(args: readonly Arg[]): Arg[] {
	const { name, words } = commandName(args);
	const out = [...args];
	const mask = (i: number) => {
		if (i < out.length) out[i] = MASK;
	};
	switch (name) {
		case 'AUTH':
			mask(out.length - 1);
			break;
		case 'HELLO': {
			const at = out.findIndex((a, i) => i > 1 && upper(a) === 'AUTH');
			if (at !== -1) mask(at + 2);
			break;
		}
		case 'CONFIG SET':
			for (let i = 2; i < out.length - 1; i += 2) if (SECRET_CONFIG.test(text(out[i]))) mask(i + 1);
			break;
		case 'ACL SETUSER':
			for (let i = 3; i < out.length; i++) if (SECRET_RULE.test(text(out[i]))) mask(i);
			break;
		case 'MIGRATE':
			for (let i = 6; i < out.length; i++) {
				const word = upper(out[i]);
				if (word === 'AUTH') mask(i + 1);
				if (word === 'AUTH2') mask(i + 2);
				if (word === 'KEYS') break;
			}
			break;
	}
	return out.slice(words);
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

/** A key or argument for the log: its text when valid UTF-8, else `{base64}` (never decoded lossily). */
export function loggedArg(arg: Arg): LoggedArg {
	if (typeof arg === 'string') return arg;
	try {
		return utf8.decode(arg);
	} catch {
		return { base64: arg.toString('base64') };
	}
}

/** `WRONGTYPE`, `NOPERM`, `ERR`...: the first word of a Redis error; the message is never logged. */
export function errorCode(error: unknown): string {
	const message = error instanceof Error ? error.message : '';
	const code = /^([A-Z][A-Z0-9_-]*)\b/.exec(message)?.[1];
	if (code) return code;
	return error instanceof Error && error.name !== 'Error' ? error.name : 'UNKNOWN';
}
