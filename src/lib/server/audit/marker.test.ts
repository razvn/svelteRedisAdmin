import { describe, expect, it } from 'vitest';
import { AUDIT_COOKIE, clearMarker, markActivity } from './marker.ts';

function jar() {
	const values = new Map<string, string>();
	return {
		values,
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => void values.set(name, value),
		delete: (name: string) => void values.delete(name)
	};
}

const MIN = 60_000;
const t0 = Date.UTC(2026, 10, 6, 9, 0);
const mark = (
	cookies: ReturnType<typeof jar>,
	now: number,
	who: { user: string; server: string | null } = { user: 'alice', server: '0' },
	secret: string | undefined = 'unit-test-secret-1234'
) => markActivity(cookies, { secret, idleMinutes: 30, who, now });

describe('audit session marker', () => {
	it('starts a session on the first request', () => {
		expect(mark(jar(), t0)).toBe(true);
	});

	it('same person within the idle time: same session, sliding with every request', () => {
		const c = jar();
		mark(c, t0);
		expect(mark(c, t0 + 20 * MIN)).toBe(false);
		expect(mark(c, t0 + 40 * MIN)).toBe(false);
	});

	it('after the idle time: a new session', () => {
		const c = jar();
		mark(c, t0);
		expect(mark(c, t0 + 30 * MIN)).toBe(true);
	});

	it('another person or another server: a new session', () => {
		const c = jar();
		mark(c, t0);
		expect(mark(c, t0 + MIN, { user: 'bob', server: '0' })).toBe(true);
		expect(mark(c, t0 + 2 * MIN, { user: 'bob', server: 'k8s:review-1:redis' })).toBe(true);
		expect(mark(c, t0 + 3 * MIN, { user: 'bob', server: 'k8s:review-1:redis' })).toBe(false);
	});

	it('pages outside a server keep the session, and entering the first server does not start one', () => {
		const c = jar();
		expect(mark(c, t0, { user: 'alice', server: null })).toBe(true);
		expect(mark(c, t0 + MIN, { user: 'alice', server: '0' })).toBe(false);
		expect(mark(c, t0 + 2 * MIN, { user: 'alice', server: null })).toBe(false);
		// the home page did not forget the server: going to another one is a new session
		expect(mark(c, t0 + 3 * MIN, { user: 'alice', server: '1' })).toBe(true);
	});

	it('a tampered marker, or one signed with another secret: a new session', () => {
		const c = jar();
		mark(c, t0);
		const token = c.values.get(AUDIT_COOKIE)!;
		c.values.set(AUDIT_COOKIE, token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA'));
		expect(mark(c, t0 + MIN)).toBe(true);
		mark(c, t0 + 2 * MIN, undefined, 'another-secret-5678');
		expect(mark(c, t0 + 3 * MIN)).toBe(true);
	});

	it('works without cookieSecret (key of the process)', () => {
		const c = jar();
		expect(mark(c, t0, undefined, undefined)).toBe(true);
		expect(mark(c, t0 + MIN, undefined, undefined)).toBe(false);
	});

	it('after clearMarker (logout) the next request is a new session', () => {
		const c = jar();
		mark(c, t0);
		clearMarker(c);
		expect(mark(c, t0 + MIN)).toBe(true);
	});
});
