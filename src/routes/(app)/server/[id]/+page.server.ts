import { error } from '@sveltejs/kit';
import { connectionErrorLabel } from '#lib/server/redis/connection.ts';
import { getServerInfo, infoValue } from '#lib/server/redis/server.ts';
import { serverName } from '#lib/server/config/schema.ts';
import { parseKeyspace, type KeyspaceEntry } from './keyspace.ts';
import type { PageServerLoad } from './$types';

export interface OverviewStats {
	version: string;
	uptimeDays: number;
	usedMemory: string;
	usedMemoryPeak?: string;
	clients: number;
	keys: number;
	hits: number;
	misses: number;
	hitRate: number | null;
	evicted: number;
	expired: number;
	bgsaveStatus: string;
	/** Seconds since `rdb_last_save_time`; null when unknown. */
	sinceLastSave: number | null;
}

export interface OverviewData {
	serverIndex: number;
	serverLabel: string;
	online: boolean;
	error: string | null;
	stats: OverviewStats | null;
	keyspace: KeyspaceEntry[];
}

export const load: PageServerLoad = async ({ locals }): Promise<OverviewData> => {
	const t = locals.i18n.t;
	if (!locals.server) error(404, t('Server not found'));
	const serverIndex = locals.serverIndex ?? 0;
	const serverLabel = serverName(locals.server);
	const server = locals.server;

	try {
		const client = await locals.redis();
		const info = await getServerInfo(client);
		const keys = await client.dbSize();

		const num = (key: string): number | undefined => {
			const raw = infoValue(info, key);
			return raw === undefined ? undefined : Number(raw);
		};

		const hits = num('keyspace_hits') ?? 0;
		const misses = num('keyspace_misses') ?? 0;
		const totalReads = hits + misses;
		const lastSave = num('rdb_last_save_time');

		return {
			serverIndex,
			serverLabel,
			online: true,
			error: null,
			stats: {
				version: infoValue(info, 'redis_version') ?? t('unknown'),
				uptimeDays: Math.floor((num('uptime_in_seconds') ?? 0) / 86_400),
				usedMemory: infoValue(info, 'used_memory_human') ?? t('unknown'),
				usedMemoryPeak: infoValue(info, 'used_memory_peak_human'),
				clients: num('connected_clients') ?? 0,
				keys,
				hits,
				misses,
				hitRate: totalReads > 0 ? Math.round((100 * hits) / totalReads) : null,
				evicted: num('evicted_keys') ?? 0,
				expired: num('expired_keys') ?? 0,
				bgsaveStatus: infoValue(info, 'rdb_last_bgsave_status') ?? t('unknown'),
				sinceLastSave:
					lastSave === undefined ? null : Math.max(0, Math.floor(Date.now() / 1000 - lastSave))
			},
			keyspace: parseKeyspace(info.sections['keyspace'] ?? {})
		};
	} catch (caught) {
		return {
			serverIndex,
			serverLabel,
			online: false,
			error: connectionErrorLabel(server, caught),
			stats: null,
			keyspace: []
		};
	}
};
