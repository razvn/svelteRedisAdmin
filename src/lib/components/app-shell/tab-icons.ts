import type { Component } from 'svelte';
import Gauge from '@lucide/svelte/icons/gauge';
import Info from '@lucide/svelte/icons/info';
import Cog from '@lucide/svelte/icons/cog';
import Users from '@lucide/svelte/icons/users';
import Clock from '@lucide/svelte/icons/calendar-clock';
import ListTree from '@lucide/svelte/icons/list-tree';
import SquareTerminal from '@lucide/svelte/icons/square-terminal';
import Plus from '@lucide/svelte/icons/plus';
import FileDown from '@lucide/svelte/icons/file-down';
import FileUp from '@lucide/svelte/icons/file-up';
import Construction from '@lucide/svelte/icons/construction';
import Ellipsis from '@lucide/svelte/icons/ellipsis';

/** Icons per tab id (`tab-bar.svelte`); unknown ids fall back to `FALLBACK_ICON`. */
export const TAB_ICONS: Record<string, Component> = {
	overview: Gauge,
	info: Info,
	config: Cog,
	clients: Users,
	slowlog: Clock,
	keys: ListTree,
	console: SquareTerminal,
	'new-key': Plus,
	export: FileDown,
	import: FileUp
};

export const FALLBACK_ICON: Component = Construction;
export const MORE_ICON: Component = Ellipsis;
