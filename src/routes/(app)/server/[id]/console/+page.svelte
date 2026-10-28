<script lang="ts">
	import SquareTerminal from '@lucide/svelte/icons/square-terminal';
	import { untrack } from 'svelte';
	import PageHeader from '#lib/components/app-shell/page-header.svelte';
	import StatCard from '#lib/components/app-shell/stat-card.svelte';
	import TabBar from '#lib/components/app-shell/tab-bar.svelte';
	import Breadcrumbs from '#lib/components/app-shell/breadcrumbs.svelte';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import { Textarea } from '#lib/components/ui/textarea/index.ts';
	import { SERVER_TABS, tabSubPath, type TabDef } from '#lib/nav/tabs.ts';
	import { serverTabHref } from '#lib/nav/paths.ts';
	import type { WireReply } from '#lib/server/redis/console.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const hrefFor = (tab: TabDef) => serverTabHref(data.serverIndex, tabSubPath(tab.id));

	// After a POST the page re-renders with the action data — seed the textarea once.
	let input = $state(untrack(() => form?.input ?? ''));

	const EXAMPLES = ['INFO server', 'GET app:config', 'HGETALL user:1'];
	const PLACEHOLDER = 'GET app:config\nHGETALL user:1 # comments ok';
</script>

{#snippet reply(node: WireReply)}
	{#if node.kind === 'text'}
		{#if node.text.length > 400}
			<details>
				<summary class="cursor-pointer text-sm text-muted-foreground">
					Show {node.text.length} characters
				</summary>
				<code class="font-mono text-sm break-all whitespace-pre-wrap">{node.text}</code>
			</details>
		{:else}
			<code class="font-mono text-sm break-all whitespace-pre-wrap">{node.text}</code>
		{/if}
	{:else if node.kind === 'binary'}
		<span class="inline-flex items-center gap-2">
			<Badge variant="muted">binary</Badge>
			<code class="font-mono text-sm break-all">
				{node.base64.slice(0, 80)}{node.base64.length > 80 ? '…' : ''}
			</code>
		</span>
	{:else if node.kind === 'number'}
		<code class="font-mono text-sm">(integer) {node.value}</code>
	{:else if node.kind === 'null'}
		<span class="text-sm text-muted-foreground">(nil)</span>
	{:else if node.kind === 'status'}
		<Badge variant="info">{node.text}</Badge>
	{:else if node.kind === 'error'}
		<Badge variant="destructive">{node.text}</Badge>
	{:else if node.kind === 'array'}
		<ol class="ml-5 list-decimal space-y-1">
			{#each node.items as item, index (index)}
				<li>{@render reply(item)}</li>
			{/each}
		</ol>
	{:else if node.kind === 'map'}
		<div class="grid gap-1">
			{#each node.entries as [key, entry], index (index)}
				<div class="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3">
					<span class="font-medium">{@render reply(key)}</span>
					<span>{@render reply(entry)}</span>
				</div>
			{/each}
		</div>
	{/if}
{/snippet}

<svelte:head><title>Console - {data.serverLabel} - svelteRedisAdmin</title></svelte:head>

<div class="flex flex-col gap-6" data-testid="console-page">
	<Breadcrumbs serverIndex={data.serverIndex} serverLabel={data.serverLabel} />
	<TabBar label="Server" tabs={SERVER_TABS} current={tabSubPath('console')} {hrefFor} />
	<PageHeader
		title="Console"
		description="Run Redis commands against db{data.db}. One command per line; quotes and # comments work like redis-cli."
		icon={SquareTerminal}
	/>

	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
		<StatCard
			label="Redis version"
			value={data.redisVersion ?? 'unknown'}
			icon={SquareTerminal}
			tone="info"
		/>
		<StatCard label="Database" value="db{data.db}" icon={SquareTerminal} tone="primary" />
	</div>

	{#if form?.error}
		<Alert variant="destructive">
			<AlertDescription>{form.error}</AlertDescription>
		</Alert>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>Command input</Card.Title>
			<Card.Description>
				One command per line. Empty lines and <code class="font-mono"># comments</code> are skipped.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<form method="POST" action="?/run" class="flex flex-col gap-4">
				<Textarea
					name="input"
					rows={4}
					bind:value={input}
					class="font-mono text-sm"
					placeholder={PLACEHOLDER}
				/>
				<div class="flex flex-wrap items-center gap-2">
					<Button type="submit">
						<SquareTerminal data-icon="inline-start" />
						Run
					</Button>
					<Button type="button" variant="outline" onclick={() => (input = '')}>Clear</Button>
				</div>
			</form>

			<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
				Examples:
				{#each EXAMPLES as example (example)}
					<Button type="button" variant="outline" size="sm" onclick={() => (input = example)}>
						<code class="font-mono text-xs">{example}</code>
					</Button>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>

	{#if form?.results?.length}
		<div class="flex flex-col gap-4">
			{#each form.results as result, index (index)}
				<div
					class="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-card"
					data-testid="console-result"
				>
					<div class="flex flex-wrap items-center gap-2">
						<code class="font-mono text-sm break-all">{result.commandText}</code>
						<span class="ms-auto">
							{#if result.ok}
								<Badge variant="muted">{result.durationMs.toFixed(1)} ms</Badge>
							{:else}
								<Badge variant="destructive">error</Badge>
							{/if}
						</span>
					</div>
					<div data-testid="console-reply" class="border-t pt-2">
						{@render reply(result.reply)}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
