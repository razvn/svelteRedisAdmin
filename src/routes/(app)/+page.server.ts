import { createConnection, connectionErrorLabel } from '#lib/server/redis/connection.ts';
import { getServerInfo, infoValue } from '#lib/server/redis/server.ts';
import type { ServerConfig } from '#lib/server/config/schema.ts';
import { serverName } from '#lib/server/config/schema.ts';
import type { PageServerLoad } from './$types';

export interface ServerSummary {
	index: number;
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
	const summaries: ServerSummary[] = await Promise.all(
		locals.config.Servers.map(async (server, index) => {
			const base: ServerSummary = { index, label: serverName(server), online: false };
			try {
				return { ...base, online: true, ...(await probe(server)) };
			} catch (error) {
				return { ...base, error: connectionErrorLabel(server, error) };
			}
		})
	);
	return { servers: summaries };
};
