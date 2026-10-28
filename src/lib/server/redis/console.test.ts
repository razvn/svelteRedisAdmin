import { describe, expect, test } from 'vitest';
import { ConsoleError, encodeReply, formatTokens, tokenizeCommand } from './console.ts';

describe('tokenizeCommand', () => {
	test('splits plain words', () => {
		expect(tokenizeCommand('GET app:config')).toEqual(['GET', 'app:config']);
	});

	test('collapses multiple spaces and trims', () => {
		expect(tokenizeCommand('   SET    foo   bar   ')).toEqual(['SET', 'foo', 'bar']);
	});

	test('returns [] for empty input', () => {
		expect(tokenizeCommand('')).toEqual([]);
		expect(tokenizeCommand('   ')).toEqual([]);
	});

	test('double quotes keep spaces and honour \\n and \\"', () => {
		expect(tokenizeCommand('SET key "hello world"')).toEqual(['SET', 'key', 'hello world']);
		expect(tokenizeCommand('SET key "a\\nb"')).toEqual(['SET', 'key', 'a\nb']);
		expect(tokenizeCommand('SET key "say \\"hi\\""')).toEqual(['SET', 'key', 'say "hi"']);
		expect(tokenizeCommand('SET key "back\\\\slash"')).toEqual(['SET', 'key', 'back\\slash']);
	});

	test('double quotes honour \\xHH hex escapes', () => {
		expect(tokenizeCommand('GET "\\x41\\x42"')).toEqual(['GET', 'AB']);
	});

	test('unknown escapes keep both characters', () => {
		expect(tokenizeCommand('"\\q"')).toEqual(['\\q']);
	});

	test('single quotes preserve everything literally', () => {
		expect(tokenizeCommand('SET key \'a\\nb "c"\'')).toEqual(['SET', 'key', 'a\\nb "c"']);
	});

	test('throws ConsoleError on an unclosed quote', () => {
		expect(() => tokenizeCommand('GET "abc')).toThrow(ConsoleError);
		expect(() => tokenizeCommand("GET 'abc")).toThrow('Unterminated single-quoted argument');
	});

	test('throws ConsoleError on an invalid \\xHH escape', () => {
		expect(() => tokenizeCommand('"\\xZZ"')).toThrow(ConsoleError);
	});
});

describe('formatTokens', () => {
	test('joins plain tokens with spaces', () => {
		expect(formatTokens(['GET', 'app:config'])).toBe('GET app:config');
	});

	test('re-quotes tokens containing spaces (round trip)', () => {
		expect(formatTokens(['SET', 'key', 'hello world'])).toBe('SET key "hello world"');
		expect(tokenizeCommand(formatTokens(['SET', 'a', 'x y\nz']))).toEqual(['SET', 'a', 'x y\nz']);
	});

	test('escapes embedded quotes and backslashes', () => {
		expect(formatTokens(['say "hi"'])).toBe('"say \\"hi\\""');
		expect(formatTokens(['a b\\c'])).toBe('"a b\\\\c"');
		expect(formatTokens([''])).toBe('""');
	});
});

describe('encodeReply', () => {
	test('encodes plain strings as status replies', () => {
		expect(encodeReply('OK')).toEqual({ kind: 'status', text: 'OK' });
	});

	test('encodes Buffers as text or base64-tagged binary', () => {
		expect(encodeReply(Buffer.from('hello'))).toEqual({ kind: 'text', text: 'hello' });
		expect(encodeReply(Buffer.from([0xff, 0xfe]))).toEqual({ kind: 'binary', base64: '//4=' });
	});

	test('encodes numbers and bigints as strings', () => {
		expect(encodeReply(42)).toEqual({ kind: 'number', value: '42' });
		expect(encodeReply(9_000_719_925_474_099n)).toEqual({
			kind: 'number',
			value: '9000719925474099'
		});
	});

	test('encodes null as (nil)', () => {
		expect(encodeReply(null)).toEqual({ kind: 'null' });
	});

	test('encodes nested arrays recursively', () => {
		expect(encodeReply([Buffer.from('a'), 1, [null]])).toEqual({
			kind: 'array',
			items: [
				{ kind: 'text', text: 'a' },
				{ kind: 'number', value: '1' },
				{ kind: 'array', items: [{ kind: 'null' }] }
			]
		});
	});

	test('encodes maps as key/value entry pairs', () => {
		expect(encodeReply(new Map([['db0', 2]]))).toEqual({
			kind: 'map',
			entries: [
				[
					{ kind: 'status', text: 'db0' },
					{ kind: 'number', value: '2' }
				]
			]
		});
	});

	test('encodes Error objects as error replies', () => {
		expect(encodeReply(new Error('ERR nope'))).toEqual({ kind: 'error', text: 'ERR nope' });
	});
});
