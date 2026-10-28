import { describe, expect, test } from 'vitest';
import { formatBytes, formatMicros, formatNumber, formatSeconds } from './format.ts';

describe('formatBytes', () => {
	test('stays in bytes below 1 KiB', () => {
		expect(formatBytes(512)).toBe('512 B');
	});

	test('steps up the binary units', () => {
		expect(formatBytes(1024)).toBe('1.0 KiB');
		expect(formatBytes(1536)).toBe('1.5 KiB');
		expect(formatBytes(1024 * 1024)).toBe('1.0 MiB');
		expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GiB');
	});

	test('handles negatives', () => {
		expect(formatBytes(-2048)).toBe('-2.0 KiB');
	});
});

describe('formatSeconds', () => {
	test('marks permanent keys', () => {
		expect(formatSeconds(-1)).toBe('no expiry');
	});

	test('marks missing keys', () => {
		expect(formatSeconds(-2)).toBe('expired');
	});

	test('formats the two biggest units only', () => {
		expect(formatSeconds(2 * 86_400 + 3 * 3600 + 25 * 60)).toBe('2d 3h');
		expect(formatSeconds(90)).toBe('1m 30s');
		expect(formatSeconds(59)).toBe('59s');
		expect(formatSeconds(0)).toBe('0s');
	});
});

describe('formatNumber', () => {
	test('groups thousands with narrow spaces', () => {
		expect(formatNumber(1_234_567)).toBe('1 234 567');
		expect(formatNumber(42)).toBe('42');
	});
});

describe('formatMicros', () => {
	test('formats µs, ms and s', () => {
		expect(formatMicros(850)).toBe('850 µs');
		expect(formatMicros(12_345)).toBe('12.3 ms');
		expect(formatMicros(2_500_000)).toBe('2.50 s');
	});
});
