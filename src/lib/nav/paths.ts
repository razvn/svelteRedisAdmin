/** Shape accepted by `resolve()` as a plain pathname (no leading slash). */
export type RuntimePath = `server/${string}` & {};

/**
 * `resolve()` from `$app/paths` takes pathnames WITHOUT the leading slash (a leading slash means
 * "route id"). Our URL helpers return normal absolute paths, so strip it: `resolve(bare(path))`.
 *
 * The return type is a pathname template type on purpose: `resolve` only accepts the literal
 * pathnames known to the generated route types, and ours are built at runtime from server ids,
 * database indexes and key names.
 */
export const bare = (path: string): RuntimePath =>
	(path.startsWith('/') ? path.slice(1) : path) as RuntimePath;

/** `/server/{id}` — the server overview. */
export const serverHref = (id: number) => `/server/${id}`;

/** `/server/{id}/info` etc. */
export const serverTabHref = (id: number, tab: string) =>
	tab === 'overview' ? serverHref(id) : `/server/${id}/${tab}`;

/** `/server/{id}/db/{db}` — the key browser. */
export const dbHref = (id: number, db: number) => `/server/${id}/db/${db}`;

/** `/server/{id}/db/{db}/new-key`, `/export`, `/import`. */
export const dbTabHref = (id: number, db: number, tab: string) => `${dbHref(id, db)}/${tab}`;

/** `/server/{id}/db/{db}/key/{key…}` — the key view. Key segments are URI-encoded. */
export function keyHref(id: number, db: number, key: string): string {
	const encoded = key
		.split('/')
		.map((segment) => encodeURIComponent(segment))
		.join('/');
	return `${dbHref(id, db)}/key/${encoded}`;
}

/** Server label for the top bar (`user@host` uses the host part). */
export const serverHost = (server: { host: string; port: number; path?: string }) =>
	server.path ?? server.host;
