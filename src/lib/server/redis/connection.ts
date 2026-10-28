import { createClient } from 'redis';
import { buffers } from './type-mapping.ts';
import type { ServerConfig } from '#lib/server/config/schema.ts';

/** An open connection to one server, already SELECTed onto a database. */
export type RedisConnection = Awaited<ReturnType<typeof createConnection>>;

/**
 * Open a connection to one server and SELECT the given database. The caller must
 * `quit()` it — we keep no pool so config changes and switching servers stay simple.
 */
export async function createConnection(server: ServerConfig, db: number) {
	if (!Number.isInteger(db) || db < 0) throw new Error(`Invalid database index: ${db}`);
	const client = createClient({
		socket: server.path
			? { path: server.path, tls: server.tls }
			: server.tls
				? { host: server.host, port: server.port, tls: true as const }
				: { host: server.host, port: server.port },
		username: server.username,
		password: server.auth,
		database: db
	});
	await client.connect();
	return client;
}

/**
 * The same connection but returning `Buffer`s for bulk strings, so binary values
 * survive without lossy UTF-8 decoding. Same underlying socket; commands issued on
 * the buffers view take the alternate reply mapping.
 */
export function buffersView(client: RedisConnection) {
	return buffers(client);
}

/** Human-readable message for a failed connection (never leaks credentials). */
export function connectionErrorLabel(server: ServerConfig, error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	const target = server.path ?? `${server.host}:${server.port}`;
	return `Cannot connect to ${target}: ${message}`;
}
