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
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let submitting = $state(false);
</script>

<svelte:head><title>Sign in - svelteRedisAdmin</title></svelte:head>

<main
	class="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4 text-foreground"
>
	<a href={resolve(bare('/'))} class="flex items-center gap-3" aria-label="svelteRedisAdmin home">
		<BrandMark />
		<span class="text-lg font-semibold tracking-tight">svelteRedisAdmin</span>
	</a>

	<h1 class="sr-only">Sign in</h1>

	<Card.Root class="w-full max-w-sm gap-0 py-0">
		<Card.Header class="border-b py-5">
			<Card.Title>Sign in</Card.Title>
			<Card.Description
				>Credentials from the <code class="font-mono text-xs">config.json</code>
				<code class="font-mono text-xs">login</code> list.</Card.Description
			>
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
					<Label for="username">Username</Label>
					<Input
						id="username"
						name="username"
						value={form?.username ?? data.username}
						autocomplete="username"
						required
					/>
				</div>
				<div class="flex flex-col gap-2">
					<Label for="password">Password</Label>
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
					{submitting ? 'Signing in…' : 'Sign in'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</main>
