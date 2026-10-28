import { describe, expect, test } from 'vitest';
import { parseKeyspace } from './keyspace.ts';

describe('parseKeyspace', () => {
	test('parses dbN entries sorted by database index', () => {
		const entries = parseKeyspace({
			db2: 'keys=5,expires=1,avg_ttl=250',
			db0: 'keys=1,expires=0,avg_ttl=0'
		});
		expect(entries).toEqual([
			{ db: 0, keys: 1, expires: 0, avgTtl: 0 },
			{ db: 2, keys: 5, expires: 1, avgTtl: 250 }
		]);
	});

	test('returns an empty list for an empty section', () => {
		expect(parseKeyspace({})).toEqual([]);
	});

	test('ignores entries that are not databases', () => {
		expect(parseKeyspace({ junk: 'keys=1,expires=0,avg_ttl=0' })).toEqual([]);
	});

	test('defaults missing fields to 0', () => {
		expect(parseKeyspace({ db1: 'keys=3' })).toEqual([{ db: 1, keys: 3, expires: 0, avgTtl: 0 }]);
	});
});
