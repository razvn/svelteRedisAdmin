import { describe, expect, test } from 'vitest';
import { createSessionToken, parseSessionToken, type SessionInfo } from './session.ts';

const SECRET = 'test-secret-at-least-16-chars';

const session = (overrides: Partial<SessionInfo> = {}): SessionInfo => ({
	username: 'admin',
	role: 'admin',
	servers: null,
	expires: Math.floor(Date.now() / 1000) + 3600,
	...overrides
});

describe('session tokens', () => {
	test('round-trips a valid token', () => {
		const token = createSessionToken(session(), SECRET);
		const parsed = parseSessionToken(token, SECRET);
		expect(parsed?.username).toBe('admin');
	});

	test('round-trips role and server visibility', () => {
		const token = createSessionToken(session({ role: 'rw', servers: [0, 2] }), SECRET);
		const parsed = parseSessionToken(token, SECRET);
		expect(parsed?.role).toBe('rw');
		expect(parsed?.servers).toEqual([0, 2]);
	});

	test('rejects a wrong secret', () => {
		const token = createSessionToken(session(), SECRET);
		expect(parseSessionToken(token, 'another-secret-16-chars!')).toBeNull();
	});

	test('rejects tampered payloads', () => {
		const token = createSessionToken(session({ username: 'admin' }), SECRET);
		const [payload, signature] = token.split('.');
		const forged = Buffer.from(
			JSON.stringify({
				username: 'root',
				role: 'admin',
				servers: null,
				expires: Math.floor(Date.now() / 1000) + 60
			})
		).toString('base64url');
		expect(parseSessionToken(`${forged}.${signature}`, SECRET)).toBeNull();
		void payload;
	});

	test('rejects expired sessions', () => {
		const token = createSessionToken(
			session({ expires: Math.floor(Date.now() / 1000) - 10 }),
			SECRET
		);
		expect(parseSessionToken(token, SECRET)).toBeNull();
	});

	test('rejects malformed tokens', () => {
		expect(parseSessionToken(undefined, SECRET)).toBeNull();
		expect(parseSessionToken('', SECRET)).toBeNull();
		expect(parseSessionToken('garbage', SECRET)).toBeNull();
		expect(parseSessionToken('a.b', SECRET)).toBeNull();
	});

	test('rejects pre-role cookies so they re-authenticate', () => {
		const legacy = {
			username: 'admin',
			expires: Math.floor(Date.now() / 1000) + 3600
		} as unknown as SessionInfo;
		const signed = createSessionToken(legacy, SECRET);
		expect(parseSessionToken(signed, SECRET)).toBeNull();
	});

	test('rejects an unknown role and malformed server lists', () => {
		const expires = Math.floor(Date.now() / 1000) + 3600;
		const badRole = createSessionToken(
			{ username: 'admin', role: 'superuser' as never, servers: null, expires },
			SECRET
		);
		expect(parseSessionToken(badRole, SECRET)).toBeNull();
		const badServers = createSessionToken(
			{ username: 'admin', role: 'ro', servers: 'all' as never, expires },
			SECRET
		);
		expect(parseSessionToken(badServers, SECRET)).toBeNull();
	});
});
