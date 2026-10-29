import type { LoginConfig } from '#lib/server/config/schema.ts';
import { verifyLogin } from './config.ts';
import type { AuthPlugin, PluginSession } from './types.ts';

/** Parse an `Authorization: Basic …` header against the login list. */
export function loginFromBasicAuth(
	config: { login?: LoginConfig[] },
	authorization: string | null
): PluginSession | null {
	if (!authorization) return null;
	const separator = authorization.indexOf(' ');
	if (separator === -1) return null;
	const scheme = authorization.slice(0, separator).toLowerCase();
	const encoded = authorization.slice(separator + 1);
	if (scheme !== 'basic' || encoded === '') return null;
	let decoded: string;
	try {
		decoded = Buffer.from(encoded, 'base64').toString('utf8');
	} catch {
		return null;
	}
	const colon = decoded.indexOf(':');
	if (colon === -1) return null;
	const entry = verifyLogin(config, decoded.slice(0, colon), decoded.slice(colon + 1));
	if (!entry) return null;
	return { username: entry.username, role: entry.role, servers: entry.servers ?? null };
}

/** The `http` plugin: HTTP Basic against the `login` list, no login page. */
export const httpPlugin: AuthPlugin = {
	name: 'http',
	async authenticate({ request, config }): Promise<PluginSession | null> {
		return loginFromBasicAuth(config, request.headers.get('authorization'));
	}
};
