// See https://svelte.dev/docs/kit/types#app.d.ts
import type { ServerEntry } from '#lib/server/servers/types.ts';
import type { AppConfig, ServerConfig } from '#lib/server/config/schema.ts';
import type { SessionInfo } from '#lib/server/auth/session.ts';
import type { RedisConnection } from '#lib/server/redis/connection.ts';
import type { Translator } from '#lib/i18n/translator.ts';
import type { RequestAudit } from '#lib/server/audit/index.ts';

declare global {
	namespace App {
		interface Locals {
			/** Loaded configuration (shared, read-only). */
			config: AppConfig;
			/** Set when the configuration file is missing/broken; every page shows it. */
			configError: string | null;
			/** Session facts from the signed cookie; null when not authenticated. */
			session: SessionInfo | null;
			/** True when `config.login` is configured (login page enforced). */
			authRequired: boolean;
			/** Resolved interface language of the request. */
			locale: string;
			/** Translator bound to `locale` (server-side `t()` in load functions). */
			i18n: Translator;
			/**
			 * Id of the active server: its position in `config.Servers` (`"0"`…) or, for a server found by
			 * `ServerDiscovery`, `k8s:<namespace>:<service>`. Null outside server routes.
			 */
			serverId: string | null;
			/** Groups of the person (`header` plugin `headerGroups`), for Kubernetes RBAC. */
			groups: readonly string[];
			/** The servers this person may use (login list + RBAC), computed once per request. */
			servers: () => Promise<ServerEntry[]>;
			/** Active server definition; null outside server routes. */
			server: ServerConfig | null;
			/**
			 * Lazily opens a connection to the active server on the given database (default:
			 * the server's configured `db`). One connection per db per request; closed
			 * automatically after the response.
			 */
			redis: (db?: number) => Promise<RedisConnection>;
			/** Audit log of the request (`AuditLog`); a no-op when the log is off. */
			audit: RequestAudit;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
