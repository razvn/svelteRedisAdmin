<script lang="ts">
	import LogOut from '@lucide/svelte/icons/log-out';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import { useI18n } from '#lib/i18n/index.ts';

	interface Props {
		user: string;
		role: 'admin' | 'rw' | 'ro';
		host: string;
		serverLabel: string;
		canLogout: boolean;
	}

	let { user, role, host, serverLabel, canLogout }: Props = $props();

	const i18n = useI18n();
	const t = $derived(i18n.t);

	const initials = $derived(user.slice(0, 2).toUpperCase() || '?');
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				type="button"
				aria-label="User menu"
				class="flex h-10 items-center gap-2.5 rounded-full py-1 ps-1 pe-1 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 xl:pe-3"
			>
				<span
					aria-hidden="true"
					class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
				>
					{initials}
				</span>
				<span
					class="hidden max-w-48 truncate text-sm font-medium xl:block"
					data-testid="connection-info"
				>
					{user}@{host}
				</span>
				<ChevronDown class="hidden size-4 text-muted-foreground xl:block" aria-hidden="true" />
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-64">
		<DropdownMenu.Label class="flex flex-col gap-0.5 font-normal">
			<span class="flex items-center gap-2">
				<span class="truncate text-sm font-semibold">{user}</span>
				{#if role === 'ro'}
					<Badge variant="muted" class="ms-auto">{t('Read-only')}</Badge>
				{/if}
			</span>
			<span class="truncate text-xs text-muted-foreground">{user}@{host}</span>
			<span class="truncate text-xs text-muted-foreground">{serverLabel}</span>
		</DropdownMenu.Label>
		{#if canLogout}
			<DropdownMenu.Separator />
			<form method="POST" action="/logout" class="contents">
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<button {...props} type="submit" class="{props.class} w-full">
							<LogOut />
							Log out
						</button>
					{/snippet}
				</DropdownMenu.Item>
			</form>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
