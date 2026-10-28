/** Definition of one tab in a tab strip (`tab-bar.svelte`). */
export interface TabDef {
	/** Stable id, also used to look up the icon (`tab-icons.ts`). */
	id: string;
	label: string;
}
