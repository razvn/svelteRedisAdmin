import fc from 'fast-check';

/**
 * fast-check generator of Redis byte strings for the round-trip properties (test-only; never imported by
 * the app). Built from chunks that sit on the text/binary boundary: valid UTF-8 text (any code point),
 * the UTF-8 BOM, and invalid sequences (lone continuation, overlong, surrogate, truncated), plus raw
 * random bytes. Uniform random bytes almost never form these, so the codec's edge cases are built on
 * purpose.
 */
export const redisBytes = fc
	.array(
		fc.oneof(
			fc.string({ unit: 'binary', maxLength: 8 }).map((s) => Buffer.from(s, 'utf8')),
			fc.constantFrom(
				Buffer.from([0xef, 0xbb, 0xbf]),
				Buffer.from([0x80]),
				Buffer.from([0xc0, 0xaf]),
				Buffer.from([0xed, 0xa0, 0x80]),
				Buffer.from([0xe2, 0x82]),
				Buffer.from([0x00])
			),
			fc.uint8Array({ maxLength: 8 }).map((b) => Buffer.from(b))
		),
		{ maxLength: 6 }
	)
	.map((chunks) => Buffer.concat(chunks));

/**
 * Known findings of the round-trip properties, still open in the product code. By default the properties
 * generate these inputs and fail on them. With `SRA_KNOWN_FINDINGS=exclude` they skip them, so a new
 * regression is not hidden behind an old finding. Delete a finding's predicate when it is fixed.
 */
export const EXCLUDE_KNOWN_FINDINGS = process.env['SRA_KNOWN_FINDINGS'] === 'exclude';

export const isUtf8 = (b: Uint8Array) => {
	try {
		new TextDecoder('utf-8', { fatal: true }).decode(b);
		return true;
	} catch {
		return false;
	}
};
