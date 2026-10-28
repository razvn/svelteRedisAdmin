import { describe, expect, test } from 'vitest';
import { formatIfJson, fromWireValue, toWireValue, wireValueLength } from './value.ts';

describe('toWireValue', () => {
	test('keeps valid UTF-8 as text', () => {
		expect(toWireValue(Buffer.from('héllo ✓', 'utf8'))).toEqual({ kind: 'text', text: 'héllo ✓' });
	});

	test('tags invalid UTF-8 as base64', () => {
		const bytes = Uint8Array.of(0xff, 0xfe, 0x00, 0x01);
		const value = toWireValue(bytes);
		expect(value).toEqual({ kind: 'binary', base64: Buffer.from(bytes).toString('base64') });
	});
});

describe('fromWireValue', () => {
	test('round-trips text and binary', () => {
		const bytes = Uint8Array.of(0xff, 0x00, 0xfe);
		expect([...fromWireValue(toWireValue(bytes))]).toEqual([...bytes]);
		const text = Buffer.from('plain', 'utf8');
		expect([...fromWireValue(toWireValue(text))]).toEqual([...text]);
	});
});

describe('wireValueLength', () => {
	test('counts bytes, not characters', () => {
		expect(wireValueLength(toWireValue(Buffer.from('ab', 'utf8')))).toBe(2);
		expect(wireValueLength(toWireValue(Uint8Array.of(0, 0, 0, 0)))).toBe(4);
	});
});

describe('formatIfJson', () => {
	test('pretty-prints JSON objects and arrays', () => {
		expect(formatIfJson('{"a":1}')).toBe('{\n\t"a": 1\n}');
		expect(formatIfJson('  [1,2] ')).toBe('[\n\t1,\n\t2\n]');
	});

	test('leaves scalars and non-JSON alone', () => {
		expect(formatIfJson('42')).toBeNull();
		expect(formatIfJson('"quoted"')).toBeNull();
		expect(formatIfJson('{broken')).toBeNull();
		expect(formatIfJson('')).toBeNull();
	});
});
