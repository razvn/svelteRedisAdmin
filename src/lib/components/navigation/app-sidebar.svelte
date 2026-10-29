<script lang="ts">
	import { resolve } from '$app/paths';
	import { bare } from '#lib/nav/paths.ts';
	import { page } from '$app/state';
	import Database from '@lucide/svelte/icons/database';
	import Server from '@lucide/svelte/icons/server';
	import BrandMark from '#lib/components/app-shell/brand-mark.svelte';
	import * as Sidebar from '#lib/components/ui/sidebar/index.ts';
	import { dbHref, serverHref } from '#lib/nav/paths.ts';
	import { useI18n } from '#lib/i18n/index.ts';

	interface ServerEntry {
		index: number;
		label: string;
		databases: number;
		defaultDb: number;
	}

	interface Props {
		servers: ServerEntry[];
	}

	let { servers }: Props = $props();

	const i18n = useI18n();
	const t = $derived(i18n.t);

	const currentIndex = $derived.by(() => {
		const id = page.params['id'];
		if (id === undefined) return null;
		const index = Number(id);
		return servers.some((s) => s.index === index) ? index : null;
	});
	const current = $derived(servers.find((s) => s.index === currentIndex));
	const databases = $derived(
		current ? Array.from({ length: Math.min(current.databases, 256) }, (_, i) => i) : []
	);
</script>

<Sidebar.Root collapsible="icon" data-testid="app-sidebar">
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg">
					{#snippet child({ props })}
						<a {...props} href={resolve(bare('/'))} aria-label="svelteRedisAdmin home">
							<BrandMark />
							<span class="flex min-w-0 flex-col leading-tight">
								<span class="truncate text-sm font-semibold">svelteRedisAdmin</span>
								<span class="truncate text-xs text-muted-foreground">{t('Redis web admin')}</span>
							</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupLabel>{t('Servers')}</Sidebar.GroupLabel>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#each servers as server (server.index)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={server.index === currentIndex}>
								{#snippet child({ props })}
									<a {...props} href={resolve(bare(serverHref(server.index)))}>
										<Server />
										<span class="truncate">{server.label}</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>

		{#if current}
			<Sidebar.Group>
				<Sidebar.GroupLabel>{t('Databases')}</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each databases as db (db)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={Number(page.params['db']) === db}>
									{#snippet child({ props })}
										<a {...props} href={resolve(bare(dbHref(current.index, db)))}>
											<Database />
											<span class="tabular-nums">db{db}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		{/if}
	</Sidebar.Content>
	<Sidebar.Rail />
</Sidebar.Root>
