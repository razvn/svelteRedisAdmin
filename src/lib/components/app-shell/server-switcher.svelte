<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { bare } from '#lib/nav/paths.ts';
	import Server from '@lucide/svelte/icons/server';
	import Check from '@lucide/svelte/icons/check';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.ts';
	import { serverHref } from '#lib/nav/paths.ts';

	interface ServerEntry {
		index: number;
		label: string;
	}

	interface Props {
		servers: ServerEntry[];
		current: number;
	}

	let { servers, current }: Props = $props();

	function choose(index: number) {
		if (index !== current) void goto(resolve(bare(serverHref(index))));
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon"
				class="rounded-full"
				aria-label="Switch server"
			>
				<Server />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Label>Server</DropdownMenu.Label>
		{#each servers as s (s.index)}
			<DropdownMenu.Item
				onclick={() => choose(s.index)}
				aria-checked={s.index === current}
				role="menuitemradio"
			>
				{s.label}
				{#if s.index === current}<Check class="ms-auto size-4 text-primary" />{/if}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
