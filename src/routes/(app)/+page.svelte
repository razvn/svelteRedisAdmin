<script lang="ts">
	import Database from '@lucide/svelte/icons/database';
	import Server from '@lucide/svelte/icons/server';
	import Users from '@lucide/svelte/icons/users';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import PageHeader from '#lib/components/app-shell/page-header.svelte';
	import StatCard from '#lib/components/app-shell/stat-card.svelte';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.ts';
	import { formatNumber } from '#lib/format.ts';
	import { serverHref } from '#lib/nav/paths.ts';
	import { useI18n } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const i18n = useI18n();
	const t = $derived(i18n.t);
	const tn = $derived(i18n.tn);

	const appTitle = 'svelteRedisAdmin';
</script>

<svelte:head><title>{appTitle}</title></svelte:head>

<div class="flex flex-col gap-6" data-testid="home">
	<PageHeader
		title={appTitle}
		description={t('Web admin for Redis databases. Pick a server to browse its keys.')}
		icon={Database}
	>
		{#snippet actions()}
			<Badge variant="muted">{tn('{n} server', '{n} servers', data.servers.length)}</Badge>
		{/snippet}
	</PageHeader>

	<div class="grid gap-4 lg:grid-cols-2">
		{#each data.servers as server (server.index)}
			<Card.Root class="gap-0 py-0" data-testid="server-card">
				<Card.Header class="flex-row items-center justify-between border-b py-5">
					<Card.Title class="flex min-w-0 items-center gap-2">
						<Server class="size-4 shrink-0 text-muted-foreground" />
						<span class="truncate">{server.label}</span>
					</Card.Title>
					{#if server.online}
						<Badge variant="success">{t('online')}</Badge>
					{:else}
						<Badge variant="destructive">{t('offline')}</Badge>
					{/if}
				</Card.Header>
				<Card.Content class="flex flex-col gap-4 p-5">
					{#if server.online}
						<!-- 2 columns max: the card itself is half-width, 4 would squeeze the stat cards -->
						<div class="grid gap-4 sm:grid-cols-2">
							<StatCard
								label={t('Version')}
								value={server.version ?? '—'}
								icon={Server}
								tone="primary"
							/>
							<StatCard
								label={t('Memory')}
								value={server.usedMemory ?? '—'}
								icon={Database}
								tone="info"
							/>
							<StatCard
								label={t('Clients')}
								value={server.clients === undefined ? '—' : formatNumber(server.clients)}
								icon={Users}
								tone="success"
							/>
							<StatCard
								label={t('Keys (default db)')}
								value={server.keys === undefined ? '—' : formatNumber(server.keys)}
								icon={Database}
								tone="warning"
							/>
						</div>
					{:else}
						<Alert variant="destructive">
							<CircleAlert />
							<AlertDescription class="break-all">{server.error}</AlertDescription>
						</Alert>
					{/if}
					<Card.Footer class="flex justify-end border-0 p-0">
						<Button href={serverHref(server.index)} size="sm">
							{t('Open server')}
							<ArrowRight />
						</Button>
					</Card.Footer>
				</Card.Content>
			</Card.Root>
		{/each}
	</div>
</div>
