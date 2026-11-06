/**
 * Audit log events: one JSON object per line answering "who did what, when, from where, on which
 * server". See docs/AUDIT.md.
 */

/** A key name or argument as logged: text when it is valid UTF-8, else its bytes in base64. */
export type LoggedArg = string | { base64: string };

/** Who acted, filled in by the request's audit (`locals.audit`). */
export interface Actor {
	/** Verified person (session username); null when nobody was verified. */
	identity: string | null;
	/** App role of the person (`admin`, `rw`, `ro`); null when nobody was verified. */
	role: string | null;
	/** `header` plugin with `headerGroups`: the person's groups. */
	groups?: string[];
	/** Server label (`name`, else host:port); null outside server pages. */
	server: string | null;
	/** Server id: position in `Servers` as text, or `k8s:<namespace>:<service>`; null outside server pages. */
	serverId: string | null;
	clientIp: string | null;
}

export type DeniedReason =
	/** `header`: identity header sent by a peer outside `auth.trustedProxies`. */
	| 'untrusted-proxy'
	/** `header`: identity header from a trusted proxy with an unusable value. */
	| 'invalid-identity'
	/** `config` login form or `http` Basic: wrong user name or password. */
	| 'access-denied'
	/** The server is not in the person's `servers` list. */
	| 'server-not-allowed'
	/** Kubernetes RBAC (`authorize`) refused the person on this server. */
	| 'not-authorized'
	/** Kubernetes RBAC could not be checked (API server unreachable, error answer). */
	| 'authorization-error'
	/** The person's role does not allow the action (`ro` writing, `rw` administering). */
	| 'role';

export type CommandOutcome = { ok: true } | { ok: false; errorCode: string };

/** What the logged command touched: always its keys, plus its arguments when they are logged. */
export interface CommandDetail {
	/** Database the command ran on. */
	db: number;
	/** Command name in upper case, with the subcommand for container commands (`CONFIG SET`). */
	command: string;
	keys: LoggedArg[];
	/** Arguments after the command name (secrets masked); absent when values are not logged. */
	args?: LoggedArg[];
}

export type AuditBody =
	| { event: 'session' }
	| ({ event: 'command' } & CommandDetail & CommandOutcome)
	| ({ event: 'console' } & CommandDetail & CommandOutcome)
	| { event: 'export'; db: number; filter?: string; keys: number }
	| { event: 'import'; db: number; total: number; imported: number; failed: number }
	| { event: 'logout' }
	/** `claimedUser`: the user name presented but not verified (the event's `identity` is null). */
	| { event: 'denied'; reason: DeniedReason; claimedUser?: string; action?: string };

export type AuditEvent = { ts: string } & Actor & AuditBody;

const MAX_CLAIMED_USER = 256;

function cut(arg: LoggedArg, max: number): { arg: LoggedArg; cut: boolean } {
	if (typeof arg === 'string') {
		return arg.length > max ? { arg: arg.slice(0, max), cut: true } : { arg, cut: false };
	}
	return arg.base64.length > max
		? { arg: { base64: arg.base64.slice(0, max) }, cut: true }
		: { arg, cut: false };
}

/** One JSON Lines record (no trailing newline). Longer keys/arguments are cut and the line flagged. */
export function formatLine(e: AuditEvent, maxArgLength: number): string {
	const { ts, event, identity, role, groups, server, serverId, clientIp, ...rest } = e;
	const body: Record<string, unknown> = { ...rest };
	let truncated = false;
	for (const field of ['keys', 'args'] as const) {
		const list = body[field];
		if (!Array.isArray(list)) continue;
		body[field] = (list as LoggedArg[]).map((arg) => {
			const result = cut(arg, maxArgLength);
			truncated ||= result.cut;
			return result.arg;
		});
	}
	if (typeof body.claimedUser === 'string') {
		body.claimedUser = body.claimedUser.slice(0, MAX_CLAIMED_USER);
	}
	if (typeof body.filter === 'string' && body.filter.length > maxArgLength) {
		body.filter = body.filter.slice(0, maxArgLength);
		truncated = true;
	}
	return JSON.stringify({
		ts,
		event,
		identity,
		role,
		...(groups && groups.length > 0 ? { groups } : {}),
		server,
		serverId,
		clientIp,
		...body,
		...(truncated ? { truncated: true } : {})
	});
}
