/**
 * The one place where the person's Redis commands are seen: every command of a request connection
 * (typed methods, `buffers()` views and raw `sendCommand` alike) goes through `sendCommand` of the
 * client node-redis wraps, which is replaced here.
 */
import type { RedisConnection } from '#lib/server/redis/connection.ts';
import {
	errorCode,
	isAdminCommand,
	isAuditedCommand,
	knownKeys,
	loggedArg,
	maskSecrets,
	commandName,
	type Arg
} from './commands.ts';
import type { CommandDetail } from './events.ts';
import type { RequestAudit } from './index.ts';

type SendCommand = (args: Arg[], options?: unknown) => Promise<unknown>;

/** node-redis keeps the real client behind `_self`; views (`withCommandOptions`) inherit from it. */
interface ClientCore {
	sendCommand: SendCommand;
}

function coreOf(client: RedisConnection): ClientCore {
	const core = (client as unknown as { _self?: ClientCore })._self;
	if (!core || typeof core.sendCommand !== 'function') {
		throw new Error('Unexpected node-redis client shape: cannot install the audit log');
	}
	return core;
}

/** Keys of any command, asking the server (`COMMAND GETKEYS`) for the ones the list does not know. */
async function keysOf(args: Arg[], send: SendCommand): Promise<Arg[]> {
	const known = knownKeys(args);
	if (known) return known;
	try {
		const reply = await send(['COMMAND', 'GETKEYS', ...args]);
		return Array.isArray(reply) ? (reply as Arg[]) : [];
	} catch {
		// No key arguments, unknown command, or COMMAND refused by the ACL.
		return [];
	}
}

/**
 * Log the person's commands on `client` (in place), on database `db` (followed through `SELECT`).
 * Returns the undo.
 */
export function installAudit(client: RedisConnection, audit: RequestAudit, db: number): () => void {
	const core = coreOf(client);
	const hadOwn = Object.hasOwn(core, 'sendCommand');
	const original = core.sendCommand;
	const send: SendCommand = (args, options) => original.call(core, args, options);
	let currentDb = db;

	core.sendCommand = async function (args: Arg[], options?: unknown) {
		const mode = audit.mode();
		const name = commandName(args).name;
		const logged = mode === 'console' || (mode === 'commands' && isAuditedCommand(args));
		if (!logged) {
			const reply = await send(args, options);
			if (name === 'SELECT') currentDb = Number(args[1]);
			return reply;
		}

		const ranOn = currentDb;
		const keys = await keysOf(args, send);
		const withArgs = audit.includeValues || isAdminCommand(args);
		const detail: CommandDetail = {
			db: ranOn,
			command: name,
			keys: keys.map(loggedArg),
			...(withArgs ? { args: maskSecrets(args).map(loggedArg) } : {})
		};
		const event = mode === 'console' ? 'console' : 'command';
		let reply: unknown;
		try {
			reply = await send(args, options);
		} catch (caught) {
			audit.write({ event, ...detail, ok: false, errorCode: errorCode(caught) });
			throw caught;
		}
		if (name === 'SELECT') currentDb = Number(args[1]);
		audit.write({ event, ...detail, ok: true });
		return reply;
	};

	return () => {
		if (hadOwn) core.sendCommand = original;
		else delete (core as Partial<ClientCore>).sendCommand;
	};
}
