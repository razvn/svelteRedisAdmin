import { BlockList, isIP } from 'node:net';

/** `::ffff:10.0.0.1` (an IPv4 peer on a dual-stack socket) -> `10.0.0.1`. */
function unmapIpv4(address: string): string {
	const match = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
	return match ? match[1] : address;
}

/**
 * A matcher for `auth.trustedProxies` (addresses and CIDR ranges, already validated by the config
 * schema). Returns whether a TCP peer address is one of them.
 */
export function trustedProxyMatcher(ranges: readonly string[]): (peer: string | null) => boolean {
	const list = new BlockList();
	for (const range of ranges) {
		const [raw, bits] = range.split('/');
		const address = bits === undefined ? unmapIpv4(raw) : raw;
		const family = isIP(address) === 6 ? 'ipv6' : 'ipv4';
		if (bits === undefined) list.addAddress(address, family);
		else list.addSubnet(address, Number(bits), family);
	}
	return (peer) => {
		if (!peer) return false;
		const address = unmapIpv4(peer);
		const family = isIP(address);
		if (!family) return false;
		return list.check(address, family === 6 ? 'ipv6' : 'ipv4');
	};
}

const matchers = new WeakMap<readonly string[], (peer: string | null) => boolean>();

/** `trustedProxyMatcher`, built once per (config-owned) list. */
export function isTrustedProxy(ranges: readonly string[], peer: string | null): boolean {
	let matcher = matchers.get(ranges);
	if (!matcher) {
		matcher = trustedProxyMatcher(ranges);
		matchers.set(ranges, matcher);
	}
	return matcher(peer);
}
