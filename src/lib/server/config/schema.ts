import { z } from 'zod';

/**
 * One entry of `Servers` — keys follow phpRedisAdmin's `includes.config.php`
 * (`host`, `port`, `auth`, `db`, `filter`, `databases`, `separator`, `name`).
 */
export const serverSchema = z.object({
	/** Display name; falls back to `host:port`. */
	name: z.string().trim().min(1).optional(),
	host: z.string().trim().min(1).default('127.0.0.1'),
	port: z.number().int().min(1).max(65535).default(6379),
	/** Path to a unix socket (uses `path` instead of `host`/`port`). */
	path: z.string().trim().min(1).optional(),
	/** requirepass-style password (`auth` in phpRedisAdmin). */
	auth: z.string().optional(),
	/** Redis 6+ ACL username. */
	username: z.string().optional(),
	/** Database the browser opens by default. */
	db: z.number().int().min(0).default(0),
	/** Shown in the sidebar (`databases`); capped because DBSIZE per db is expensive. */
	databases: z.number().int().min(1).max(256).default(16),
	/** Glob filter applied to key listings (`filter`). */
	filter: z.string().optional(),
	/** Separator used to build key trees (`separator`). */
	separator: z.string().min(1).default(':'),
	tls: z.boolean().default(false)
});
export type ServerConfig = z.infer<typeof serverSchema>;

export const loginSchema = z.object({
	username: z.string().trim().min(1),
	password: z.string().min(1),
	/** App role: admin (everything), rw (data read/write), ro (read-only). */
	role: z.enum(['admin', 'rw', 'ro']).default('admin'),
	/** Server indexes this user may see; absent = all servers. */
	servers: z.array(z.number().int().min(0)).optional()
});
export type LoginConfig = z.infer<typeof loginSchema>;

/** Pluggable authentication (`auth` in config.json). */
export const authConfigSchema = z.object({
	/** Built-in plugins: `config` (login form), `http` (Basic), `header` (ingress identity). */
	plugin: z.string().trim().min(1).default('config'),
	/** `header` plugin: request header carrying the username (e.g. `x-forwarded-user`). */
	header: z.string().trim().min(1).optional(),
	/** `header` plugin: request header carrying the role (defaults to `admin`). */
	headerRole: z.string().trim().min(1).optional(),
	/** `header` plugin: request header carrying a comma-separated server index list. */
	headerServers: z.string().trim().min(1).optional()
});

export const appConfigSchema = z.object({
	Servers: z.array(serverSchema).min(1),
	/** When absent, the app auto-authenticates (phpRedisAdmin's default install). */
	login: z.array(loginSchema).optional(),
	/** Authentication plugin selection (`auth`); defaults to the config login list. */
	auth: authConfigSchema.prefault({}),
	/** HMAC secret for the session cookie. Required when `login` is configured. */
	cookieSecret: z.string().min(16).optional(),
	cookieName: z.string().trim().min(1).default('sra_session'),
	/** Session lifetime in seconds (default 24 h). */
	cookieLifetime: z.number().int().min(60).default(86_400),
	/** Keys listed per SCAN page (`maxKeyListSize` in phpRedisAdmin). */
	maxKeyListSize: z.number().int().min(1).max(1000).default(100),
	/** Values longer than this are truncated for display (`maxValueLength`). */
	maxValueLength: z.number().int().min(64).default(8192)
});
export type AppConfig = z.infer<typeof appConfigSchema>;

/** Display name of a server entry (`name` or `host:port` / socket path). */
export function serverName(server: ServerConfig): string {
	if (server.name) return server.name;
	return server.path ? server.path : `${server.host}:${server.port}`;
}
