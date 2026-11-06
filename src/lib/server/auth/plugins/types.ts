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
	/** Groups of the person (`header` plugin), for Kubernetes RBAC. */
	groups?: string[];
}

export interface AuthPlugin {
	name: string;
	/** Return session facts for a request, or null when unauthenticated. */
	authenticate(ctx: {
		request: Request;
		cookies: Cookies;
		config: AppConfig;
		/** Direct TCP peer of the request (the proxy, behind one); null when unknown. */
		peerAddress: string | null;
	}): Promise<PluginSession | null>;
}
