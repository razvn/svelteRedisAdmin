import { createHmac, timingSafeEqual } from 'node:crypto';

/** Non-secret facts stored in the session cookie. */
export interface SessionInfo {
	username: string;
	/** Unix seconds when the session expires. */
	expires: number;
}

const encoder = new TextEncoder();

function base64UrlUrlEncode(bytes: Buffer): string {
	return bytes.toString('base64url');
}

function sign(payload: string, secret: string): string {
	return base64UrlUrlEncode(createHmac('sha256', encoder.encode(secret)).update(payload).digest());
}

/** Produce the cookie value: `base64url(json).hmac` (unit-tested, pure). */
export function createSessionToken(session: SessionInfo, secret: string): string {
	const payload = base64UrlUrlEncode(Buffer.from(JSON.stringify(session), 'utf8'));
	return `${payload}.${sign(payload, secret)}`;
}

/**
 * Verify a cookie value and return the session, or null when the signature does
 * not match, the payload is malformed, or the session has expired.
 */
export function parseSessionToken(token: string | undefined, secret: string): SessionInfo | null {
	if (!token) return null;
	const separator = token.lastIndexOf('.');
	if (separator === -1) return null;
	const payload = token.slice(0, separator);
	const signature = token.slice(separator + 1);
	const expected = Buffer.from(sign(payload, secret), 'base64url');
	let provided: Buffer;
	try {
		provided = Buffer.from(signature, 'base64url');
	} catch {
		return null;
	}
	if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
	try {
		const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionInfo;
		if (typeof session.username !== 'string' || typeof session.expires !== 'number') return null;
		if (session.expires <= Date.now() / 1000) return null;
		return session;
	} catch {
		return null;
	}
}

export function sessionLifetimeSeconds(expires: number): number {
	return Math.max(0, expires - Date.now() / 1000);
}
