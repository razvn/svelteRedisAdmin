<script lang="ts">
	import AppSidebar from '#lib/components/navigation/app-sidebar.svelte';
	import TopBar from '#lib/components/app-shell/top-bar.svelte';
	import * as Sidebar from '#lib/components/ui/sidebar/index.ts';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<Sidebar.Provider style="--sidebar-width: 15rem;">
	<AppSidebar servers={data.sidebar.servers} />
	<Sidebar.Inset class="flex min-h-screen flex-col overflow-x-hidden">
		<TopBar session={data.topbar} servers={data.topbar ? data.sidebar.servers : []} />
		<div class="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">{@render children()}</div>
	</Sidebar.Inset>
</Sidebar.Provider>
