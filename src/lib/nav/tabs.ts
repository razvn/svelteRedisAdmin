import type { TabDef } from './types.ts';

export type { TabDef };

/** Tabs below `/server/[id]` (overview first, `''` sub-path). */
export const SERVER_TABS: TabDef[] = [
	{ id: 'overview', label: 'Overview' },
	{ id: 'info', label: 'Info' },
	{ id: 'config', label: 'Config' },
	{ id: 'clients', label: 'Clients' },
	{ id: 'slowlog', label: 'Slow log' }
];

/** Tabs below `/server/[id]/db/[db]`. */
export const DB_TABS: TabDef[] = [
	{ id: 'keys', label: 'Keys' },
	{ id: 'new-key', label: 'New key' },
	{ id: 'export', label: 'Export' },
	{ id: 'import', label: 'Import' }
];

/**
 * Is `tab` the current page? `current` is the path below the level root
 * (`''` = the level's index page). A tab without a sub-path is active on the index.
 */
export function isTabActive(tab: TabDef, current: string): boolean {
	const sub = tabSubPath(tab.id);
	return current === sub || current.startsWith(`${sub}/`);
}

/** Map a tab id to its sub-path below the level root (overview = index = `''`). */
export function tabSubPath(id: string): string {
	return id === 'overview' || id === 'keys' ? '' : id;
}

/** Label used by `not-implemented.svelte` to point at the roadmap. */
export function phaseTitle(phase: number): string {
	return `Phase ${phase}`;
}
