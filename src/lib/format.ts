/** Formatting helpers shared by server and client code. */

/** Bytes as a human string (1.5 MB); binary units, matching phpRedisAdmin's hrandsize style. */
export function formatBytes(bytes: number, digits = 1): string {
	const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
	let value = Math.abs(bytes);
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	const formatted = unit === 0 ? String(bytes) : value.toFixed(digits);
	return `${bytes < 0 ? '-' : ''}${formatted} ${units[unit]}`;
}

/** A TTL/uptime in seconds as a compact human string (e.g. `2d 3h`, `permanent` for -1). */
export function formatSeconds(seconds: number): string {
	if (seconds === -1) return 'no expiry';
	if (seconds === -2) return 'expired';
	const units: [number, string][] = [
		[31_536_000, 'y'],
		[2_592_000, 'mo'],
		[604_800, 'w'],
		[86_400, 'd'],
		[3_600, 'h'],
		[60, 'm'],
		[1, 's']
	];
	let remaining = seconds;
	const parts: string[] = [];
	for (const [size, label] of units) {
		if (remaining >= size) {
			const amount = Math.floor(remaining / size);
			remaining -= amount * size;
			parts.push(`${amount}${label}`);
		}
		if (parts.length === 2) break;
	}
	return parts.length > 0 ? parts.join(' ') : '0s';
}

/** Thousands-separated integer (e.g. 1 234 567) with narrow spaces for tables. */
export function formatNumber(value: number): string {
	return value.toLocaleString('en-US').replaceAll(',', ' ');
}

/** Microseconds as `12.3 ms` / `1.2 s`. */
export function formatMicros(micros: number): string {
	if (micros < 1000) return `${micros} µs`;
	if (micros < 1_000_000) return `${(micros / 1000).toFixed(1)} ms`;
	return `${(micros / 1_000_000).toFixed(2)} s`;
}
