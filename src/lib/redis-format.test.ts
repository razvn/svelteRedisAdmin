import { describe, expect, test } from 'vitest';
import {
	keyTypeVariant,
	parseZSetLine,
	splitLines,
	ttlPill,
	withParams,
	wireFormValue,
	wireText
} from './redis-format.ts';

describe('keyTypeVariant', () => {
	test('maps every key type to its soft pill variant', () => {
		expect(keyTypeVariant('string')).toBe('primary');
		expect(keyTypeVariant('hash')).toBe('info');
		expect(keyTypeVariant('list')).toBe('warning');
		expect(keyTypeVariant('set')).toBe('success');
		expect(keyTypeVariant('zset')).toBe('muted');
		expect(keyTypeVariant('stream')).toBe('destructive');
		expect(keyTypeVariant('unknown')).toBe('outline');
	});
});

describe('ttlPill', () => {
	test('special-cases no expiry and expired keys', () => {
		expect(ttlPill(-1)).toEqual({ variant: 'muted', label: 'no expiry' });
		expect(ttlPill(-2)).toEqual({ variant: 'destructive', label: 'expired' });
	});
	test('formats live expiries as warning pills', () => {
		expect(ttlPill(90)).toEqual({ variant: 'warning', label: '1m 30s' });
		expect(ttlPill(7200)).toEqual({ variant: 'warning', label: '2h' });
	});
});

describe('wireText / wireFormValue', () => {
	test('text values round-trip through base64 form values', () => {
		const value = { kind: 'text', text: 'app:session:1' } as const;
		expect(wireText(value)).toBe('app:session:1');
		expect(Buffer.from(wireFormValue(value), 'base64').toString('utf8')).toBe('app:session:1');
	});
	test('binary values keep their base64 form', () => {
		const value = { kind: 'binary', base64: '/v4AAQ==' } as const;
		expect(wireText(value)).toBe('/v4AAQ==');
		expect(wireFormValue(value)).toBe('/v4AAQ==');
	});
});

describe('withParams', () => {
	test('appends only defined, non-empty params', () => {
		expect(withParams('/server/0/db/1', { cursor: 12, filter: 'app:*', type: '' })).toBe(
			'/server/0/db/1?cursor=12&filter=app%3A*'
		);
		expect(withParams('/server/0/db/1', { cursor: 0 })).toBe('/server/0/db/1?cursor=0');
		expect(withParams('/server/0/db/1', {})).toBe('/server/0/db/1');
	});
});

describe('parseZSetLine', () => {
	test('parses score + member with spaces in the member', () => {
		expect(parseZSetLine('1.5 player:42')).toEqual({ score: 1.5, member: 'player:42' });
		expect(parseZSetLine('  -3  two  words ')).toEqual({ score: -3, member: 'two  words' });
	});
	test('rejects junk lines but tolerates blank ones', () => {
		expect(parseZSetLine('   ')).toBeNull();
		expect(parseZSetLine('no-member')).toBeNull();
		expect(parseZSetLine('abc member')).toBeNull();
	});
});

describe('splitLines', () => {
	test('drops empty lines and carriage returns', () => {
		expect(splitLines('a\r\nb\n\n c \n')).toEqual(['a', 'b', ' c ']);
		expect(splitLines('')).toEqual([]);
	});
});
