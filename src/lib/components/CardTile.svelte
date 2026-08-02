<script lang="ts">
	import type { CardWithSet } from '$lib/database.types';
	import { cardImage } from '$lib/tcg/queries';
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';

	let {
		card,
		owned = 0,
		href,
		onclick,
		footer,
		class: className
	}: {
		card: CardWithSet;
		owned?: number;
		href?: string;
		onclick?: () => void;
		footer?: Snippet;
		class?: string;
	} = $props();

	const image = $derived(cardImage(card.image_url));
</script>

<svelte:element
	this={href ? 'a' : 'div'}
	{href}
	{onclick}
	role={onclick ? 'button' : undefined}
	tabindex={onclick ? 0 : undefined}
	class={cn(
		'group relative block text-left transition-transform duration-200',
		(href || onclick) && 'hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:outline-none',
		className
	)}
>
	<div
		class="bg-muted ring-border/60 group-hover:ring-primary/40 relative aspect-[63/88] overflow-hidden rounded-xl ring-1 transition-shadow group-hover:shadow-xl"
	>
		{#if image}
			<img
				src={image}
				alt={card.name}
				loading="lazy"
				decoding="async"
				class="size-full object-cover"
			/>
		{:else}
			<div class="text-muted-foreground grid size-full place-items-center p-2 text-center text-xs">
				{card.name}
			</div>
		{/if}

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
			{card.set?.ptcgl_code ?? card.set_id} · {card.local_id}
		</p>
	</div>

	{#if footer}{@render footer()}{/if}
</svelte:element>
