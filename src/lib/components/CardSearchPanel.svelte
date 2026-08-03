<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import CardImage from './CardImage.svelte';
	import { searchCards, type Catalogue } from '$lib/catalogue';
	import Search from '@lucide/svelte/icons/search';
	import Plus from '@lucide/svelte/icons/plus';
	import type { Card } from '$lib/types';

	let {
		catalogue,
		onadd,
		placeholder = 'Search cards to add…'
	}: { catalogue: Catalogue; onadd: (card: Card) => void; placeholder?: string } = $props();

	let query = $state('');

	// The catalogue is in memory, so searching on every keystroke is cheap.
	const results = $derived(
		query.trim().length < 2 ? [] : searchCards(catalogue, { query: query.trim() }, 40)
	);
</script>

<div class="flex min-h-0 flex-col gap-3">
	<div class="relative">
		<Search
			class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
		/>
		<Input bind:value={query} {placeholder} class="pl-9" />
	</div>

	<div class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
		{#if query.trim().length >= 2 && results.length === 0}
			<p class="text-muted-foreground p-3 text-sm">Nothing found.</p>
		{/if}

		{#each results as card (card.id)}
			<button
				type="button"
				class="hover:bg-accent flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors"
				onclick={() => onadd(card)}
			>
				<CardImage {card} class="h-12 w-9 shrink-0 rounded" />
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium">{card.name}</p>
					<p class="text-muted-foreground truncate text-xs">
						{card.set.ptcglCode ?? card.set.id} · #{card.localId}
					</p>
				</div>
				<Plus class="text-muted-foreground size-4 shrink-0" />
			</button>
		{/each}
	</div>
</div>
