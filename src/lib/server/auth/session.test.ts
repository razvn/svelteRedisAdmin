import { describe, expect, test } from 'vitest';
import { createSessionToken, parseSessionToken } from './session.ts';

const SECRET = 'test-secret-at-least-16-chars';

const session = (overrides: Partial<{ username: string; expires: number }> = {}) => ({
	username: 'admin',
	expires: Math.floor(Date.now() / 1000) + 3600,
	...overrides
});

describe('session tokens', () => {
	test('round-trips a valid token', () => {
		const token = createSessionToken(session(), SECRET);
		const parsed = parseSessionToken(token, SECRET);
		expect(parsed?.username).toBe('admin');
	});

	test('rejects a wrong secret', () => {
		const token = createSessionToken(session(), SECRET);
		expect(parseSessionToken(token, 'another-secret-16-chars!')).toBeNull();
	});

	test('rejects tampered payloads', () => {
		const token = createSessionToken(session({ username: 'admin' }), SECRET);
		const [payload, signature] = token.split('.');
		const forged = Buffer.from(
			JSON.stringify({ username: 'root', expires: Math.floor(Date.now() / 1000) + 60 })
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
});
