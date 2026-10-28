/**
 * Presentation helpers shared by the key browser and the key editor: badge
 * mappings, TTL pills, wire-value text/form plumbing, query strings and the
 * bulk-edit line formats. Importable from client code — no `Buffer`, no server
 * imports.
 */
import { formatSeconds } from '#lib/format.ts';
import type { WireValue } from '#lib/value.ts';

/** Key types that can be created and edited (everything but `unknown`). */
export const KEY_TYPES = ['string', 'hash', 'list', 'set', 'zset', 'stream'] as const;
export type EditableKeyType = (typeof KEY_TYPES)[number];
/** Every type SCAN can report, including the fallback for module types. */
export type ListedKeyType = EditableKeyType | 'unknown';

type SoftVariant = 'primary' | 'success' | 'warning' | 'info' | 'muted' | 'destructive' | 'outline';

const TYPE_VARIANTS: Record<ListedKeyType, SoftVariant> = {
	string: 'primary',
	hash: 'info',
	list: 'warning',
	set: 'success',
	zset: 'muted',
	stream: 'destructive',
	unknown: 'outline'
};

/** Badge variant for a key type (see docs/DESIGN.md soft pills). */
export function keyTypeVariant(type: ListedKeyType): SoftVariant {
	return TYPE_VARIANTS[type];
}

export interface TtlPill {
	variant: 'muted' | 'destructive' | 'warning';
	label: string;
}

/** TTL badge: -1 = no expiry, -2 = expired, otherwise a human duration. */
export function ttlPill(ttl: number): TtlPill {
	if (ttl === -1) return { variant: 'muted', label: 'no expiry' };
	if (ttl === -2) return { variant: 'destructive', label: 'expired' };
	return { variant: 'warning', label: formatSeconds(ttl) };
}

/** Display text for a wire value (binary values show their base64 form). */
export function wireText(value: WireValue): string {
	return value.kind === 'text' ? value.text : value.base64;
}

/**
 * Form value for a wire value: base64 of the raw bytes, so binary key names and
 * members round-trip through HTML forms losslessly (the server decodes with
 * `Buffer.from(value, 'base64')`).
 */
export function wireFormValue(value: WireValue): string {
	if (value.kind === 'binary') return value.base64;
	const bytes = new TextEncoder().encode(value.text);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

/** `base` plus the defined params as a query string (`?a=1&b=2` / just `base`). */
export function withParams(
	base: string,
	params: Record<string, string | number | undefined>
): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== '') search.set(key, String(value));
	}
	const query = search.toString();
	return query ? `${base}?${query}` : base;
}

/** Parse one `score member` line of a sorted-set bulk value (`1.5 player:42`). */
export function parseZSetLine(line: string): { score: number; member: string } | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	const match = /^(\S+)\s+(.+)$/.exec(trimmed);
	if (!match) return null;
	const score = Number(match[1]);
	if (!Number.isFinite(score)) return null;
	return { score, member: match[2] };
}

/** Split a textarea blob into non-empty lines (list/set bulk values). */
export function splitLines(value: string): string[] {
	return value
		.split('\n')
		.map((line) => line.replace(/\r$/, ''))
		.filter((line) => line.trim() !== '');
}
