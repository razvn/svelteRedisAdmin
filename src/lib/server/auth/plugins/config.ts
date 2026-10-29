import { createHash, timingSafeEqual } from 'node:crypto';
import { parseSessionToken } from '#lib/server/auth/session.ts';
import type { LoginConfig } from '#lib/server/config/schema.ts';
import type { AuthPlugin, PluginSession } from './types.ts';

/** Constant-time string comparison (sha256 digests have a fixed length). */
export function secretEquals(provided: string, expected: string): boolean {
	const a = createHash('sha256').update(provided, 'utf8').digest();
	const b = createHash('sha256').update(expected, 'utf8').digest();
	return timingSafeEqual(a, b);
}

/** Find a login entry by username (constant-time on the password when compared). */
export function findLogin(config: { login?: LoginConfig[] }, username: string): LoginConfig | null {
	return config.login?.find((entry) => entry.username === username) ?? null;
}

/** Verify a username/password pair against the login list. */
export function verifyLogin(
	config: { login?: LoginConfig[] },
	username: string,
	password: string
): LoginConfig | null {
	const entry = findLogin(config, username);
	if (!entry || !secretEquals(password, entry.password)) return null;
	return entry;
}

/**
 * The `config` plugin: the signed cookie (minted by the /login form) is the
 * source of truth for the username, role and server visibility.
 */
export const configPlugin: AuthPlugin = {
	name: 'config',
	async authenticate({ cookies, config }): Promise<PluginSession | null> {
		const session = parseSessionToken(cookies.get(config.cookieName), config.cookieSecret ?? '');
		if (!session) return null;
		const facts: PluginSession = { username: session.username, role: session.role };
		if (session.servers !== null) facts.servers = session.servers;
		return facts;
	}
};
