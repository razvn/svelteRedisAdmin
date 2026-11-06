/**
 * Session detection for the audit log: a signed browser cookie holding who was last seen, on which
 * server and when. A request starts a new session when the marker is missing, tampered with, older
 * than the idle limit, or belongs to another person or server. Works with every auth plugin.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { z } from 'zod';

export const AUDIT_COOKIE = 'sra_audit';
const CONTEXT = 'svelteRedisAdmin audit marker v1';

const markerSchema = z.object({
	user: z.string(),
	server: z.string().nullable(),
	seen: z.number()
});
type Marker = z.infer<typeof markerSchema>;

/** Without `cookieSecret` the marker is signed with a key of this process (a restart starts new sessions). */
const processKey = randomBytes(32);

function sign(payload: string, secret: string | undefined): Buffer {
	const key = secret ? `${CONTEXT}\0${secret}` : processKey;
	return createHmac('sha256', key).update(payload).digest();
}

function seal(marker: Marker, secret: string | undefined): string {
	const payload = Buffer.from(JSON.stringify(marker), 'utf8').toString('base64url');
	return `${payload}.${sign(payload, secret).toString('base64url')}`;
}

function open(token: string | undefined, secret: string | undefined): Marker | null {
	if (!token) return null;
	const dot = token.lastIndexOf('.');
	if (dot === -1) return null;
	const payload = token.slice(0, dot);
	const provided = Buffer.from(token.slice(dot + 1), 'base64url');
	const expected = sign(payload, secret);
	if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
	try {
		const parsed = markerSchema.safeParse(
			JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
		);
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

export interface MarkActivity {
	secret: string | undefined;
	idleMinutes: number;
	/** `server`: id of the server of the request; null outside server pages (keeps the last one). */
	who: { user: string; server: string | null };
	now?: number;
}

/** Slide the marker forward; true when this request starts a new session. */
export function markActivity(cookies: Pick<Cookies, 'get' | 'set'>, o: MarkActivity): boolean {
	const now = o.now ?? Date.now();
	const prev = open(cookies.get(AUDIT_COOKIE), o.secret);
	const fresh =
		prev === null ||
		prev.user !== o.who.user ||
		// Moving to another server starts a session; entering the first one (from the home page) does not.
		(o.who.server !== null && prev.server !== null && prev.server !== o.who.server) ||
		now - prev.seen >= o.idleMinutes * 60_000;
	const next: Marker = {
		user: o.who.user,
		server: o.who.server ?? (fresh ? null : (prev?.server ?? null)),
		seen: now
	};
	cookies.set(AUDIT_COOKIE, seal(next, o.secret), { path: '/', httpOnly: true, sameSite: 'lax' });
	return fresh;
}

/** After a logout the next request is a new session. */
export function clearMarker(cookies: Pick<Cookies, 'delete'>): void {
	cookies.delete(AUDIT_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax' });
}
