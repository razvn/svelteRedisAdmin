import type { RedisConnection } from './connection.ts';
import { toWireValue } from '#lib/value.ts';

/** Raised for un-parseable command lines (unterminated quotes, bad escapes). */
export class ConsoleError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConsoleError';
	}
}

/**
 * Split a command line the way redis-cli does: whitespace-separated arguments,
 * with `"double quoted"` arguments honouring `\n \r \t \" \\` and `\xHH` escapes
 * and `'single quoted'` arguments taken literally. Throws a `ConsoleError` for
 * an unterminated quote or an invalid `\xHH` escape.
 */
export function tokenizeCommand(input: string): string[] {
	const tokens: string[] = [];
	let i = 0;
	while (i < input.length) {
		const start = input[i];
		if (/\s/.test(start)) {
			i++;
			continue;
		}
		if (start === '"' || start === "'") {
			const quote = start;
			i++;
			let token = '';
			let closed = false;
			while (i < input.length) {
				const char = input[i];
				if (char === quote) {
					closed = true;
					i++;
					break;
				}
				if (quote === '"' && char === '\\') {
					const escape = input[i + 1];
					if (escape === 'x') {
						const hex = input.slice(i + 2, i + 4);
						if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
							throw new ConsoleError(
								`Invalid \\xHH escape in double-quoted argument (got "\\x${input.slice(i + 2, i + 4)}")`
							);
						}
						token += String.fromCharCode(Number.parseInt(hex, 16));
						i += 4;
						continue;
					}
					if (escape === 'n') token += '\n';
					else if (escape === 'r') token += '\r';
					else if (escape === 't') token += '\t';
					else if (escape === '"') token += '"';
					else if (escape === '\\') token += '\\';
					else token += char + (escape ?? '');
					i += 2;
					continue;
				}
				token += char;
				i++;
			}
			if (!closed) {
				throw new ConsoleError(
					`Unterminated ${quote === '"' ? 'double' : 'single'}-quoted argument`
				);
			}
			tokens.push(token);
			continue;
		}
		let token = '';
		while (i < input.length && !/\s/.test(input[i])) {
			token += input[i];
			i++;
		}
		tokens.push(token);
	}
	return tokens;
}

/**
 * Inverse of the tokenizer for display: join arguments with spaces, quoting the
 * ones that contain whitespace (or are empty) and escaping what would break out.
 */
export function formatTokens(tokens: string[]): string {
	return tokens
		.map((token) => {
			if (!/\s/.test(token) && token !== '') return token;
			return `"${token.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`;
		})
		.join(' ');
}

/** JSON-safe rendering of a Redis reply, safe to cross the network boundary. */
export type WireReply =
	| { kind: 'text'; text: string }
	| { kind: 'binary'; base64: string }
	| { kind: 'number'; value: string }
	| { kind: 'null' }
	| { kind: 'status'; text: string }
	| { kind: 'error'; text: string }
	| { kind: 'array'; items: WireReply[] }
	| { kind: 'map'; entries: [WireReply, WireReply][] };

/** Encode one raw node-redis reply (recursively) into its JSON-safe form. */
export function encodeReply(reply: unknown): WireReply {
	if (reply === null || reply === undefined) return { kind: 'null' };
	if (typeof reply === 'number' || typeof reply === 'bigint') {
		return { kind: 'number', value: String(reply) };
	}
	if (typeof reply === 'string') {
		// node-redis surfaces error replies as exceptions, so a plain string is a
		// simple status reply (RedisError replies never get this far).
		return { kind: 'status', text: reply };
	}
	if (Buffer.isBuffer(reply)) return toWireValue(reply);
	if (reply instanceof Uint8Array) return toWireValue(reply);
	if (reply instanceof Map) {
		return {
			kind: 'map',
			entries: Array.from(reply.entries()).map(
				([key, value]) => [encodeReply(key), encodeReply(value)] as [WireReply, WireReply]
			)
		};
	}
	if (Array.isArray(reply)) return { kind: 'array', items: reply.map(encodeReply) };
	if (reply instanceof Error) return { kind: 'error', text: reply.message };
	return { kind: 'status', text: String(reply) };
}

export interface ConsoleResult {
	command: string[];
	ok: boolean;
	durationMs: number;
	reply: WireReply;
}

/** Commands we never execute from the console (one hangs the socket, one kills the server). */
const BLOCKED = new Set(['SHUTDOWN', 'MONITOR']);

const DEFAULT_MAX_COMMANDS = 20;

/**
 * Run a multi-line console batch: one command per line, `#` comments and empty
 * lines skipped, commands executed sequentially on the given connection. Errors
 * (parse or Redis) become `{ok: false}` results; execution never throws.
 */
export async function runCommands(
	client: RedisConnection,
	input: string,
	options?: { maxCommands?: number }
): Promise<ConsoleResult[]> {
	const maxCommands = options?.maxCommands ?? DEFAULT_MAX_COMMANDS;
	const results: ConsoleResult[] = [];
	for (const rawLine of input.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line === '' || line.startsWith('#')) continue;

		let tokens: string[];
		try {
			tokens = tokenizeCommand(line);
		} catch (caught) {
			results.push({
				command: [],
				ok: false,
				durationMs: 0,
				reply: { kind: 'error', text: caught instanceof Error ? caught.message : String(caught) }
			});
			continue;
		}

		if (results.length >= maxCommands) {
			results.push({
				command: tokens,
				ok: false,
				durationMs: 0,
				reply: {
					kind: 'error',
					text: `Command limit reached (${maxCommands} per run) — this line was not executed.`
				}
			});
			continue;
		}

		if (tokens.length > 0 && BLOCKED.has(tokens[0].toUpperCase())) {
			results.push({
				command: tokens,
				ok: false,
				durationMs: 0,
				reply: {
					kind: 'error',
					text: `${tokens[0].toUpperCase()} is not allowed from the console.`
				}
			});
			continue;
		}

		const started = performance.now();
		try {
			const reply = await client.sendCommand(tokens);
			results.push({
				command: tokens,
				ok: true,
				durationMs: performance.now() - started,
				reply: encodeReply(reply)
			});
		} catch (caught) {
			results.push({
				command: tokens,
				ok: false,
				durationMs: performance.now() - started,
				reply: { kind: 'error', text: caught instanceof Error ? caught.message : String(caught) }
			});
		}
	}
	return results;
}
