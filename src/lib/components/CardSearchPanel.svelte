<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import CardImage from './CardImage.svelte';
	import { searchCards, type Catalogue } from '$lib/catalogue';
	import { parseQuickAddLine, resolveQuickAdd } from '$lib/tcg/quick-add';
	import { lookupCardCode } from '$lib/tcg/card-query';
	import Search from '@lucide/svelte/icons/search';
	import Plus from '@lucide/svelte/icons/plus';
	import type { Card } from '$lib/types';

	let {
		catalogue,
		onadd,
		placeholder = 'Search cards, or type MEG 21…'
	}: { catalogue: Catalogue; onadd: (card: Card) => void; placeholder?: string } = $props();

	let query = $state('');

	// "MEG 21" is a set code and number, not a name: resolve it to the exact printing and
	// show it first. Name search still runs underneath in case it was a name after all.
	// The quick-add grammar goes first because it also reads "3 MEG 21 rh"; the looser
	// query lookup then catches the shorthand it rejects, above all "meg21" with no space.
	const quick = $derived.by(() => {
		const entry = parseQuickAddLine(query);
		if (entry) {
			const resolved = resolveQuickAdd(catalogue, entry);
			return { card: resolved.card, note: resolved.note };
		}

		const code = lookupCardCode(catalogue, query);
		if (!code) return null;
		return {
			card: code.cards[0] ?? null,
			note: `${code.set.name} has no card #${code.number}`
		};
	});

	// The catalogue is in memory, so searching on every keystroke is cheap.
	const results = $derived(
		query.trim().length < 2 ? [] : searchCards(catalogue, { query: query.trim() }, 40)
	);

	function add(card: Card) {
		onadd(card);
		if (quick?.card === card) query = '';
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && quick?.card) {
			event.preventDefault();
			add(quick.card);
		}
	}
</script>

<div class="flex min-h-0 flex-col gap-3">
	<div class="relative">
		<Search
			class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
		/>
		<Input bind:value={query} {onkeydown} {placeholder} class="pl-9" />
	</div>

	<!-- Below lg the panel sits in the page flow above the list it feeds, so the results
	     scroll inside a capped box instead of pushing that list off the bottom of a phone. -->
	<div class="flex max-h-[60svh] min-h-0 flex-1 flex-col gap-1 overflow-y-auto lg:max-h-none">
		{#if quick}
			{#if quick.card}
				<button
					type="button"
					class="border-primary/40 bg-primary/5 hover:bg-primary/10 flex w-full items-center gap-3 rounded-lg border p-1.5 text-left transition-colors"
					onclick={() => add(quick.card!)}
				>
					<CardImage card={quick.card} class="h-12 w-9 shrink-0 rounded" />
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">{quick.card.name}</p>
						<p class="text-muted-foreground truncate text-xs">
							{quick.card.set.name} · #{quick.card.localId}
						</p>
					</div>
					<Badge variant="outline" class="shrink-0 text-[10px]">Enter</Badge>
					<Plus class="text-muted-foreground size-4 shrink-0" />
				</button>
			{:else}
				<p class="text-muted-foreground p-3 text-sm">{quick.note}</p>
			{/if}
		{/if}

		{#if query.trim().length >= 2 && results.length === 0 && !quick?.card}
			<p class="text-muted-foreground p-3 text-sm">Nothing found.</p>
		{/if}

		{#each results as card (card.id)}
			{#if card !== quick?.card}
				<button
					type="button"
					class="hover:bg-accent flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors"
					onclick={() => add(card)}
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
			{/if}
		{/each}
	</div>
</div>
