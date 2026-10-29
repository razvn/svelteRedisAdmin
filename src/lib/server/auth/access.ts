import { error } from '@sveltejs/kit';
import type { SessionInfo } from './session.ts';

/** App roles: admin (everything), rw (data read/write), ro (read-only). */
export type Role = 'admin' | 'rw' | 'ro';

export const ROLES: readonly Role[] = ['admin', 'rw', 'ro'];

/** Everything below admin is read-only for admin surfaces (CONFIG SET, KILL, RESET). */
export function canAdmin(session: Pick<SessionInfo, 'role'> | null): boolean {
	return session?.role === 'admin';
}

/** Data mutations (key writes, flush, console, CLIENT KILL, SLOWLOG RESET). */
export function canWrite(session: Pick<SessionInfo, 'role'> | null): boolean {
	return session?.role === 'admin' || session?.role === 'rw';
}

/** Per-user server visibility: `servers: null` means every configured server. */
export function canAccessServer(
	session: Pick<SessionInfo, 'servers'> | null,
	index: number
): boolean {
	if (!session || session.servers === null) return true;
	return session.servers.includes(index);
}

/**
 * Clamp a plugin/login-provided server list to the configured servers.
 * `null`/`undefined` (absent) passes through as "all servers".
 */
export function resolveServers(
	config: { Servers: unknown[] },
	servers: number[] | null | undefined
): number[] | null {
	if (servers === null || servers === undefined) return null;
	const unique = new Set(servers);
	const allowed: number[] = [];
	for (const index of unique) {
		if (Number.isInteger(index) && index >= 0 && index < config.Servers.length) allowed.push(index);
	}
	return allowed.sort((a, b) => a - b);
}

/** The slice of `App.Locals` the guards need (keeps the guards unit-testable). */
export interface GuardLocals {
	session: SessionInfo | null;
	serverIndex: number | null;
	i18n: { t: (msgid: string, ...args: never[]) => string };
}

/** 404 (not 403) so the existence of a hidden server is not leaked. */
export function assertServerAccess(locals: GuardLocals): void {
	if (
		locals.session &&
		locals.serverIndex !== null &&
		!canAccessServer(locals.session, locals.serverIndex)
	) {
		error(404, locals.i18n.t('Server not found'));
	}
}

export function assertWrite(locals: GuardLocals): void {
	if (!canWrite(locals.session)) {
		error(403, locals.i18n.t('You are not allowed to modify data.'));
	}
}

export function assertAdmin(locals: GuardLocals): void {
	if (!canAdmin(locals.session)) {
		error(403, locals.i18n.t('Admin access required.'));
	}
}
