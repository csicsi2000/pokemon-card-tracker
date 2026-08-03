<script lang="ts">
	import type { Card } from '$lib/types';
	import CardImage from './CardImage.svelte';
	import { cn } from '$lib/utils';

	let {
		card,
		owned = 0,
		onclick,
		class: className
	}: {
		card: Card;
		owned?: number;
		onclick?: () => void;
		class?: string;
	} = $props();

	const shell = $derived(
		cn(
			'group block w-full text-left transition-transform duration-200',
			onclick && 'hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:outline-none',
			className
		)
	);
</script>

{#snippet body()}
	<div
		class="ring-border/60 group-hover:ring-primary/40 relative aspect-[63/88] overflow-hidden rounded-xl ring-1 transition-shadow group-hover:shadow-xl"
	>
		<CardImage {card} class="size-full" />

		{#if owned > 0}
			<span
				class="bg-primary text-primary-foreground absolute top-1.5 right-1.5 rounded-full px-2 py-0.5 text-xs font-semibold shadow"
			>
				{owned}
			</span>
		{/if}
	</div>

	<div class="mt-1.5 px-0.5">
		<p class="truncate text-xs font-medium">{card.name}</p>
		<p class="text-muted-foreground truncate text-[11px]">
			{card.set.ptcglCode ?? card.set.id} · {card.localId}
		</p>
	</div>
{/snippet}

<!-- A real <button> when it does something, a plain <div> when it is just a thumbnail. -->
{#if onclick}
	<button type="button" {onclick} class={shell}>
		{@render body()}
	</button>
{:else}
	<div class={shell}>
		{@render body()}
	</div>
{/if}
