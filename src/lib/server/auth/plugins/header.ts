import { ROLES, type Role } from '#lib/server/auth/access.ts';
import type { AuthPlugin, PluginSession } from './types.ts';

function roleFromHeader(value: string | null): Role {
	return value !== null && ROLES.includes(value as Role) ? (value as Role) : 'admin';
}

function serversFromHeader(value: string | null): number[] | null | undefined {
	if (value === null) return undefined;
	const indexes = value
		.split(',')
		.map((part) => Number(part.trim()))
		.filter((index) => Number.isInteger(index) && index >= 0);
	return indexes;
}

/**
 * The `header` plugin: trust an identity header set by the ingress/proxy
 * (oauth2-proxy, Istio, Cloudflare Access…). The deployment must guarantee the
 * edge strips/overwrites the header — the app cannot tell on its own.
 */
export const headerPlugin: AuthPlugin = {
	name: 'header',
	async authenticate({ request, config }): Promise<PluginSession | null> {
		const headerName = config.auth.header;
		if (!headerName) return null; // refused at load time by getAuthPlugin
		const username = request.headers.get(headerName)?.trim();
		if (!username) return null;
		const facts: PluginSession = {
			username,
			role: roleFromHeader(
				config.auth.headerRole ? request.headers.get(config.auth.headerRole) : null
			)
		};
		const servers = serversFromHeader(
			config.auth.headerServers ? request.headers.get(config.auth.headerServers) : null
		);
		if (servers !== undefined) facts.servers = servers;
		return facts;
	}
};
