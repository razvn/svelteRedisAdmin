import { createConnection, connectionErrorLabel } from '#lib/server/redis/connection.ts';
import { getServerInfo, infoValue } from '#lib/server/redis/server.ts';
import type { ServerConfig } from '#lib/server/config/schema.ts';
import { serverName } from '#lib/server/config/schema.ts';
import { connectionSettings } from '#lib/server/servers/index.ts';
import type { PageServerLoad } from './$types';

export interface ServerSummary {
	/** Server id (position in `Servers`, or `k8s:<namespace>:<service>`). */
	id: string;
	label: string;
	online: boolean;
	error?: string;
	version?: string;
	usedMemory?: string;
	clients?: number;
	keys?: number;
	uptimeDays?: number;
}

async function probe(server: ServerConfig): Promise<Partial<ServerSummary>> {
	const client = await createConnection(server, server.db);
	try {
		const info = await getServerInfo(client);
		const clients = infoValue(info, 'connected_clients');
		return {
			version: infoValue(info, 'redis_version'),
			usedMemory: infoValue(info, 'used_memory_human'),
			clients: clients === undefined ? undefined : Number(clients),
			keys: Number(await client.dbSize()),
			uptimeDays:
				Number(infoValue(info, 'uptime_in_seconds') ?? 0) > 0
					? Math.floor(Number(infoValue(info, 'uptime_in_seconds')) / 86_400)
					: undefined
		};
	} finally {
		await client.quit();
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	// Only the servers this person may use are listed and probed (same rule as the sidebar).
	const visible = await locals.servers();
	const summaries: ServerSummary[] = await Promise.all(
		visible.map(async (entry) => {
			const base: ServerSummary = { id: entry.id, label: serverName(entry.server), online: false };
			let server: ServerConfig = entry.server;
			try {
				server = await connectionSettings(locals.config, entry);
				return { ...base, online: true, ...(await probe(server)) };
			} catch (error) {
				return { ...base, error: connectionErrorLabel(server, error) };
			}
		})
	);
	return { servers: summaries };
};
