<script lang="ts">
	import Clock from '@lucide/svelte/icons/clock';
	import PenLine from '@lucide/svelte/icons/pen-line';
	import Plus from '@lucide/svelte/icons/plus';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Breadcrumbs from '#lib/components/app-shell/breadcrumbs.svelte';
	import PageHeader from '#lib/components/app-shell/page-header.svelte';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.ts';
	import { Alert, AlertDescription, AlertTitle } from '#lib/components/ui/alert/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import * as Dialog from '#lib/components/ui/dialog/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import * as Table from '#lib/components/ui/table/index.ts';
	import { Textarea } from '#lib/components/ui/textarea/index.ts';
	import { keyTypeVariant, ttlPill, wireText } from '#lib/redis-format.ts';
	import { keyHref } from '#lib/nav/paths.ts';
	import { useI18n } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const i18n = useI18n();
	const t = $derived(i18n.t);
	const tn = $derived(i18n.tn);

	const PAGE_SIZE = 100;

	const badge = $derived(
		keyTypeVariant(data.type as 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream' | 'unknown')
	);
	const pill = $derived(ttlPill(data.ttl));
	const back = $derived(keyHref(data.serverIndex, data.db, data.key));
	const hasPagination = $derived(
		data.value.type !== 'string' && (data.offset > 0 || data.value.length === PAGE_SIZE)
	);
	const prevOffset = $derived(Math.max(0, data.offset - PAGE_SIZE));
	const nextOffset = $derived(data.offset + PAGE_SIZE);

	// String editor: the textarea keeps its own DOM state so Pretty print / Raw
	// can swap its content without re-rendering the page.
	let stringArea = $state<HTMLTextAreaElement | null>(null);
	const rawText = $derived(
		data.value.type === 'string' && data.value.value.kind === 'text' ? data.value.value.text : ''
	);

	function prettyPrint() {
		if (stringArea && data.json) stringArea.value = data.json;
	}

	function rawAgain() {
		if (stringArea) stringArea.value = rawText;
	}
</script>

{#snippet binary(base64: string)}
	<Badge variant="muted">{t('binary')}</Badge>
	<span class="block font-mono text-xs break-all text-muted-foreground">
		{base64.slice(0, 96)}{base64.length > 96 ? '…' : ''}
	</span>
{/snippet}

{#snippet offsetFields()}
	<input type="hidden" name="offset" value={data.offset} />
{/snippet}

<svelte:head><title>{data.key} — svelteRedisAdmin</title></svelte:head>

<div class="flex flex-col gap-6" data-testid="key-view">
	<Breadcrumbs
		serverIndex={data.serverIndex}
		serverLabel={data.label}
		db={data.db}
		key={data.key}
	/>

	<PageHeader
		title={data.key}
		description={t('{label} · db{db} · {type} key', {
			label: data.label,
			db: data.db,
			type: data.type
		})}
	>
		<div class="mt-2 flex flex-wrap items-center gap-2">
			<Badge variant={badge}>{data.type}</Badge>
			{#if data.size !== null}
				<Badge variant="info">
					{data.type === 'string'
						? tn('{n} byte', '{n} bytes', data.size)
						: tn('{n} entry', '{n} entries', data.size)}
				</Badge>
			{/if}
			{#if data.encoding}
				<Badge variant="muted">{data.encoding}</Badge>
			{/if}
			<Badge variant={pill.variant}>{t(pill.label)}</Badge>
		</div>
		{#snippet actions()}
			<Button href={back} variant="outline" size="sm">
				<RefreshCw />
				{t('Refresh')}
			</Button>

			<Dialog.Root>
				<Dialog.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" size="sm">
							<Clock />
							TTL
						</Button>
					{/snippet}
				</Dialog.Trigger>
				<Dialog.Content class="sm:max-w-md">
					<Dialog.Header>
						<Dialog.Title>{t('Edit TTL')}</Dialog.Title>
						<Dialog.Description>
							{t('Current: {pill}. Set an expiry in seconds for this key.', {
								pill: t(pill.label)
							})}
						</Dialog.Description>
					</Dialog.Header>
					<form method="POST" action="?/ttl" class="flex flex-col gap-4">
						{@render offsetFields()}
						<div class="flex flex-col gap-2">
							<Label for="ttl-seconds">{t('Seconds')}</Label>
							<Input
								id="ttl-seconds"
								name="seconds"
								type="number"
								min={0}
								placeholder={t('no expiry')}
							/>
						</div>
						<p class="text-sm text-muted-foreground">
							{t('Empty or 0 removes the expiry (PERSIST); a positive value sets EXPIRE.')}
						</p>
						<Dialog.Footer>
							<Button type="submit" size="sm">{t('Apply')}</Button>
						</Dialog.Footer>
					</form>
				</Dialog.Content>
			</Dialog.Root>

			<Dialog.Root>
				<Dialog.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" size="sm">
							<PenLine />
							{t('Rename')}
						</Button>
					{/snippet}
				</Dialog.Trigger>
				<Dialog.Content class="sm:max-w-md">
					<Dialog.Header>
						<Dialog.Title>{t('Rename key')}</Dialog.Title>
						<Dialog.Description>{t('Moving the key keeps its value and TTL.')}</Dialog.Description>
					</Dialog.Header>
					<form method="POST" action="?/rename" class="flex flex-col gap-4">
						<div class="flex flex-col gap-2">
							<Label for="rename-name">{t('New name')}</Label>
							<Input
								id="rename-name"
								name="name"
								required
								maxlength={5120}
								value={data.key}
								class="font-mono"
							/>
						</div>
						<Dialog.Footer>
							<Button type="submit" size="sm">{t('Rename')}</Button>
						</Dialog.Footer>
					</form>
				</Dialog.Content>
			</Dialog.Root>

			<form method="POST" action="?/delete" id="key-delete-form">
				<AlertDialog.Root>
					<AlertDialog.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="destructive" size="sm">
								<Trash2 />
								{t('Delete')}
							</Button>
						{/snippet}
					</AlertDialog.Trigger>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>{t('Delete “{key}”?', { key: data.key })}</AlertDialog.Title>
							<AlertDialog.Description>
								{t('The {type} key and its value are removed. This cannot be undone.', {
									type: data.type
								})}
							</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>{t('Cancel')}</AlertDialog.Cancel>
							<AlertDialog.Action variant="destructive" type="submit" form="key-delete-form">
								{t('Delete key')}
							</AlertDialog.Action>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Root>
			</form>
		{/snippet}
	</PageHeader>

	{#if data.type === 'string' && data.value.type === 'string'}
		<Card.Root>
			<Card.Header class="border-b py-5">
				<Card.Title>{t('Value')}</Card.Title>
				{#if data.encoding}
					<Card.Description
						>{t('encoded as {encoding}', { encoding: data.encoding })}</Card.Description
					>
				{/if}
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				{#if data.value.value.kind === 'text'}
					<form method="POST" action="?/save-string" id="save-string-form">
						<Textarea
							name="value"
							bind:ref={stringArea}
							value={rawText}
							rows={12}
							class="font-mono"
						/>
					</form>
					{#if data.json}
						<p class="text-xs text-muted-foreground">{t('This value parses as JSON.')}</p>
					{/if}
					<div class="flex flex-wrap items-center gap-2">
						<Button variant="outline" size="sm" onclick={prettyPrint} disabled={!data.json}>
							{t('Pretty print')}
						</Button>
						<Button variant="ghost" size="sm" onclick={rawAgain} disabled={!data.json}>
							{t('Raw')}
						</Button>
						<Button type="submit" form="save-string-form" size="sm">{t('Save')}</Button>
					</div>
				{:else}
					<Alert variant="warning">
						<TriangleAlert />
						<AlertTitle>{t('Binary value')}</AlertTitle>
						<AlertDescription>
							{t(
								'This value is not valid UTF-8, so it is shown base64-encoded and cannot be edited here.'
							)}
						</AlertDescription>
					</Alert>
					<Textarea readonly rows={6} value={data.value.value.base64} class="font-mono" />
				{/if}
			</Card.Content>
		</Card.Root>
	{:else if data.value.type === 'hash'}
		<Card.Root class="gap-0 py-0" data-testid="hash-fields">
			<Card.Header class="border-b py-5">
				<Card.Title
					>{t('Fields')}
					<span class="font-normal text-muted-foreground">({data.value.length})</span></Card.Title
				>
			</Card.Header>
			<Card.Content class="px-0">
				{#if data.value.entries.length === 0}
					<p class="p-10 text-center text-sm text-muted-foreground">{t('This hash is empty.')}</p>
				{:else}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="w-2/5">{t('Field')}</Table.Head>
								<Table.Head>{t('Value')}</Table.Head>
								<Table.Head class="w-12"><span class="sr-only">{t('Delete')}</span></Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each data.value.entries as entry, index (index)}
								{@const fieldText = wireText(entry.field)}
								<Table.Row>
									<Table.Cell class="font-mono break-all">
										{fieldText}
										{#if entry.field.kind === 'binary'}{@render binary(entry.field.base64)}{/if}
									</Table.Cell>
									<Table.Cell class="w-3/5">
										{#if entry.value.kind === 'text'}
											<form method="POST" action="?/hset" class="flex items-center gap-2">
												<input type="hidden" name="field" value={fieldText} />
												{@render offsetFields()}
												<Input
													name="value"
													value={entry.value.text}
													class="min-w-0 flex-1 font-mono"
												/>
												<Button type="submit" variant="outline" size="xs">{t('Save')}</Button>
											</form>
										{:else}
											{@render binary(entry.value.base64)}
										{/if}
									</Table.Cell>
									<Table.Cell class="text-end">
										<form method="POST" action="?/hdel">
											<input type="hidden" name="field" value={fieldText} />
											{@render offsetFields()}
											<Button
												type="submit"
												variant="ghost"
												size="icon-sm"
												aria-label={t('Delete field {field}', { field: fieldText })}
											>
												<Trash2 />
											</Button>
										</form>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{/if}
			</Card.Content>
			<Card.Footer class="border-t p-5">
				<form method="POST" action="?/hset" class="flex flex-wrap items-center gap-2">
					{@render offsetFields()}
					<Input
						name="field"
						required
						placeholder={t('field')}
						aria-label={t('New field name')}
						class="w-48 font-mono"
					/>
					<Input
						name="value"
						placeholder={t('value')}
						aria-label={t('New field value')}
						class="min-w-48 flex-1 font-mono"
					/>
					<Button type="submit" variant="outline" size="sm">
						<Plus />
						Add field
					</Button>
				</form>
			</Card.Footer>
		</Card.Root>
	{:else if data.value.type === 'list'}
		<Card.Root class="gap-0 py-0" data-testid="list-items">
			<Card.Header class="border-b py-5">
				<Card.Title
					>{t('Elements')}
					<span class="font-normal text-muted-foreground">({data.value.length})</span></Card.Title
				>
				{#if data.value.entries.length > 0}
					<Card.Description>
						{t('showing indexes {start}–{end}', {
							start: data.value.start,
							end: data.value.start + data.value.entries.length - 1
						})}
					</Card.Description>
				{/if}
			</Card.Header>
			<Card.Content class="px-0">
				{#if data.value.entries.length === 0}
					<p class="p-10 text-center text-sm text-muted-foreground">{t('This list is empty.')}</p>
				{:else}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="w-16 text-end">{t('Index')}</Table.Head>
								<Table.Head>Value</Table.Head>
								<Table.Head class="w-12"><span class="sr-only">{t('Delete')}</span></Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each data.value.entries as entry (entry.index)}
								<Table.Row>
									<Table.Cell class="text-end tabular-nums">{entry.index}</Table.Cell>
									<Table.Cell>
										{#if entry.value.kind === 'text'}
											<form method="POST" action="?/lset" class="flex items-center gap-2">
												<input type="hidden" name="index" value={entry.index} />
												{@render offsetFields()}
												<Input
													name="value"
													value={entry.value.text}
													class="min-w-0 flex-1 font-mono"
												/>
												<Button type="submit" variant="outline" size="xs">{t('Save')}</Button>
											</form>
										{:else}
											{@render binary(entry.value.base64)}
										{/if}
									</Table.Cell>
									<Table.Cell class="text-end">
										<form method="POST" action="?/ldel">
											<input type="hidden" name="index" value={entry.index} />
											{@render offsetFields()}
											<Button
												type="submit"
												variant="ghost"
												size="icon-sm"
												aria-label={t('Delete element {index}', { index: entry.index })}
											>
												<Trash2 />
											</Button>
										</form>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{/if}
			</Card.Content>
			<Card.Footer class="border-t p-5">
				<form method="POST" action="?/lpush" class="flex flex-wrap items-center gap-2">
					{@render offsetFields()}
					<Input
						name="value"
						required
						placeholder={t('value')}
						aria-label={t('New last element')}
						class="min-w-48 flex-1 font-mono"
					/>
					<Button type="submit" variant="outline" size="sm">
						<Plus />
						{t('Push tail')}
					</Button>
				</form>
			</Card.Footer>
		</Card.Root>
	{:else if data.value.type === 'set'}
		<Card.Root class="gap-0 py-0" data-testid="set-members">
			<Card.Header class="border-b py-5">
				<Card.Title
					>{t('Members')}
					<span class="font-normal text-muted-foreground">({data.value.length})</span></Card.Title
				>
			</Card.Header>
			<Card.Content class="px-0">
				{#if data.value.members.length === 0}
					<p class="p-10 text-center text-sm text-muted-foreground">{t('This set is empty.')}</p>
				{:else}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{t('Member')}</Table.Head>
								<Table.Head class="w-12"><span class="sr-only">{t('Delete')}</span></Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each data.value.members as member, index (index)}
								{@const memberText = wireText(member)}
								<Table.Row>
									<Table.Cell class="font-mono break-all">
										{memberText}
										{#if member.kind === 'binary'}{@render binary(member.base64)}{/if}
									</Table.Cell>
									<Table.Cell class="text-end">
										{#if member.kind === 'text'}
											<form method="POST" action="?/srem">
												<input type="hidden" name="member" value={memberText} />
												{@render offsetFields()}
												<Button
													type="submit"
													variant="ghost"
													size="icon-sm"
													aria-label={t('Remove member {member}', { member: memberText })}
												>
													<Trash2 />
												</Button>
											</form>
										{/if}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{/if}
			</Card.Content>
			<Card.Footer class="border-t p-5">
				<form method="POST" action="?/sadd" class="flex flex-wrap items-center gap-2">
					{@render offsetFields()}
					<Input
						name="member"
						required
						placeholder={t('member')}
						aria-label={t('New member')}
						class="min-w-48 flex-1 font-mono"
					/>
					<Button type="submit" variant="outline" size="sm">
						<Plus />
						{t('Add member')}
					</Button>
				</form>
			</Card.Footer>
		</Card.Root>
	{:else if data.value.type === 'zset'}
		<Card.Root class="gap-0 py-0" data-testid="zset-entries">
			<Card.Header class="border-b py-5">
				<Card.Title
					>{t('Sorted entries')}
					<span class="font-normal text-muted-foreground">({data.value.length})</span></Card.Title
				>
			</Card.Header>
			<Card.Content class="px-0">
				{#if data.value.entries.length === 0}
					<p class="p-10 text-center text-sm text-muted-foreground">
						{t('This sorted set is empty.')}
					</p>
				{:else}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{t('Member')}</Table.Head>
								<Table.Head class="w-32">{t('Score')}</Table.Head>
								<Table.Head class="w-12"><span class="sr-only">{t('Delete')}</span></Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each data.value.entries as entry, index (index)}
								{@const memberText = wireText(entry.member)}
								<Table.Row>
									<Table.Cell class="font-mono break-all">
										{memberText}
										{#if entry.member.kind === 'binary'}{@render binary(entry.member.base64)}{/if}
									</Table.Cell>
									<Table.Cell>
										{#if entry.member.kind === 'text'}
											<form method="POST" action="?/zadd" class="flex items-center gap-2">
												<input type="hidden" name="member" value={memberText} />
												{@render offsetFields()}
												<Input
													name="score"
													type="number"
													step="any"
													value={entry.score}
													aria-label={t('Score of {member}', { member: memberText })}
													class="w-24"
												/>
												<Button type="submit" variant="outline" size="xs">{t('Save')}</Button>
											</form>
										{:else}
											<span class="tabular-nums">{entry.score}</span>
										{/if}
									</Table.Cell>
									<Table.Cell class="text-end">
										{#if entry.member.kind === 'text'}
											<form method="POST" action="?/zrem">
												<input type="hidden" name="member" value={memberText} />
												{@render offsetFields()}
												<Button
													type="submit"
													variant="ghost"
													size="icon-sm"
													aria-label={t('Remove member {member}', { member: memberText })}
												>
													<Trash2 />
												</Button>
											</form>
										{/if}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{/if}
			</Card.Content>
			<Card.Footer class="border-t p-5">
				<form method="POST" action="?/zadd" class="flex flex-wrap items-center gap-2">
					{@render offsetFields()}
					<Input
						name="member"
						required
						placeholder={t('member')}
						aria-label={t('New member')}
						class="w-48 font-mono"
					/>
					<Input
						name="score"
						type="number"
						step="any"
						required
						placeholder={t('score')}
						aria-label={t('New member score')}
						class="w-24"
					/>
					<Button type="submit" variant="outline" size="sm">
						<Plus />
						Add
					</Button>
				</form>
			</Card.Footer>
		</Card.Root>
	{:else if data.value.type === 'stream'}
		<Card.Root class="gap-0 py-0" data-testid="stream-entries">
			<Card.Header class="border-b py-5">
				<Card.Title
					>{t('Entries')}
					<span class="font-normal text-muted-foreground">({data.value.length})</span></Card.Title
				>
			</Card.Header>
			<Card.Content class="px-0">
				{#if data.value.entries.length === 0}
					<p class="p-10 text-center text-sm text-muted-foreground">{t('This stream is empty.')}</p>
				{:else}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="w-48">{t('ID')}</Table.Head>
								<Table.Head>{t('Fields')}</Table.Head>
								<Table.Head class="w-12"><span class="sr-only">{t('Delete')}</span></Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each data.value.entries as entry (entry.id)}
								<Table.Row>
									<Table.Cell class="font-mono">{entry.id}</Table.Cell>
									<Table.Cell>
										<div class="flex flex-col gap-0.5">
											{#each entry.fields as field, index (index)}
												<div class="font-mono text-xs break-all">
													<span class="text-muted-foreground">{wireText(field.name)}:</span>
													{wireText(field.value)}
													{#if field.name.kind === 'binary'}
														{@render binary(field.name.base64)}
													{:else if field.value.kind === 'binary'}
														{@render binary(field.value.base64)}
													{/if}
												</div>
											{/each}
										</div>
									</Table.Cell>
									<Table.Cell class="text-end">
										<form method="POST" action="?/xdel">
											<input type="hidden" name="id" value={entry.id} />
											{@render offsetFields()}
											<Button
												type="submit"
												variant="ghost"
												size="icon-sm"
												aria-label={t('Delete entry {id}', { id: entry.id })}
											>
												<Trash2 />
											</Button>
										</form>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{/if}
			</Card.Content>
			<Card.Footer class="border-t p-5">
				<form method="POST" action="?/xadd" class="flex flex-wrap items-center gap-2">
					{@render offsetFields()}
					<Input
						name="name"
						required
						placeholder={t('field name')}
						aria-label={t('New entry field name')}
						class="w-48 font-mono"
					/>
					<Input
						name="value"
						placeholder={t('value')}
						aria-label={t('New entry field value')}
						class="min-w-48 flex-1 font-mono"
					/>
					<Button type="submit" variant="outline" size="sm">
						<Plus />
						{t('Add entry')}
					</Button>
				</form>
			</Card.Footer>
		</Card.Root>
	{/if}

	{#if hasPagination}
		<div class="flex items-center justify-between">
			<Button
				href={prevOffset > 0 ? `${back}?offset=${prevOffset}` : back}
				disabled={data.offset === 0}
				variant="outline"
				size="sm"
			>
				<ChevronLeft />
				{t('Previous')}
			</Button>
			<span class="text-sm text-muted-foreground"
				>{t('offset {offset}', { offset: data.offset })}</span
			>
			<Button
				href={`${back}?offset=${nextOffset}`}
				disabled={data.value.type === 'string' || data.value.length < PAGE_SIZE}
				variant="outline"
				size="sm"
			>
				{t('Next')}
				<ChevronRight />
			</Button>
		</div>
	{/if}
</div>
