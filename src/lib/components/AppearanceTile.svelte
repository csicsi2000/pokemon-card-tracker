<script lang="ts">
	/**
	 * The small square that fronts a lot or folder card: its emoji on a tinted background,
	 * or the default icon (folder, package…) when no emoji was chosen. Without a colour it
	 * sits on the muted background, so every card in a grid lines up the same way.
	 */
	import type { Snippet } from 'svelte';
	import type { Appearance } from '$lib/data/model';
	import { cn } from '$lib/utils';
	import { TINT } from './appearance-classes';

	let {
		appearance,
		fallback,
		class: className
	}: {
		appearance: Appearance;
		/** Rendered when there is no emoji — an icon component, usually. */
		fallback?: Snippet;
		class?: string;
	} = $props();
</script>

<span
	class={cn(
		'grid size-8 shrink-0 place-items-center rounded-lg text-base leading-none',
		appearance.color ? TINT[appearance.color] : 'bg-muted text-primary',
		className
	)}
	aria-hidden="true"
>
	{#if appearance.icon}
		{appearance.icon}
	{:else}
		{@render fallback?.()}
	{/if}
</span>
