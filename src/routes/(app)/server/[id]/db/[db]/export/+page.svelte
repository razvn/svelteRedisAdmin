<script lang="ts">
	import Download from '@lucide/svelte/icons/download';
	import Breadcrumbs from '#lib/components/app-shell/breadcrumbs.svelte';
	import PageHeader from '#lib/components/app-shell/page-header.svelte';
	import TabBar from '#lib/components/app-shell/tab-bar.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import { DB_TABS, tabSubPath } from '#lib/nav/tabs.ts';
	import { resolve } from '$app/paths';
	import { bare, dbHref, dbTabHref } from '#lib/nav/paths.ts';
	import { useI18n } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const i18n = useI18n();
	const t = $derived(i18n.t);

	const downloadHref = $derived(
		resolve(bare(`${dbHref(data.serverIndex, data.db)}/export/download`))
	);
</script>

<svelte:head>
	<title>{t('Export db{db}', { db: data.db })} — svelteRedisAdmin</title>
</svelte:head>

<div class="flex flex-col gap-6" data-testid="export">
	<Breadcrumbs serverIndex={data.serverIndex} serverLabel={data.label} db={data.db} />

	<TabBar
		label={t('Database')}
		tabs={DB_TABS}
		current="export"
		hrefFor={(tab) => dbTabHref(data.serverIndex, data.db, tabSubPath(tab.id))}
	/>

	<PageHeader
		title={t('Export')}
		description={t('Download the keys of db{db} on {label} as a JSON dump.', {
			db: data.db,
			label: data.label
		})}
		icon={Download}
	/>

	<Card.Root class="max-w-3xl">
		<Card.Content class="flex flex-col gap-5">
			<form method="POST" action={downloadHref} class="flex flex-col gap-5">
				<div class="flex flex-col gap-2">
					<Label for="export-filter">{t('Key filter (optional)')}</Label>
					<Input
						id="export-filter"
						name="filter"
						placeholder={t('glob, e.g. app:* — empty exports the whole database')}
						class="font-mono"
					/>
				</div>
				<p class="text-sm text-muted-foreground">
					{@html i18n.t(
						'The dump holds one record per key: <code class="font-mono">{key, type, ttl, value}</code>. Collections are capped at 1,000 entries and the walk stops after 50,000 keys. Binary data is base64-tagged so imports are lossless.'
					)}
				</p>
				<div>
					<Button type="submit">
						<Download />
						{t('Download JSON')}
					</Button>
				</div>
			</form>
			<p class="text-sm text-muted-foreground">
				{t('Import the file later from the')}
				<a
					class="text-primary underline underline-offset-4"
					href={resolve(bare(dbTabHref(data.serverIndex, data.db, 'import')))}>{t('Import tab')}</a
				>
				{t('or go back to the')}
				<a
					class="text-primary underline underline-offset-4"
					href={resolve(bare(dbHref(data.serverIndex, data.db)))}>{t('key browser')}</a
				>.
			</p>
		</Card.Content>
	</Card.Root>
</div>
