<script lang="ts">
	import Clock from '@lucide/svelte/icons/clock';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import PageHeader from '#lib/components/app-shell/page-header.svelte';
	import StatCard from '#lib/components/app-shell/stat-card.svelte';
	import TabBar from '#lib/components/app-shell/tab-bar.svelte';
	import Breadcrumbs from '#lib/components/app-shell/breadcrumbs.svelte';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import * as Table from '#lib/components/ui/table/index.ts';
	import { SERVER_TABS, tabSubPath, type TabDef } from '#lib/nav/tabs.ts';
	import { serverTabHref } from '#lib/nav/paths.ts';
	import { formatMicros, formatNumber, formatSeconds } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const hrefFor = (tab: TabDef) => serverTabHref(data.serverIndex, tabSubPath(tab.id));
</script>

<svelte:head><title>Slow log - {data.serverLabel} - svelteRedisAdmin</title></svelte:head>

<div class="flex flex-col gap-6" data-testid="server-slowlog">
	<Breadcrumbs serverIndex={data.serverIndex} serverLabel={data.serverLabel} />
	<TabBar label="Server" tabs={SERVER_TABS} current={tabSubPath('slowlog')} {hrefFor} />
	<PageHeader title="Slow log" description="SLOWLOG GET — slowest commands" icon={Clock}>
		{#snippet actions()}
			<form method="POST" action="?/reset">
				<input type="hidden" name="confirm" value="1" />
				<Button type="submit" variant="destructive">
					<Trash2 />
					Reset slow log
				</Button>
			</form>
		{/snippet}
	</PageHeader>

	{#if form?.error}
		<Alert variant="destructive">
			<AlertDescription>{form.error}</AlertDescription>
		</Alert>
	{/if}

	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
		<StatCard
			label="Entries"
			value={formatNumber(data.length)}
			icon={Clock}
			tone="info"
			hint={`${data.entries.length} shown`}
		/>
	</div>

	<Card.Root class="gap-0 py-0">
		<Card.Header class="border-b py-5">
			<Card.Title>Slowest commands</Card.Title>
			<Card.Description>Most recent 100 entries.</Card.Description>
		</Card.Header>
		<Card.Content class="px-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Id</Table.Head>
						<Table.Head>Timestamp</Table.Head>
						<Table.Head class="text-end">Duration</Table.Head>
						<Table.Head>Command</Table.Head>
						<Table.Head>Client</Table.Head>
						<Table.Head>Name</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.entries as entry (entry.id)}
						<Table.Row>
							<Table.Cell class="font-mono tabular-nums">{entry.id}</Table.Cell>
							<Table.Cell>
								<span class="tabular-nums">{entry.timestamp}</span>
								<span class="block text-xs text-muted-foreground">
									{formatSeconds(entry.ageSeconds)} ago
								</span>
							</Table.Cell>
							<Table.Cell class="text-end tabular-nums">
								<Badge variant={entry.durationMicros >= 100_000 ? 'warning' : 'muted'}>
									{formatMicros(entry.durationMicros)}
								</Badge>
							</Table.Cell>
							<Table.Cell class="max-w-md whitespace-normal">
								<code class="font-mono text-xs break-all">{entry.command}</code>
							</Table.Cell>
							<Table.Cell class="font-mono">{entry.clientAddress ?? '—'}</Table.Cell>
							<Table.Cell>{entry.clientName ?? '—'}</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={6} class="text-muted-foreground">
								The slow log is empty.
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>
