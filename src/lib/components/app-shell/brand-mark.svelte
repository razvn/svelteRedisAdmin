<script lang="ts">
	import logo from '#lib/assets/logo.svg';
	import { cn } from '#lib/utils.ts';

	interface Props {
		class?: string;
	}

	let { class: className }: Props = $props();
</script>

<!-- App logo: indigo tile, Redis-style plate stack, svelte S in Redis red. -->
<img src={logo} alt="" aria-hidden="true" class={cn('size-9 shrink-0 shadow-xs', className)} />
