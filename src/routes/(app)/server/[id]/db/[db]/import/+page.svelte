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
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Import into db{data.db} — svelteRedisAdmin</title></svelte:head>

<div class="flex flex-col gap-6" data-testid="import">
	<Breadcrumbs serverIndex={data.serverIndex} serverLabel={data.label} db={data.db} />

	<TabBar
		label="Database"
		tabs={DB_TABS}
		current="import"
		hrefFor={(tab) => dbTabHref(data.serverIndex, data.db, tabSubPath(tab.id))}
	/>

	<PageHeader
		title="Import"
		description={`Recreate keys in db${data.db} on ${data.label} from a JSON dump.`}
		icon={Upload}
	/>

	<Card.Root class="max-w-3xl">
		<Card.Content class="flex flex-col gap-5">
			{#if form && 'error' in form}
				<Alert variant="destructive">
					<CircleAlert />
					<AlertTitle>Import failed</AlertTitle>
					<AlertDescription>{form.error}</AlertDescription>
				</Alert>
			{:else if form}
				<Alert variant="success">
					<CircleCheck />
					<AlertTitle>Imported {form.imported} of {form.total} keys</AlertTitle>
					<AlertDescription>
						{#if form.errors.length > 0}
							{form.errors.length} keys could not be imported.
						{:else}
							Every key of the dump was recreated.
						{/if}
					</AlertDescription>
				</Alert>
				{#if form.errors.length > 0}
					<Alert variant="warning">
						<CircleAlert />
						<AlertTitle>Per-key errors</AlertTitle>
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
					<Label for="import-file">JSON dump</Label>
					<Input
						id="import-file"
						type="file"
						name="file"
						accept="application/json,.json"
						required
					/>
				</div>
				<p class="text-sm text-muted-foreground">
					Upload a file produced by the Export tab: <code class="font-mono"
						>{'{"keys": [{"key": ..., "type": ..., "ttl": ..., "value": ...}]}'}</code
					>. Existing keys with the same name are overwritten.
				</p>
				<div>
					<Button type="submit">
						<Upload />
						Import keys
					</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
