<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Upload from '@lucide/svelte/icons/upload';
	import Breadcrumbs from '#lib/components/app-shell/breadcrumbs.svelte';
	import PageHeader from '#lib/components/app-shell/page-header.svelte';
	import TabBar from '#lib/components/app-shell/tab-bar.svelte';
	import { Alert, AlertDescription, AlertTitle } from '#lib/components/ui/alert/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import { dbTabHref } from '#lib/nav/paths.ts';
	import { DB_TABS, tabSubPath } from '#lib/nav/tabs.ts';
	import { useI18n } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const i18n = useI18n();
	const t = $derived(i18n.t);
	const tn = $derived(i18n.tn);
</script>

<svelte:head>
	<title>{t('Import into db{db}', { db: data.db })} — svelteRedisAdmin</title>
</svelte:head>

<div class="flex flex-col gap-6" data-testid="import">
	<Breadcrumbs serverIndex={data.serverIndex} serverLabel={data.label} db={data.db} />

	<TabBar
		label={t('Database')}
		tabs={DB_TABS}
		current="import"
		hrefFor={(tab) => dbTabHref(data.serverIndex, data.db, tabSubPath(tab.id))}
	/>

	<PageHeader
		title={t('Import')}
		description={t('Recreate keys in db{db} on {label} from a JSON dump.', {
			db: data.db,
			label: data.label
		})}
		icon={Upload}
	/>

	<Card.Root class="max-w-3xl">
		<Card.Content class="flex flex-col gap-5">
			{#if form && 'error' in form}
				<Alert variant="destructive">
					<CircleAlert />
					<AlertTitle>{t('Import failed')}</AlertTitle>
					<AlertDescription>{form.error}</AlertDescription>
				</Alert>
			{:else if form}
				<Alert variant="success">
					<CircleCheck />
					<AlertTitle>
						{t('Imported {imported} of {total} keys', {
							imported: form.imported,
							total: form.total
						})}
					</AlertTitle>
					<AlertDescription>
						{#if form.errors.length > 0}
							{tn(
								'{n} key could not be imported.',
								'{n} keys could not be imported.',
								form.errors.length
							)}
						{:else}
							{t('Every key of the dump was recreated.')}
						{/if}
					</AlertDescription>
				</Alert>
				{#if form.errors.length > 0}
					<Alert variant="warning">
						<CircleAlert />
						<AlertTitle>{t('Per-key errors')}</AlertTitle>
						<AlertDescription>
							<ul class="list-inside list-disc font-mono text-xs">
								{#each form.errors as message (message)}
									<li class="break-all">{message}</li>
								{/each}
							</ul>
						</AlertDescription>
					</Alert>
				{/if}
			{/if}

			<form
				method="POST"
				action="?/import"
				enctype="multipart/form-data"
				class="flex flex-col gap-5"
			>
				<div class="flex flex-col gap-2">
					<Label for="import-file">{t('JSON dump')}</Label>
					<Input
						id="import-file"
						type="file"
						name="file"
						accept="application/json,.json"
						required
					/>
				</div>
				<p class="text-sm text-muted-foreground">
					{@html i18n.t(
						'Upload a file produced by the Export tab: <code class="font-mono">{"keys": [{"key": ..., "type": ..., "ttl": ..., "value": ...}]}</code>. Existing keys with the same name are overwritten.'
					)}
				</p>
				<div>
					<Button type="submit">
						<Upload />
						{t('Import keys')}
					</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
