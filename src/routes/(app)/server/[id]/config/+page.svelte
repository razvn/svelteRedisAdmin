<script lang="ts">
	import Cog from '@lucide/svelte/icons/cog';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Search from '@lucide/svelte/icons/search';
	import PageHeader from '#lib/components/app-shell/page-header.svelte';
	import TabBar from '#lib/components/app-shell/tab-bar.svelte';
	import Breadcrumbs from '#lib/components/app-shell/breadcrumbs.svelte';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import * as Table from '#lib/components/ui/table/index.ts';
	import { SERVER_TABS, tabSubPath, type TabDef } from '#lib/nav/tabs.ts';
	import { serverTabHref } from '#lib/nav/paths.ts';
	import { useI18n } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const i18n = useI18n();
	const t = $derived(i18n.t);

	const hrefFor = (tab: TabDef) => serverTabHref(data.serverIndex, tabSubPath(tab.id));

	const basePath = $derived(serverTabHref(data.serverIndex, 'config'));

	const query = $derived(data.q.trim().toLowerCase());
	const filtered = $derived(
		query === ''
			? data.entries
			: data.entries.filter(([parameter, value]) =>
					`${parameter} ${value}`.toLowerCase().includes(query)
				)
	);

	const editing = $derived(
		data.edit === null
			? null
			: (data.entries.find(([parameter]) => parameter === data.edit) ?? null)
	);
</script>

<svelte:head><title>{t('Config')} - {data.serverLabel} - svelteRedisAdmin</title></svelte:head>

<div class="flex flex-col gap-6" data-testid="server-config">
	<Breadcrumbs serverIndex={data.serverIndex} serverLabel={data.serverLabel} />
	<TabBar label={t('Server')} tabs={SERVER_TABS} current={tabSubPath('config')} {hrefFor} />
	<PageHeader title={t('Config')} description={t('CONFIG GET and SET')} icon={Cog}>
		{#snippet actions()}
			{#if data.saved}
				<Badge variant="success">{t('Saved {param}', { param: data.saved })}</Badge>
			{/if}
		{/snippet}
	</PageHeader>

	{#if form?.error}
		<Alert variant="destructive">
			<AlertDescription>{form.error}</AlertDescription>
		</Alert>
	{/if}

	{#if editing}
		<Card.Root>
			<Card.Header>
				<Card.Title>{t('Set parameter')}</Card.Title>
				<Card.Description class="font-mono break-all">{editing[0]}</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/set" class="flex flex-col gap-4">
					<input type="hidden" name="parameter" value={editing[0]} />
					<div class="flex flex-col gap-2">
						<Label for="config-value">{t('Value')}</Label>
						<Input id="config-value" name="value" value={editing[1]} class="font-mono" required />
					</div>
					<div class="flex gap-2">
						<Button type="submit">{t('Save')}</Button>
						<Button variant="outline" href={basePath}>{t('Cancel')}</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root class="gap-0 py-0">
		<Card.Header class="flex-row items-center justify-between gap-4 border-b py-5">
			<Card.Title>{t('Parameters')}</Card.Title>
			<Badge variant="muted"
				>{t('{shown} of {total}', { shown: filtered.length, total: data.entries.length })}</Badge
			>
		</Card.Header>
		<Card.Content class="px-0">
			<form method="GET" action={basePath} class="flex gap-2 border-b p-5" role="search">
				<Input
					name="q"
					value={data.q}
					placeholder={t('Filter parameters…')}
					aria-label={t('Filter parameters…')}
					class="max-w-xs"
				/>
				<Button type="submit" variant="outline">
					<Search />
					{t('Search')}
				</Button>
			</form>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{t('Parameter')}</Table.Head>
						<Table.Head>{t('Value')}</Table.Head>
						<Table.Head class="w-20"><span class="sr-only">{t('Actions')}</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each filtered as [parameter, value] (parameter)}
						<Table.Row>
							<Table.Cell class="font-mono">{parameter}</Table.Cell>
							<Table.Cell class="font-mono break-all whitespace-normal">{value}</Table.Cell>
							<Table.Cell class="text-end">
								<Button
									variant="outline"
									size="xs"
									href="{basePath}?edit={encodeURIComponent(parameter)}"
								>
									<Pencil />
									{t('Edit')}
								</Button>
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={3} class="text-muted-foreground">
								{t('No parameters match this filter.')}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>
