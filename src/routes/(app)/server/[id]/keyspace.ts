/**
 * One `dbN` line of the INFO `keyspace` section
 * (`db0:keys=1,expires=0,avg_ttl=0` parsed by `parseInfo`).
 */
export interface KeyspaceEntry {
	db: number;
	keys: number;
	expires: number;
	/** Average TTL in milliseconds. */
	avgTtl: number;
}

/**
 * Pure parser for the INFO `keyspace` section as returned by `parseInfo`
 * (`{ 'db0': 'keys=1,expires=0,avg_ttl=0', ... }`), sorted by database index.
 */
export function parseKeyspace(section: Record<string, string>): KeyspaceEntry[] {
	const entries: KeyspaceEntry[] = [];
	for (const [name, value] of Object.entries(section)) {
		const match = /^db(\d+)$/.exec(name);
		if (!match) continue;
		const fields = new Map(
			value.split(',').map((pair) => {
				const separator = pair.indexOf('=');
				return separator === -1
					? [pair, '']
					: [pair.slice(0, separator), pair.slice(separator + 1)];
			})
		);
		entries.push({
			db: Number(match[1]),
			keys: Number(fields.get('keys') ?? 0),
			expires: Number(fields.get('expires') ?? 0),
			avgTtl: Number(fields.get('avg_ttl') ?? 0)
		});
	}
	return entries.sort((a, b) => a.db - b.db);
}
