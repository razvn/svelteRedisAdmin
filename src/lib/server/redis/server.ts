import type { RedisConnection } from './connection.ts';

/** `INFO` output parsed into sections of key/value pairs. */
export interface InfoReport {
	/** Parsed sections; the header lines (no section) live under `''`. */
	sections: Record<string, Record<string, string>>;
}

export interface ClientRow {
	[key: string]: string;
}

/** Pure INFO parser (unit-tested): `# Section` headers split the key: value lines. */
export function parseInfo(text: string): InfoReport {
	const sections: Record<string, Record<string, string>> = {};
	let current = '';
	sections[current] = {};
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed === '') continue;
		if (trimmed.startsWith('#')) {
			current = trimmed.replace(/^#+\s*/, '').toLowerCase();
			sections[current] ??= {};
			continue;
		}
		const separator = trimmed.indexOf(':');
		if (separator === -1) continue;
		sections[current][trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
	}
	return { sections };
}

/** Flat lookup across all sections (INFO keys are unique in practice). */
export function infoValue(info: InfoReport, key: string): string | undefined {
	for (const section of Object.values(info.sections)) {
		const value = section[key];
		if (value !== undefined) return value;
	}
	return undefined;
}

export async function getServerInfo(
	client: RedisConnection,
	section?: string
): Promise<InfoReport> {
	return parseInfo(await client.info(section));
}

/** Subset of CLIENT LIST parsed by node-redis (one row per connected client). */
export async function listClients(client: RedisConnection): Promise<ClientRow[]> {
	const rows = await client.clientList();
	return rows as unknown as ClientRow[];
}

export async function killClient(client: RedisConnection, id: string): Promise<void> {
	await client.sendCommand(['CLIENT', 'KILL', 'ID', id]);
}

export async function getConfig(
	client: RedisConnection,
	pattern = '*'
): Promise<Record<string, string>> {
	return (await client.configGet(pattern)) as Record<string, string>;
}

export async function setConfig(
	client: RedisConnection,
	parameter: string,
	value: string
): Promise<void> {
	await client.configSet({ [parameter]: value });
}

export interface SlowlogEntry {
	id: number;
	timestamp: number;
	durationMicros: number;
	command: string[];
	clientAddress: string | null;
	clientName: string | null;
}

export async function getSlowlog(client: RedisConnection, count = 50): Promise<SlowlogEntry[]> {
	const reply = (await client.sendCommand(['SLOWLOG', 'GET', String(count)])) as unknown[];
	return reply.map((raw) => {
		const entry = raw as unknown[];
		const command = (entry[3] ?? []) as unknown[];
		return {
			id: Number(entry[0]),
			timestamp: Number(entry[1]),
			durationMicros: Number(entry[2]),
			command: command.map((part) =>
				Buffer.isBuffer(part) ? JSON.stringify(part.toString('utf8')) : JSON.stringify(String(part))
			),
			clientAddress: entry[4] == null ? null : String(entry[4]),
			clientName: entry[5] == null ? null : String(entry[5])
		};
	});
}

export async function slowlogLength(client: RedisConnection): Promise<number> {
	return Number(await client.sendCommand(['SLOWLOG', 'LEN']));
}

export async function slowlogReset(client: RedisConnection): Promise<void> {
	await client.sendCommand(['SLOWLOG', 'RESET']);
}

/** Destructive: drop all keys of the current database (or the whole instance). */
export async function flush(client: RedisConnection, scope: 'db' | 'all'): Promise<void> {
	await (scope === 'db' ? client.flushDb() : client.flushAll());
}
