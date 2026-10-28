/**
 * Value representation shared by server (Redis replies) and client (display).
 * Redis values are raw bytes; anything that is not valid UTF-8 travels to the
 * browser base64-tagged so it can round-trip without loss.
 */
export type WireValue = { kind: 'text'; text: string } | { kind: 'binary'; base64: string };

/** Decode bytes into a WireValue: valid UTF-8 stays text, everything else is base64. */
export function toWireValue(bytes: Uint8Array): WireValue {
	const decoder = new TextDecoder('utf-8', { fatal: true });
	try {
		return { kind: 'text', text: decoder.decode(bytes) };
	} catch {
		return {
			kind: 'binary',
			base64: Buffer.from(bytes).toString('base64')
		};
	}
}

/** Encode a WireValue back into bytes (used when saving values from the editor). */
export function fromWireValue(value: WireValue): Buffer {
	if (value.kind === 'text') return Buffer.from(value.text, 'utf8');
	return Buffer.from(value.base64, 'base64');
}

/** Length of the value in bytes, for the size pill in the UI. */
export function wireValueLength(value: WireValue): number {
	return fromWireValue(value).length;
}

/**
 * Pretty-print a value if it parses as JSON (object or array only — scalars stay
 * as-is, matching phpRedisAdmin's `detectSerialisedType`). Returns null when the
 * text is not JSON worth formatting.
 */
export function formatIfJson(text: string): string | null {
	const trimmed = text.trim();
	if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
	try {
		const parsed: unknown = JSON.parse(trimmed);
		if (typeof parsed !== 'object' || parsed === null) return null;
		return JSON.stringify(parsed, null, '\t');
	} catch {
		return null;
	}
}
