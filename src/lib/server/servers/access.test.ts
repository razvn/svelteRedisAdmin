import { describe, expect, test, vi } from 'vitest';
import type { HttpError } from '@sveltejs/kit';
import { serverSchema } from '#lib/server/config/schema.ts';
import { assertServerAccess, checkServerAccess, visibleServers } from './access.ts';
import type { ServerEntry } from './types.ts';

const plain = (index: number): ServerEntry => ({
	id: String(index),
	index,
	server: serverSchema.parse({})
});
const guarded = (namespace: string): ServerEntry => ({
	id: `k8s:${namespace}:redis`,
	index: null,
	server: serverSchema.parse({ authorize: { type: 'kubernetes-sar', namespace } }),
	discovered: { namespace, service: 'redis' }
});
const session = (servers: number[] | null = null) => ({ username: 'alice', servers });

describe('checkServerAccess', () => {
	test('hides configured servers outside the login list, without asking RBAC', async () => {
		const authorize = vi.fn();
		expect(await checkServerAccess(session([1]), [], plain(0), authorize)).toEqual({
			allowed: false,
			reason: 'hidden'
		});
		expect(await checkServerAccess(session([1]), [], plain(1), authorize)).toEqual({
			allowed: true
		});
		expect(authorize).not.toHaveBeenCalled();
	});

	test('asks RBAC with the user and groups, in the server namespace', async () => {
		const authorize = vi.fn(async () => ({ allowed: false as const, reason: 'no' }));
		const decision = await checkServerAccess(
			session([0]),
			['team-a'],
			guarded('review-1'),
			authorize
		);
		expect(decision).toEqual({ allowed: false, reason: 'denied', namespace: 'review-1' });
		expect(authorize).toHaveBeenCalledWith(
			{ user: 'alice', groups: ['team-a'] },
			expect.objectContaining({ namespace: 'review-1' })
		);
	});

	test('reports an RBAC failure as an error, not as a denial', async () => {
		const boom = new Error('HTTP 403');
		const decision = await checkServerAccess(session(), [], guarded('review-1'), async () => {
			throw boom;
		});
		expect(decision).toEqual({ allowed: false, reason: 'error', error: boom });
	});
});

describe('visibleServers', () => {
	test('keeps only the servers the person may use; failed checks are hidden', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const authorize = vi.fn(async (_identity, rules: { namespace: string }) => {
			if (rules.namespace === 'broken') throw new Error('down');
			return rules.namespace === 'review-1'
				? { allowed: true as const }
				: { allowed: false as const, reason: '' };
		});
		const entries = [
			plain(0),
			plain(1),
			guarded('review-1'),
			guarded('review-2'),
			guarded('broken')
		];
		const visible = await visibleServers(session([1]), [], entries, authorize);
		expect(visible.map((e) => e.id)).toEqual(['1', 'k8s:review-1:redis']);
		expect(log).toHaveBeenCalledOnce();
		log.mockRestore();
	});
});

describe('assertServerAccess', () => {
	const t = (msgid: string, params?: Record<string, unknown>) =>
		msgid.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k]));
	const status = (fn: () => void) => {
		try {
			fn();
		} catch (caught) {
			return [(caught as HttpError).status, (caught as HttpError).body.message];
		}
		return null;
	};

	test('maps refusals to 404, 403 and 503', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(status(() => assertServerAccess({ allowed: true }, '0', t))).toBeNull();
		expect(status(() => assertServerAccess({ allowed: false, reason: 'hidden' }, '0', t))).toEqual([
			404,
			'Server not found'
		]);
		expect(
			status(() =>
				assertServerAccess({ allowed: false, reason: 'denied', namespace: 'review-1' }, 'x', t)
			)
		).toEqual([403, 'You do not have access to this server (Kubernetes namespace review-1).']);
		expect(
			status(() =>
				assertServerAccess({ allowed: false, reason: 'error', error: new Error('t0ken') }, 'x', t)
			)
		).toEqual([503, 'Cannot verify your access right now.']);
		log.mockRestore();
	});
});
