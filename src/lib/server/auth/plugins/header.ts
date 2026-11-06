import { ROLES, type Role } from '#lib/server/auth/access.ts';
import { isTrustedProxy } from '#lib/server/auth/trusted-proxy.ts';
import type { AuthPlugin, PluginSession } from './types.ts';

/** Control characters, or a comma: `Headers.get` joins a header sent twice with ", ". */
const INVALID_USER = /[\p{Cc},]/u;

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

function groupsFromHeader(value: string | null): string[] {
	return (value ?? '')
		.split(',')
		.map((group) => group.trim())
		.filter((group) => group !== '' && !/\p{Cc}/u.test(group));
}

/**
 * The `header` plugin: trust an identity header set by the ingress/proxy (oauth2-proxy, Istio,
 * Cloudflare Access…), but only on requests whose TCP peer is one of `auth.trustedProxies`: from
 * anyone else the headers are ignored, because anyone can send them.
 */
export const headerPlugin: AuthPlugin = {
	name: 'header',
	async authenticate({ request, config, peerAddress, deny }): Promise<PluginSession | null> {
		const headerName = config.auth.header;
		if (!headerName) return null; // refused at load time by getAuthPlugin
		const claimed = request.headers.get(headerName);
		if (!isTrustedProxy(config.auth.trustedProxies, peerAddress)) {
			if (claimed !== null) deny?.('untrusted-proxy', claimed);
			return null;
		}
		const username = claimed?.trim();
		if (!username) return null;
		if (INVALID_USER.test(username)) {
			deny?.('invalid-identity', username);
			return null;
		}
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
		if (config.auth.headerGroups) {
			facts.groups = groupsFromHeader(request.headers.get(config.auth.headerGroups));
		}
		return facts;
	}
};
