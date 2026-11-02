import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { fromWireValue, toWireValue } from './value.ts';
import { redisBytes } from './value.arbitraries.ts';

// Formal check (generated inputs) for the promise in value.ts: Redis bytes travel as a WireValue and come
// back unchanged. Covered by the verify-dump-roundtrip skill (.claude/skills/verify-dump-roundtrip/SKILL.md).

const RUNS = 5000;
// Fixed by default so a rerun replays the same cases; SRA_FC_SEED=<n> explores other ones.
const SEED = Number(process.env['SRA_FC_SEED'] ?? 20261102);

describe('WireValue codec round-trip (property)', () => {
	test('fromWireValue(toWireValue(bytes)) returns the same bytes, for every byte string', () => {
		fc.assert(
			fc.property(redisBytes, (bytes) => {
				expect(fromWireValue(toWireValue(bytes)).equals(bytes)).toBe(true);
			}),
			{ numRuns: RUNS, seed: SEED }
		);
	});

	test('the round-trip also holds after a JSON trip (what export/import and the browser see)', () => {
		fc.assert(
			fc.property(redisBytes, (bytes) => {
				const wire = JSON.parse(JSON.stringify(toWireValue(bytes)));
				expect(fromWireValue(wire).equals(bytes)).toBe(true);
			}),
			{ numRuns: RUNS, seed: SEED }
		);
	});
});
