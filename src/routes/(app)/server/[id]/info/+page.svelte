<script lang="ts">
	import Info from '@lucide/svelte/icons/info';
	import PageHeader from '#lib/components/app-shell/page-header.svelte';
	import TabBar from '#lib/components/app-shell/tab-bar.svelte';
	import Breadcrumbs from '#lib/components/app-shell/breadcrumbs.svelte';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import { resolve } from '$app/paths';
	import { SERVER_TABS, tabSubPath, type TabDef } from '#lib/nav/tabs.ts';
	import { bare, serverTabHref } from '#lib/nav/paths.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const hrefFor = (tab: TabDef) => serverTabHref(data.serverIndex, tabSubPath(tab.id));

	const isNumeric = (value: string) => value !== '' && !Number.isNaN(Number(value));

	const sectionHref = (name: string) =>
		name === ''
			? serverTabHref(data.serverIndex, 'info')
			: `${serverTabHref(data.serverIndex, 'info')}?section=${encodeURIComponent(name)}`;
</script>

<svelte:head><title>Info - {data.serverLabel} - svelteRedisAdmin</title></svelte:head>

<div class="flex flex-col gap-6" data-testid="server-info">
	<Breadcrumbs serverIndex={data.serverIndex} serverLabel={data.serverLabel} />
	<TabBar label="Server" tabs={SERVER_TABS} current={tabSubPath('info')} {hrefFor} />
	<PageHeader title="Info" description="INFO output from the server" icon={Info} />

	<!-- Section filter. -->
	<div class="flex flex-wrap items-center gap-2">
		<a href={resolve(bare(sectionHref('')))}>
			<Badge variant={data.section === '' ? 'primary' : 'muted'}>All sections</Badge>
		</a>
		{#each data.sections as name (name)}
			<a href={resolve(bare(sectionHref(name)))}>
				<Badge variant={data.section === name ? 'primary' : 'muted'}>{name}</Badge>
			</a>
		{/each}
	</div>

	{#each data.report as section (section.name)}
		<Card.Root class="gap-0 py-0">
			<Card.Header class="flex-row items-center justify-between gap-4 border-b py-5">
				<Card.Title class="capitalize">{section.name}</Card.Title>
				<Badge variant="muted">{section.entries.length} keys</Badge>
			</Card.Header>
			<Card.Content class="p-5">
				<dl class="grid gap-x-10 gap-y-1.5 sm:grid-cols-2">
					{#each section.entries as [key, value] (key)}
						<div class="flex min-w-0 items-baseline justify-between gap-4">
							<dt class="truncate font-mono text-sm text-muted-foreground" title={key}>{key}</dt>
							<dd
								class="truncate text-sm {isNumeric(value) ? 'text-end tabular-nums' : ''}"
								title={value}
							>
								{value}
							</dd>
						</div>
					{/each}
				</dl>
			</Card.Content>
		</Card.Root>
	{/each}

	{#if data.section === ''}
		<Card.Root class="gap-0 py-0">
			<Card.Header class="border-b py-5">
				<Card.Title>Raw</Card.Title>
				<Card.Description>Untouched INFO reply.</Card.Description>
			</Card.Header>
			<Card.Content class="p-5">
				<pre class="font-mono text-xs whitespace-pre-wrap">{data.raw}</pre>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
