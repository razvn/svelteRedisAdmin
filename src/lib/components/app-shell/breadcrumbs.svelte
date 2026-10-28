<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.ts';
	import { dbHref, serverHref } from '#lib/nav/paths.ts';

	interface Props {
		/** Index of the active server in `config.Servers`. */
		serverIndex: number;
		/** Verbose name of the server. */
		serverLabel: string;
		db?: number;
		/** Current key name (breadcrumbs only — the key itself is the page title). */
		key?: string;
	}

	let { serverIndex, serverLabel, db, key }: Props = $props();

	// Never wrap: every crumb ellipsizes, the server label first, then the database, then the key.
	const ITEM = 'min-w-12 [&:first-child]:min-w-8';
	const LINK = 'block max-w-full truncate';
</script>

{#snippet crumb(kind: string, name: string)}
	<span class="hidden text-muted-foreground lg:inline">{kind}:</span>
	<span class="font-medium">{name}</span>
{/snippet}

<Breadcrumb.Root class="w-full min-w-0">
	<Breadcrumb.List class="w-full flex-nowrap gap-1.5 sm:gap-1.5">
		<Breadcrumb.Item class="{ITEM} shrink-[4]">
			<Breadcrumb.Link
				href={serverHref(serverIndex)}
				class={LINK}
				aria-current={db === undefined ? 'page' : undefined}
			>
				{@render crumb('Server', serverLabel)}
			</Breadcrumb.Link>
		</Breadcrumb.Item>
		{#if db !== undefined}
			<Breadcrumb.Separator class="shrink-0"><ChevronRight /></Breadcrumb.Separator>
			<Breadcrumb.Item class="{ITEM} shrink-[2]">
				<Breadcrumb.Link
					href={dbHref(serverIndex, db)}
					class={LINK}
					aria-current={key ? undefined : 'page'}
				>
					{@render crumb('Database', `db${db}`)}
				</Breadcrumb.Link>
			</Breadcrumb.Item>
		{/if}
		{#if db !== undefined && key}
			<Breadcrumb.Separator class="shrink-0"><ChevronRight /></Breadcrumb.Separator>
			<Breadcrumb.Item class="min-w-8 shrink">
				<span class="block max-w-full truncate font-mono" aria-current="page">{key}</span>
			</Breadcrumb.Item>
		{/if}
	</Breadcrumb.List>
</Breadcrumb.Root>
