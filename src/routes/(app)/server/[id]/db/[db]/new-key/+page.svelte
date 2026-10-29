<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Breadcrumbs from '#lib/components/app-shell/breadcrumbs.svelte';
	import PageHeader from '#lib/components/app-shell/page-header.svelte';
	import TabBar from '#lib/components/app-shell/tab-bar.svelte';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import { NativeSelect } from '#lib/components/ui/native-select/index.ts';
	import { Textarea } from '#lib/components/ui/textarea/index.ts';
	import { KEY_TYPES } from '#lib/redis-format.ts';
	import { dbHref, dbTabHref } from '#lib/nav/paths.ts';
	import { DB_TABS, tabSubPath } from '#lib/nav/tabs.ts';
	import { useI18n } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const i18n = useI18n();
	const t = $derived(i18n.t);

	let type = $state('string');

	const VALUE_HINTS: Record<string, string> = {
		string: 'The raw string value.',
		hash: 'A JSON object mapping fields to values, e.g. {"env": "prod"} — plain text becomes the single field "value".',
		list: 'One element per line.',
		set: 'One member per line.',
		zset: 'One "score member" pair per line, e.g. "1.5 player:42".',
		stream: 'A JSON object mapping field names to values, e.g. {"kind": "signup"}.'
	};
</script>

<svelte:head>
	<title>{t('New key in db{db}', { db: data.db })} — svelteRedisAdmin</title>
</svelte:head>

<div class="flex flex-col gap-6" data-testid="new-key">
	<Breadcrumbs serverIndex={data.serverIndex} serverLabel={data.label} db={data.db} />

	<TabBar
		label={t('Database')}
		tabs={DB_TABS}
		current="new-key"
		hrefFor={(tab) => dbTabHref(data.serverIndex, data.db, tabSubPath(tab.id))}
	/>

	<PageHeader
		title={t('New key')}
		description={t('Create a key in db{db} on {label}.', { db: data.db, label: data.label })}
		icon={Plus}
	/>

	<Card.Root class="max-w-3xl">
		<Card.Content class="flex flex-col gap-5">
			{#if form && 'error' in form && form.error}
				<Alert variant="destructive">
					<CircleAlert />
					<AlertDescription>{form.error}</AlertDescription>
				</Alert>
			{/if}

			<form method="POST" action="?/create" class="flex flex-col gap-5">
				<div class="flex flex-col gap-2">
					<Label for="new-key-name">{t('Key name')}</Label>
					<Input
						id="new-key-name"
						name="key"
						required
						maxlength={5120}
						value={form && 'key' in form ? form.key : ''}
						placeholder="e.g. app:session:123"
						class="font-mono"
					/>
				</div>

				<div class="flex flex-col gap-2">
					<Label for="new-key-type">{t('Type')}</Label>
					<NativeSelect id="new-key-type" name="type" bind:value={type}>
						{#each KEY_TYPES as option (option)}
							<option value={option}>{option}</option>
						{/each}
					</NativeSelect>
				</div>

				<div class="flex flex-col gap-2">
					<Label for="new-key-value">{t('Initial value')}</Label>
					<p class="text-sm text-muted-foreground">
						{VALUE_HINTS[type] === undefined ? '' : t(VALUE_HINTS[type])}
					</p>
					<Textarea
						id="new-key-value"
						name="value"
						rows={8}
						value={form && 'value' in form ? form.value : ''}
						class="font-mono"
					/>
				</div>

				<div class="flex flex-col gap-2">
					<Label for="new-key-ttl">{t('TTL (seconds, optional)')}</Label>
					<Input
						id="new-key-ttl"
						name="ttl"
						type="number"
						min={0}
						placeholder={t('no expiry')}
						class="w-40"
					/>
				</div>

				<div class="flex items-center gap-2">
					<Button type="submit">
						<Plus />
						{t('Create key')}
					</Button>
					<Button variant="ghost" href={dbHref(data.serverIndex, data.db)}>{t('Cancel')}</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
