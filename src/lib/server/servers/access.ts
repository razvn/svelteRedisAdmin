/**
 * Who may use which server: the login `servers` list (configured servers), then Kubernetes RBAC for
 * servers with `authorize` (always the case for discovered ones, unless turned off).
 */
import { error } from '@sveltejs/kit';
import type { Params } from '#lib/i18n/interpolate.ts';
import { canAccessServer } from '#lib/server/auth/access.ts';
import type { SessionInfo } from '#lib/server/auth/session.ts';
import { authorizeIdentity, type Identity } from '#lib/server/kubernetes/rbac.ts';
import type { ServerEntry } from './types.ts';

export type ServerAccess =
	| { allowed: true }
	/** `hidden`: not in the person's list (answered as 404, so its existence is not leaked). */
	| { allowed: false; reason: 'hidden' }
	/** `denied`: RBAC of `namespace` refuses the person (403). */
	| { allowed: false; reason: 'denied'; namespace: string }
	/** `error`: RBAC could not be checked (503); `error` goes to the server log only. */
	| { allowed: false; reason: 'error'; error: unknown };

type Authorize = typeof authorizeIdentity;

export async function checkServerAccess(
	session: Pick<SessionInfo, 'servers' | 'username'>,
	groups: readonly string[],
	entry: ServerEntry,
	authorize: Authorize = authorizeIdentity
): Promise<ServerAccess> {
	if (entry.index !== null && !canAccessServer(session, entry.index)) {
		return { allowed: false, reason: 'hidden' };
	}
	const rules = entry.server.authorize;
	if (!rules) return { allowed: true };
	const identity: Identity = { user: session.username, groups };
	try {
		const decision = await authorize(identity, rules);
		return decision.allowed
			? { allowed: true }
			: { allowed: false, reason: 'denied', namespace: rules.namespace };
	} catch (error) {
		return { allowed: false, reason: 'error', error };
	}
}

/** The servers the person may use. A server whose RBAC check fails is hidden (and logged). */
export async function visibleServers(
	session: Pick<SessionInfo, 'servers' | 'username'>,
	groups: readonly string[],
	entries: readonly ServerEntry[],
	authorize: Authorize = authorizeIdentity
): Promise<ServerEntry[]> {
	const decisions = await Promise.all(
		entries.map((entry) => checkServerAccess(session, groups, entry, authorize))
	);
	return entries.filter((entry, i) => {
		const decision = decisions[i];
		if (decision.allowed === false && decision.reason === 'error') {
			console.error(`[rbac] cannot check access to server ${entry.id}:`, decision.error);
		}
		return decision.allowed;
	});
}

type Translate = (msgid: string, params?: Params) => string;

/**
 * Turn a refusal into the HTTP error of the request: 404 for a hidden server (its existence is not
 * leaked), 403 when RBAC denies, 503 when RBAC cannot be checked (cause logged, never shown).
 */
export function assertServerAccess(access: ServerAccess, serverId: string, t: Translate): void {
	if (access.allowed) return;
	if (access.reason === 'hidden') error(404, t('Server not found'));
	if (access.reason === 'denied') {
		error(
			403,
			t('You do not have access to this server (Kubernetes namespace {namespace}).', {
				namespace: access.namespace
			})
		);
	}
	console.error(`[rbac] cannot check access to server ${serverId}:`, access.error);
	error(503, t('Cannot verify your access right now.'));
}
