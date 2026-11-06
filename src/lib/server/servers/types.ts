import type { ServerConfig } from '#lib/server/config/schema.ts';

/** A server the app can open: configured in `Servers`, or found by `ServerDiscovery`. */
export interface ServerEntry {
	/**
	 * How URLs name it: the position in `Servers` (`"0"`, `"1"`…) for a configured server,
	 * `k8s:<namespace>:<service>` for a discovered one.
	 */
	id: string;
	/** Position in `Servers` (what login `servers` lists refer to); null when discovered. */
	index: number | null;
	server: ServerConfig;
	/** Where a discovered server comes from. */
	discovered?: { namespace: string; service: string };
}
