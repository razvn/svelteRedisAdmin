import { describe, expect, test } from 'vitest';
import { clientAddress } from './trusted-proxy.ts';

const proxies = ['10.0.0.0/8'];

describe('clientAddress', () => {
	test('a direct peer is the client, and its X-Forwarded-For is ignored', () => {
		expect(clientAddress(proxies, '203.0.113.7', '198.51.100.1')).toBe('203.0.113.7');
		expect(clientAddress([], '::ffff:203.0.113.7', null)).toBe('203.0.113.7');
		expect(clientAddress(proxies, null, null)).toBeNull();
	});

	test('behind trusted proxies: the right-most address that is not one of them', () => {
		expect(clientAddress(proxies, '10.0.0.1', '203.0.113.7')).toBe('203.0.113.7');
		expect(clientAddress(proxies, '10.0.0.1', 'spoofed, 203.0.113.7, 10.1.2.3')).toBe(
			'203.0.113.7'
		);
		expect(clientAddress(proxies, '10.0.0.1', '198.51.100.9, 203.0.113.7')).toBe('203.0.113.7');
	});

	test('a trusted peer without a usable header stays the address', () => {
		expect(clientAddress(proxies, '10.0.0.1', null)).toBe('10.0.0.1');
		expect(clientAddress(proxies, '10.0.0.1', 'garbage')).toBe('10.0.0.1');
		expect(clientAddress(proxies, '10.0.0.1', '10.0.0.2')).toBe('10.0.0.2');
	});
});
