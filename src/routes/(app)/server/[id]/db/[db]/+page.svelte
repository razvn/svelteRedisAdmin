<script lang="ts">
	import Database from '@lucide/svelte/icons/database';
	import ListTree from '@lucide/svelte/icons/list-tree';
	import List from '@lucide/svelte/icons/list';
	import Plus from '@lucide/svelte/icons/plus';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import Breadcrumbs from '#lib/components/app-shell/breadcrumbs.svelte';
	import PageHeader from '#lib/components/app-shell/page-header.svelte';
	import StatCard from '#lib/components/app-shell/stat-card.svelte';
	import TabBar from '#lib/components/app-shell/tab-bar.svelte';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { NativeSelect } from '#lib/components/ui/native-select/index.ts';
	import * as Table from '#lib/components/ui/table/index.ts';
	import { formatNumber } from '#lib/format.ts';
	import {
		KEY_TYPES,
		keyTypeVariant,
		ttlPill,
		withParams,
		wireFormValue,
		wireText
	} from '#lib/redis-format.ts';
	import { buildKeyTree, countTreeKeys, flattenExpanded } from '#lib/key-tree.ts';
	import { SvelteSet } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import { bare, dbHref, dbTabHref, keyHref } from '#lib/nav/paths.ts';
	import { DB_TABS, tabSubPath } from '#lib/nav/tabs.ts';
	import { useI18n } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const i18n = useI18n();
	const t = $derived(i18n.t);

	let selectedCount = $state(0);

	const prevHref = $derived(
		withParams(dbHref(data.serverIndex, data.db), {
			filter: data.filter,
			type: data.type,
			view: data.view
		})
	);
	const nextHref = $derived(
		withParams(dbHref(data.serverIndex, data.db), {
			cursor: data.cursor,
			filter: data.filter,
			type: data.type,
			view: data.view
		})
	);

	/** Same page with the other browser view, keeping filter/type/cursor. */
	function viewHref(view: 'list' | 'tree') {
		return withParams(dbHref(data.serverIndex, data.db), {
			view,
			filter: data.filter,
			type: data.type,
			cursor: data.cursor || undefined
		});
	}

	const tree = $derived(
		buildKeyTree(
			data.keys.map((item) => wireText(item.key)),
			data.separator
		)
	);
	/** Folder nodes the user opened; starts fully collapsed. */
	const expanded = new SvelteSet<string>();
	const treeRows = $derived(flattenExpanded(tree, expanded));
	const keyInfo = $derived(new Map(data.keys.map((item) => [wireText(item.key), item])));

	function toggleNode(name: string) {
		if (expanded.has(name)) expanded.delete(name);
		else expanded.add(name);
	}

	function countSelected(event: Event) {
		const form = event.currentTarget as HTMLFormElement;
		selectedCount = form.querySelectorAll<HTMLInputElement>('input[name="keys"]:checked').length;
	}

	/** Header checkbox: toggle every row checkbox of the bulk form. */
	function toggleAll(source: Event) {
		const box = source.currentTarget as HTMLInputElement;
		const form = box.closest('form');
		if (!form) return;
		for (const row of form.querySelectorAll<HTMLInputElement>('input[name="keys"]')) {
			row.checked = box.checked;
		}
		selectedCount = box.checked ? data.keys.length : 0;
	}
</script>

<svelte:head><title>db{data.db} — svelteRedisAdmin</title></svelte:head>

<div class="flex flex-col gap-6" data-testid="key-browser">
	<Breadcrumbs serverIndex={data.serverIndex} serverLabel={data.label} db={data.db} />

	<TabBar
		label={t('Database')}
		tabs={DB_TABS}
		current=""
		hrefFor={(tab) => dbTabHref(data.serverIndex, data.db, tabSubPath(tab.id))}
	/>

	<PageHeader
		title={t('Keys in db{db}', { db: data.db })}
		description={t('SCAN listing — use the filter to find keys fast')}
		icon={ListTree}
	>
		{#snippet actions()}
			{#if data.canWrite}
				<Button href={dbTabHref(data.serverIndex, data.db, 'new-key')} size="sm">
					<Plus />
					{t('New key')}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="grid gap-4 sm:grid-cols-3">
		<StatCard
			label={t('Total keys')}
			value={formatNumber(data.dbsize)}
			icon={Database}
			tone="primary"
		/>
		<StatCard
			label={t('Shown')}
			value={formatNumber(data.keys.length)}
			icon={List}
			tone="info"
			hint={data.filter ? t('filter {filter}', { filter: data.filter }) : undefined}
		/>
		<StatCard
			label={t('Next cursor')}
			value={data.cursor === 0 ? t('end') : data.cursor}
			icon={RefreshCw}
			tone="warning"
		/>
	</div>

	<Card.Root class="gap-0 py-0" data-testid="key-table">
		<div class="flex flex-wrap items-center justify-between gap-3 border-b p-5">
			<div class="flex flex-wrap items-center gap-2">
				<form
					method="GET"
					action={dbHref(data.serverIndex, data.db)}
					class="flex flex-wrap items-center gap-2"
				>
					<Input
						name="filter"
						value={data.filter}
						placeholder={t('pattern, e.g. app:*')}
						aria-label={t('Key filter')}
						class="w-56"
					/>
					<NativeSelect name="type" aria-label={t('Key type')}>
						<option value="">{t('All types')}</option>
						{#each KEY_TYPES as option (option)}
							<option value={option} selected={data.type === option}>{option}</option>
						{/each}
					</NativeSelect>
					<input type="hidden" name="view" value={data.view} />
					<Button type="submit" variant="outline" size="sm">{t('Apply')}</Button>
					<Button
						variant="ghost"
						size="sm"
						href={withParams(dbHref(data.serverIndex, data.db), {
							type: data.type,
							view: data.view
						})}
					>
						{t('Clear')}
					</Button>
				</form>

				<div class="flex items-center gap-1" role="group" aria-label={t('Browser view')}>
					<Button
						href={viewHref('list')}
						variant={data.view === 'list' ? 'default' : 'ghost'}
						size="sm"
						aria-pressed={data.view === 'list'}
					>
						<List />
						{t('List')}
					</Button>
					<Button
						href={viewHref('tree')}
						variant={data.view === 'tree' ? 'default' : 'ghost'}
						size="sm"
						aria-pressed={data.view === 'tree'}
					>
						<ListTree />
						{t('Tree')}
					</Button>
				</div>
			</div>

			{#if data.canWrite}
				<form method="POST" action="?/flush" id="flush-form">
					<input type="hidden" name="view" value={data.view} />
					<AlertDialog.Root>
						<AlertDialog.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="destructive" size="sm">
									<Trash2 />
									{t('Flush db{db}', { db: data.db })}
								</Button>
							{/snippet}
						</AlertDialog.Trigger>
						<AlertDialog.Content>
							<AlertDialog.Header>
								<AlertDialog.Title>{t('Flush db{db}?', { db: data.db })}</AlertDialog.Title>
								<AlertDialog.Description>
									{t('This deletes every key in database {db} on {label}. This cannot be undone.', {
										db: data.db,
										label: data.label
									})}
								</AlertDialog.Description>
							</AlertDialog.Header>
							<AlertDialog.Footer>
								<AlertDialog.Cancel>{t('Cancel')}</AlertDialog.Cancel>
								<AlertDialog.Action variant="destructive" type="submit" form="flush-form">
									{t('Flush db{db}', { db: data.db })}
								</AlertDialog.Action>
							</AlertDialog.Footer>
						</AlertDialog.Content>
					</AlertDialog.Root>
				</form>
			{/if}
		</div>

		<Card.Content class="px-0">
			{#if data.view === 'tree'}
				<div class="p-2" data-testid="key-tree">
					{#if data.keys.length === 0}
						<p class="p-10 text-center text-sm text-muted-foreground">
							{t('No keys match {target} — SCAN walked to the end of the keyspace.', {
								target: data.filter ? `“${data.filter}”` : t('this database')
							})}
						</p>
					{:else}
						{#each treeRows as { node, depth } (node.name)}
							{@const isExpanded = expanded.has(node.name)}
							<div
								data-testid="key-tree-node"
								class="flex items-center gap-2 rounded-lg py-1 pr-2 hover:bg-muted/60"
								style="padding-inline-start: {depth * 1.25 + 0.5}rem"
							>
								{#if node.children.length > 0}
									<Button
										variant="ghost"
										size="icon-xs"
										aria-expanded={isExpanded}
										aria-label={t(isExpanded ? 'Collapse {name}' : 'Expand {name}', {
											name: node.name
										})}
										onclick={() => toggleNode(node.name)}
									>
										{#if isExpanded}
											<ChevronDown />
										{:else}
											<ChevronRight />
										{/if}
									</Button>
								{:else}
									<span class="size-6" aria-hidden="true"></span>
								{/if}
								{#if isExpanded}
									<FolderOpen class="size-4 shrink-0 text-primary" />
								{:else}
									<Folder class="size-4 shrink-0 text-muted-foreground" />
								{/if}
								<span class="truncate font-mono text-sm">{node.segment}</span>
								<Badge variant="muted">{countTreeKeys(node)}</Badge>
							</div>
							{#if isExpanded || node.children.length === 0}
								{#each node.keys as keyText (keyText)}
									{@const item = keyInfo.get(keyText)}
									{@const pill = item ? ttlPill(item.ttl) : null}
									<div
										class="flex items-center gap-2 rounded-lg py-1 pr-2 hover:bg-muted/60"
										style="padding-inline-start: {(depth + 1) * 1.25 + 0.5}rem"
									>
										{#if item?.key.kind === 'text'}
											<a
												href={resolve(bare(keyHref(data.serverIndex, data.db, keyText)))}
												class="truncate font-mono text-foreground hover:text-primary hover:underline"
											>
												{keyText}
											</a>
										{:else}
											<span class="truncate font-mono text-muted-foreground">{keyText}</span>
											<Badge variant="muted">{t('binary name')}</Badge>
										{/if}
										{#if item && pill}
											<Badge variant={keyTypeVariant(item.type)}>{item.type}</Badge>
											<Badge variant={pill.variant}>{t(pill.label)}</Badge>
										{/if}
									</div>
								{/each}
							{/if}
						{/each}
					{/if}
				</div>
			{:else}
				<form method="POST" action="?/delete" onchange={countSelected}>
					{#if data.keys.length === 0}
						<p class="p-10 text-center text-sm text-muted-foreground">
							{t('No keys match {target} — SCAN walked to the end of the keyspace.', {
								target: data.filter ? `“${data.filter}”` : t('this database')
							})}
						</p>
					{:else}
						<Table.Root>
							<Table.Header>
								<Table.Row>
									{#if data.canWrite}
										<Table.Head class="w-10">
											<input
												type="checkbox"
												class="size-4 accent-primary"
												aria-label={t('Select all keys on this page')}
												onclick={toggleAll}
											/>
										</Table.Head>
									{/if}
									<Table.Head>{t('Key')}</Table.Head>
									<Table.Head class="w-24">{t('Type')}</Table.Head>
									<Table.Head class="w-36">{t('TTL')}</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each data.keys as item, index (wireFormValue(item.key) + index)}
									{@const keyText = wireText(item.key)}
									{@const pill = ttlPill(item.ttl)}
									<Table.Row data-testid="key-row">
										{#if data.canWrite}
											<Table.Cell>
												<input
													type="checkbox"
													name="keys"
													value={wireFormValue(item.key)}
													class="size-4 accent-primary"
													aria-label={t('Select {key}', { key: keyText })}
												/>
											</Table.Cell>
										{/if}
										<Table.Cell class="max-w-0">
											{#if item.key.kind === 'text'}
												<a
													href={resolve(bare(keyHref(data.serverIndex, data.db, keyText)))}
													class="block truncate font-mono text-foreground hover:text-primary hover:underline"
												>
													{keyText}
												</a>
											{:else}
												<span class="block truncate font-mono text-muted-foreground">{keyText}</span
												>
												<Badge variant="muted" class="mt-1">{t('binary name')}</Badge>
											{/if}
										</Table.Cell>
										<Table.Cell>
											<Badge variant={keyTypeVariant(item.type)}>{item.type}</Badge>
										</Table.Cell>
										<Table.Cell>
											<Badge variant={pill.variant}>{t(pill.label)}</Badge>
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					{/if}

					<input type="hidden" name="filter" value={data.filter} />
					<input type="hidden" name="type" value={data.type} />
					<input type="hidden" name="view" value={data.view} />
					{#if data.canWrite && data.keys.length > 0}
						<div class="flex items-center justify-between border-t p-5">
							<span class="text-sm text-muted-foreground">
								{t('{n} selected', { n: selectedCount })}
							</span>
							<Button type="submit" variant="destructive" size="sm" disabled={selectedCount === 0}>
								<Trash2 />
								{t('Delete selected')}
							</Button>
						</div>
					{/if}
				</form>
			{/if}

			<div class="flex items-center justify-between border-t p-5">
				<Button href={prevHref} disabled={data.isFirstPage} variant="outline" size="sm">
					<ChevronLeft />
					{t('Previous page')}
				</Button>
				<span class="text-sm text-muted-foreground">
					{t('next cursor: {cursor}', {
						cursor: data.cursor === 0 ? t('end') : data.cursor
					})}
				</span>
				<Button href={nextHref} disabled={data.cursor === 0} variant="outline" size="sm">
					{t('Next page')}
					<ChevronRight />
				</Button>
			</div>
		</Card.Content>
	</Card.Root>
</div>
