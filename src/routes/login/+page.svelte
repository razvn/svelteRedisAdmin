<script lang="ts">
	import Database from '@lucide/svelte/icons/database';
	import { resolve } from '$app/paths';
	import BrandMark from '#lib/components/app-shell/brand-mark.svelte';
	import { bare } from '#lib/nav/paths.ts';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import { useI18n } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const i18n = useI18n();
	const t = $derived(i18n.t);

	let submitting = $state(false);
</script>

<svelte:head><title>{t('Sign in')} - svelteRedisAdmin</title></svelte:head>

<!-- Split layout: gradient brand panel (with the logo on a white liseré) + sign-in card. -->
<main
	class="grid min-h-screen bg-background text-foreground lg:grid-cols-[1fr_minmax(26rem,32rem)]"
>
	<div
		class="relative hidden flex-col items-center justify-center gap-8 overflow-hidden bg-gradient-to-br from-primary to-violet-600 p-10 lg:flex"
		data-testid="brand-panel"
	>
		<!-- soft plates echoing the logo, decorative -->
		<div
			aria-hidden="true"
			class="absolute -top-16 -left-16 h-64 w-64 rotate-12 rounded-3xl bg-white/10"
		></div>
		<div
			aria-hidden="true"
			class="absolute -right-20 -bottom-24 h-80 w-80 -rotate-6 rounded-3xl bg-black/10"
		></div>

		<div
			class="relative rounded-3xl border-2 border-white/90 bg-white/10 p-8 shadow-2xl backdrop-blur-xs"
			data-testid="brand-tile"
		>
			<BrandMark class="size-28 rounded-2xl" />
		</div>
		<div class="relative flex flex-col items-center gap-2 text-center">
			<p class="text-2xl font-semibold tracking-tight text-white">svelteRedisAdmin</p>
			<p class="max-w-64 text-sm text-white/80">{t('Web admin for Redis databases.')}</p>
		</div>
	</div>

	<div class="flex flex-col items-center justify-center gap-6 p-4 sm:p-8">
		<a
			href={resolve(bare('/'))}
			class="flex items-center gap-3 lg:hidden"
			aria-label="svelteRedisAdmin home"
		>
			<BrandMark />
			<span class="text-lg font-semibold tracking-tight">svelteRedisAdmin</span>
		</a>

		<h1 class="sr-only">{t('Sign in')}</h1>

		<Card.Root class="w-full max-w-sm gap-0 py-0">
			<Card.Header class="border-b py-5">
				<Card.Title>{t('Sign in')}</Card.Title>
				<!-- eslint-disable svelte/no-at-html-tags -- trusted catalog string, no user data -->
				<Card.Description
					>{@html i18n.t(
						'Credentials from the <code>config.json</code> <code>login</code> list.'
					)}</Card.Description
				>
				<!-- eslint-enable svelte/no-at-html-tags -->
			</Card.Header>
			<Card.Content class="p-5">
				<form
					method="POST"
					class="flex flex-col gap-4"
					onsubmit={() => (submitting = true)}
					data-testid="login-form"
				>
					{#if form?.error}
						<Alert variant="destructive" data-testid="login-error">
							<AlertDescription>{form.error}</AlertDescription>
						</Alert>
					{/if}
					<div class="flex flex-col gap-2">
						<Label for="username">{t('Username')}</Label>
						<Input
							id="username"
							name="username"
							value={form?.username ?? data.username}
							autocomplete="username"
							required
						/>
					</div>
					<div class="flex flex-col gap-2">
						<Label for="password">{t('Password')}</Label>
						<Input
							id="password"
							name="password"
							type="password"
							autocomplete="current-password"
							required
						/>
					</div>
					<Button type="submit" class="w-full" disabled={submitting}>
						<Database />
						{submitting ? t('Signing in…') : t('Sign in')}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</div>
</main>
