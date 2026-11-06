/**
 * The servers of a request: the configured `Servers`, then the ones `ServerDiscovery` currently finds.
 * Configured servers keep their position as id (so login `servers` lists and old URLs keep working);
 * discovered ones come and go and are named by their stable id (`k8s:<namespace>:<service>`).
 */
import type { AppConfig, ServerConfig } from '#lib/server/config/schema.ts';
import { createDiscovery, type Discovery, type DiscoveryOptions } from './kubernetes.ts';
import type { ServerEntry } from './types.ts';

export type { ServerEntry } from './types.ts';

let active: { settings: object; discovery: Discovery } | undefined;

/** The discovery of this configuration: one per process, replaced when the config changes. */
export function discoveryFor(config: AppConfig, options?: DiscoveryOptions): Discovery | null {
	if (!config.ServerDiscovery) return null;
	if (active?.settings !== config.ServerDiscovery) {
		active = {
			settings: config.ServerDiscovery,
			discovery: createDiscovery(config.ServerDiscovery, options)
		};
	}
	return active.discovery;
}

/** The servers of `Servers`, with their position as id. */
export function configuredServers(config: Pick<AppConfig, 'Servers'>): ServerEntry[] {
	return config.Servers.map((server, index) => ({ id: String(index), index, server }));
}

/** The configured server named by `id` (its position), null when it is not one. */
export function findConfiguredServer(
	config: Pick<AppConfig, 'Servers'>,
	id: string
): ServerEntry | null {
	if (!/^\d{1,6}$/.test(id)) return null;
	const index = Number(id);
	const server = config.Servers[index];
	return server ? { id, index, server } : null;
}

/**
 * Every server: configured, then discovered. Throws when discovery has no list yet and the first
 * listing fails (later failures keep the previous list).
 */
export async function listServers(config: AppConfig): Promise<ServerEntry[]> {
	const discovery = discoveryFor(config);
	const configured = configuredServers(config);
	if (!discovery) return configured;
	return [...configured, ...(await discovery.servers())];
}

/** The server named by `id`: a position in `Servers` or a discovery id. Null when unknown. */
export async function findServer(config: AppConfig, id: string): Promise<ServerEntry | null> {
	const configured = findConfiguredServer(config, id);
	if (configured) return configured;
	const discovery = discoveryFor(config);
	if (!discovery || !id.startsWith('k8s:')) return null;
	return (await discovery.servers()).find((entry) => entry.id === id) ?? null;
}

/** The connection settings of `entry`: a discovered server gets the password of its Secret. */
export async function connectionSettings(
	config: AppConfig,
	entry: ServerEntry
): Promise<ServerConfig> {
	const discovery = discoveryFor(config);
	if (!entry.discovered || !discovery) return entry.server;
	return { ...entry.server, ...(await discovery.credentials(entry)) };
}
