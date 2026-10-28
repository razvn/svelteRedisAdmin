<script lang="ts">
	import Users from '@lucide/svelte/icons/users';
	import PageHeader from '#lib/components/app-shell/page-header.svelte';
	import TabBar from '#lib/components/app-shell/tab-bar.svelte';
	import Breadcrumbs from '#lib/components/app-shell/breadcrumbs.svelte';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import * as Table from '#lib/components/ui/table/index.ts';
	import { SERVER_TABS, tabSubPath, type TabDef } from '#lib/nav/tabs.ts';
	import { serverTabHref } from '#lib/nav/paths.ts';
	import { formatNumber, formatSeconds } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const hrefFor = (tab: TabDef) => serverTabHref(data.serverIndex, tabSubPath(tab.id));
</script>

<svelte:head><title>Clients - {data.serverLabel} - svelteRedisAdmin</title></svelte:head>

<div class="flex flex-col gap-6" data-testid="server-clients">
	<Breadcrumbs serverIndex={data.serverIndex} serverLabel={data.serverLabel} />
	<TabBar label="Server" tabs={SERVER_TABS} current={tabSubPath('clients')} {hrefFor} />
	<PageHeader title="Clients" description="CLIENT LIST — connected clients" icon={Users}>
		{#snippet actions()}
			<Badge variant="muted">{data.clients.length} connected</Badge>
		{/snippet}
	</PageHeader>

	{#if form?.error}
		<Alert variant="destructive">
			<AlertDescription>{form.error}</AlertDescription>
		</Alert>
	{/if}

	<Card.Root class="gap-0 py-0">
		<Card.Header class="border-b py-5">
			<Card.Title>Connected clients</Card.Title>
			<Card.Description>Disconnect a client with CLIENT KILL.</Card.Description>
		</Card.Header>
		<Card.Content class="px-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Id</Table.Head>
						<Table.Head>Address</Table.Head>
						<Table.Head>Name</Table.Head>
						<Table.Head class="text-end">Age</Table.Head>
						<Table.Head class="text-end">Db</Table.Head>
						<Table.Head class="text-end">Sub / Psub</Table.Head>
						<Table.Head>Cmd</Table.Head>
						<Table.Head>User</Table.Head>
						<Table.Head class="w-20"><span class="sr-only">Actions</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.clients as client (client['id'])}
						<Table.Row>
							<Table.Cell class="font-mono tabular-nums">{client['id']}</Table.Cell>
							<Table.Cell class="font-mono">{client['addr']}</Table.Cell>
							<Table.Cell>{client['name'] || '—'}</Table.Cell>
							<Table.Cell class="text-end tabular-nums">
								{formatSeconds(Number(client['age'] ?? 0))}
							</Table.Cell>
							<Table.Cell class="text-end tabular-nums">{client['db']}</Table.Cell>
							<Table.Cell class="text-end tabular-nums">
								{formatNumber(Number(client['sub'] ?? 0))} / {formatNumber(
									Number(client['psub'] ?? 0)
								)}
							</Table.Cell>
							<Table.Cell class="font-mono uppercase">{client['cmd']}</Table.Cell>
							<Table.Cell>{client['user']}</Table.Cell>
							<Table.Cell class="text-end">
								<form method="POST" action="?/kill">
									<input type="hidden" name="id" value={client['id']} />
									<Button type="submit" variant="destructive" size="xs">Kill</Button>
								</form>
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={9} class="text-muted-foreground">
								No connected clients reported.
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>
