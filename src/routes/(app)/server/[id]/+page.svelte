<script lang="ts">
	import Server from '@lucide/svelte/icons/server';
	import Clock from '@lucide/svelte/icons/clock';
	import Database from '@lucide/svelte/icons/database';
	import Users from '@lucide/svelte/icons/users';
	import Key from '@lucide/svelte/icons/key';
	import Target from '@lucide/svelte/icons/target';
	import Activity from '@lucide/svelte/icons/activity';
	import Save from '@lucide/svelte/icons/save';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import PageHeader from '#lib/components/app-shell/page-header.svelte';
	import StatCard from '#lib/components/app-shell/stat-card.svelte';
	import TabBar from '#lib/components/app-shell/tab-bar.svelte';
	import Breadcrumbs from '#lib/components/app-shell/breadcrumbs.svelte';
	import { Alert, AlertDescription, AlertTitle } from '#lib/components/ui/alert/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import * as Table from '#lib/components/ui/table/index.ts';
	import { SERVER_TABS, tabSubPath, type TabDef } from '#lib/nav/tabs.ts';
	import { serverTabHref } from '#lib/nav/paths.ts';
	import { formatNumber, formatSeconds } from '#lib/format.ts';
	import { useI18n } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const i18n = useI18n();
	const t = $derived(i18n.t);
	const tn = $derived(i18n.tn);

	const hrefFor = (tab: TabDef) => serverTabHref(data.serverIndex, tabSubPath(tab.id));

	const stats = $derived(data.stats);
</script>

<svelte:head><title>{data.serverLabel} - svelteRedisAdmin</title></svelte:head>

<div class="flex flex-col gap-6" data-testid="server-overview">
	<Breadcrumbs serverIndex={data.serverIndex} serverLabel={data.serverLabel} />
	<TabBar label={t('Server')} tabs={SERVER_TABS} current={tabSubPath('overview')} {hrefFor} />
	<PageHeader title={data.serverLabel} description={t('Server overview')} icon={Server}>
		{#snippet actions()}
			{#if data.online}
				<Badge variant="success">{t('online')}</Badge>
			{:else}
				<Badge variant="destructive">{t('offline')}</Badge>
			{/if}
		{/snippet}
	</PageHeader>

	{#if data.online === false}
		<Alert variant="destructive" data-testid="server-overview-error">
			<CircleAlert />
			<AlertTitle>{t('Cannot reach this server')}</AlertTitle>
			<AlertDescription class="break-all">{data.error}</AlertDescription>
		</Alert>
	{:else if stats}
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<StatCard label={t('Redis version')} value={stats.version} icon={Server} tone="primary" />
			<StatCard
				label={t('Uptime')}
				value={tn('{n} day', '{n} days', stats.uptimeDays, { n: formatNumber(stats.uptimeDays) })}
				icon={Clock}
				tone="info"
			/>
			<StatCard
				label={t('Memory used')}
				value={stats.usedMemory}
				icon={Database}
				tone="warning"
				hint={stats.usedMemoryPeak ? t('Peak {peak}', { peak: stats.usedMemoryPeak }) : undefined}
			/>
			<StatCard
				label={t('Connected clients')}
				value={formatNumber(stats.clients)}
				icon={Users}
				tone="success"
			/>
			<StatCard
				label={t('Total keys')}
				value={formatNumber(stats.keys)}
				icon={Key}
				tone="primary"
				hint={t('Default database')}
			/>
			<StatCard
				label={t('Hits')}
				value={formatNumber(stats.hits)}
				icon={Target}
				tone="info"
				hint={stats.hitRate === null ? undefined : t('{rate}% hit rate', { rate: stats.hitRate })}
			/>
			<StatCard
				label={t('Misses')}
				value={formatNumber(stats.misses)}
				icon={Activity}
				tone="info"
			/>
			<StatCard
				label={t('Evicted keys')}
				value={formatNumber(stats.evicted)}
				icon={Database}
				tone={stats.evicted > 0 ? 'warning' : 'info'}
				hint={t('Expired: {n}', { n: formatNumber(stats.expired) })}
			/>
			<StatCard
				label={t('Last BGSAVE')}
				value={stats.bgsaveStatus}
				icon={Save}
				tone={stats.bgsaveStatus === 'ok' ? 'success' : 'warning'}
				hint={stats.sinceLastSave === null
					? undefined
					: t('Last save {ago} ago', { ago: formatSeconds(stats.sinceLastSave) })}
			/>
		</div>

		<Card.Root class="gap-0 py-0">
			<Card.Header class="border-b py-5">
				<Card.Title>{t('Keyspace')}</Card.Title>
				<Card.Description>{t('Keys, expiring keys and average TTL per database.')}</Card.Description
				>
			</Card.Header>
			<Card.Content class="px-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{t('Database')}</Table.Head>
							<Table.Head class="text-end">{t('Keys')}</Table.Head>
							<Table.Head class="text-end">{t('With expiry')}</Table.Head>
							<Table.Head class="text-end">{t('Avg TTL (ms)')}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.keyspace as entry (entry.db)}
							<Table.Row>
								<Table.Cell class="font-mono">db{entry.db}</Table.Cell>
								<Table.Cell class="text-end tabular-nums">{formatNumber(entry.keys)}</Table.Cell>
								<Table.Cell class="text-end tabular-nums">
									{formatNumber(entry.expires)}
								</Table.Cell>
								<Table.Cell class="text-end tabular-nums">{formatNumber(entry.avgTtl)}</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell colspan={4} class="text-muted-foreground">
									{t('No keyspace data reported by the server.')}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
