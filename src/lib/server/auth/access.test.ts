import { describe, expect, test } from 'vitest';
import type { HttpError } from '@sveltejs/kit';
import {
	assertAdmin,
	assertServerAccess,
	assertWrite,
	canAccessServer,
	canAdmin,
	canWrite,
	resolveServers,
	type GuardLocals
} from './access.ts';
import type { SessionInfo } from './session.ts';

const session = (overrides: Partial<SessionInfo> = {}): SessionInfo => ({
	username: 'u',
	role: 'admin',
	servers: null,
	expires: Math.floor(Date.now() / 1000) + 3600,
	...overrides
});

const locals = (partial: Partial<GuardLocals> = {}): GuardLocals => ({
	session: session(),
	serverIndex: null,
	i18n: { t: (msgid: string) => msgid },
	...partial
});

describe('role helpers', () => {
	test('canWrite is true for admin and rw, false for ro', () => {
		expect(canWrite(session({ role: 'admin' }))).toBe(true);
		expect(canWrite(session({ role: 'rw' }))).toBe(true);
		expect(canWrite(session({ role: 'ro' }))).toBe(false);
	});

	test('canAdmin is true for admin only', () => {
		expect(canAdmin(session({ role: 'admin' }))).toBe(true);
		expect(canAdmin(session({ role: 'rw' }))).toBe(false);
		expect(canAdmin(session({ role: 'ro' }))).toBe(false);
		expect(canAdmin(null)).toBe(false);
		expect(canWrite(null)).toBe(false);
	});
});

describe('server visibility', () => {
	test('null servers means every server', () => {
		expect(canAccessServer(session({ servers: null }), 0)).toBe(true);
		expect(canAccessServer(session({ servers: null }), 41)).toBe(true);
	});

	test('a server list only allows the listed indexes', () => {
		const limited = session({ servers: [1, 3] });
		expect(canAccessServer(limited, 1)).toBe(true);
		expect(canAccessServer(limited, 3)).toBe(true);
		expect(canAccessServer(limited, 0)).toBe(false);
		expect(canAccessServer(limited, 2)).toBe(false);
	});
});

describe('resolveServers', () => {
	test('passes through null/undefined as all servers', () => {
		const config = { Servers: [{}] };
		expect(resolveServers(config, null)).toBeNull();
		expect(resolveServers(config, undefined)).toBeNull();
	});

	test('drops out-of-range and invalid indexes, deduplicates and sorts', () => {
		const config = { Servers: [{}, {}, {}] };
		expect(resolveServers(config, [2, 0, 7, -1, 2, 1.5])).toEqual([0, 2]);
	});

	test('an explicitly empty list sees no server', () => {
		expect(resolveServers({ Servers: [{}] }, [])).toEqual([]);
	});
});

describe('guards', () => {
	test('assertWrite throws 403 for ro sessions', () => {
		try {
			assertWrite(locals({ session: session({ role: 'ro' }) }));
			expect.unreachable();
		} catch (caught) {
			expect((caught as HttpError).status).toBe(403);
			expect((caught as HttpError).body.message).toBe('You are not allowed to modify data.');
		}
	});

	test('assertWrite passes for rw and admin', () => {
		expect(() => assertWrite(locals({ session: session({ role: 'rw' }) }))).not.toThrow();
		expect(() => assertWrite(locals())).not.toThrow();
	});

	test('assertAdmin throws 403 for non-admin sessions', () => {
		try {
			assertAdmin(locals({ session: session({ role: 'rw' }) }));
			expect.unreachable();
		} catch (caught) {
			expect((caught as HttpError).status).toBe(403);
			expect((caught as HttpError).body.message).toBe('Admin access required.');
		}
	});

	test('assertServerAccess 404s servers outside the session visibility', () => {
		try {
			assertServerAccess(locals({ session: session({ servers: [1] }), serverIndex: 0 }));
			expect.unreachable();
		} catch (caught) {
			expect((caught as HttpError).status).toBe(404);
			expect((caught as HttpError).body.message).toBe('Server not found');
		}
	});

	test('assertServerAccess passes for visible servers and outside server routes', () => {
		expect(() =>
			assertServerAccess(locals({ session: session({ servers: [1] }), serverIndex: 1 }))
		).not.toThrow();
		expect(() => assertServerAccess(locals({ serverIndex: null }))).not.toThrow();
	});
});
