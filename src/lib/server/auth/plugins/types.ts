import type { Cookies } from '@sveltejs/kit';
import type { AppConfig } from '#lib/server/config/schema.ts';
import type { Role } from '#lib/server/auth/access.ts';

/** Facts an authentication plugin derives from a request. */
export interface PluginSession {
	username: string;
	/** Defaults to `admin` when the plugin does not provide one. */
	role?: Role;
	/** Server indexes the user may see; `null`/absent = all servers. */
	servers?: number[] | null;
}

export interface AuthPlugin {
	name: string;
	/** Return session facts for a request, or null when unauthenticated. */
	authenticate(ctx: {
		request: Request;
		cookies: Cookies;
		config: AppConfig;
	}): Promise<PluginSession | null>;
}
