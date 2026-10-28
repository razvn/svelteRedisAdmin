import { describe, expect, test } from 'vitest';
import { infoValue, parseInfo } from './server.ts';

const SAMPLE = [
	'# Server',
	'redis_version:7.4.0',
	'redis_mode:standalone',
	'',
	'# Clients',
	'connected_clients:3',
	'',
	'run_id:abc123',
	'tcp_port:6379'
].join('\r\n');

describe('parseInfo', () => {
	test('splits sections and lowercases their names', () => {
		const info = parseInfo(SAMPLE);
		expect(info.sections['server']).toEqual({ redis_version: '7.4.0', redis_mode: 'standalone' });
		expect(info.sections['clients']).toEqual({
			connected_clients: '3',
			run_id: 'abc123',
			tcp_port: '6379'
		});
	});

	test('starts an empty "" section when the file has no header', () => {
		const info = parseInfo(SAMPLE);
		expect(info.sections['']).toEqual({});
	});

	test('ignores blank lines and lines without a colon', () => {
		const info = parseInfo('junk line\r\n\r\n# S\r\na:1');
		expect(info.sections['s']).toEqual({ a: '1' });
		expect(Object.keys(info.sections[''])).toHaveLength(0);
	});
});

describe('infoValue', () => {
	test('looks a key up across all sections', () => {
		const info = parseInfo(SAMPLE);
		expect(infoValue(info, 'redis_version')).toBe('7.4.0');
		expect(infoValue(info, 'connected_clients')).toBe('3');
		expect(infoValue(info, 'tcp_port')).toBe('6379');
	});

	test('returns undefined for unknown keys', () => {
		expect(infoValue(parseInfo(SAMPLE), 'nope')).toBeUndefined();
	});
});
