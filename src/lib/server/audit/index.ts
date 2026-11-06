/**
 * Per-person audit log (app-specific, `AuditLog` in config.json, docs/AUDIT.md). Each request gets
 * a `RequestAudit` (`locals.audit`) that knows who is acting, so routes only describe what happened.
 */
import type { AuditLogConfig } from '#lib/server/config/schema.ts';
import { formatLine, type Actor, type AuditBody } from './events.ts';
import { auditSink, type AuditSink } from './sink.ts';

export type { Actor, AuditBody, AuditEvent, DeniedReason, LoggedArg } from './events.ts';

/**
 * How the connection wrapper logs the commands it sees: `command` events for writes (default),
 * `console` events for every command (the console), or nothing (`quiet`: an import logs one event).
 */
export type CaptureMode = 'commands' | 'console' | 'quiet';

export interface RequestAudit {
	/** False when `AuditLog` is off: nothing is logged and connections are not wrapped. */
	readonly enabled: boolean;
	/** Log arguments of keyed commands too (`AuditLog.includeValues`). */
	readonly includeValues: boolean;
	/** Log one event; `actor` overrides the request's actor fields. No-op when the log is off. */
	write(body: AuditBody, actor?: Partial<Actor>): void;
	/** Fill in the active server once the request has resolved it. */
	setServer(server: Pick<Actor, 'server' | 'serverId'>): void;
	/** Current capture mode of the connection wrapper. */
	mode(): CaptureMode;
	/** Run `fn` with another capture mode (restored afterwards, even when `fn` throws). */
	capture<T>(mode: CaptureMode, fn: () => Promise<T>): Promise<T>;
}

export const noAudit: RequestAudit = {
	enabled: false,
	includeValues: false,
	write() {},
	setServer() {},
	mode: () => 'quiet',
	capture: (_mode, fn) => fn()
};

export function requestAudit(
	config: AuditLogConfig,
	actor: Actor,
	sink: AuditSink = auditSink(config),
	now: () => Date = () => new Date()
): RequestAudit {
	let current: Actor = { ...actor };
	let mode: CaptureMode = 'commands';
	return {
		enabled: true,
		includeValues: config.includeValues,
		write(body, override) {
			sink.write(
				formatLine(
					{ ts: now().toISOString(), ...current, ...override, ...body },
					config.maxArgLength
				)
			);
		},
		setServer(server) {
			current = { ...current, ...server };
		},
		mode: () => mode,
		async capture(next, fn) {
			const previous = mode;
			mode = next;
			try {
				return await fn();
			} finally {
				mode = previous;
			}
		}
	};
}
