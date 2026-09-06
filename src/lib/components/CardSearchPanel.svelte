<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import CardImage from './CardImage.svelte';
	import { searchCards, type Catalogue } from '$lib/catalogue';
	import { parseQuickAddLine, resolveQuickAdd } from '$lib/tcg/quick-add';
	import { cardQuery, lookupCardCode } from '$lib/tcg/card-query';
	import Search from '@lucide/svelte/icons/search';
	import Plus from '@lucide/svelte/icons/plus';
	import type { Card } from '$lib/types';

	let {
		catalogue,
		onadd,
		candidates = null,
		outsideNote = 'is not one of the cards offered here',
		placeholder = 'Search cards, or type MEG 21…'
	}: {
		catalogue: Catalogue;
		onadd: (card: Card) => void;
		/**
		 * Search only these printings instead of the whole catalogue — the cards you own,
		 * say. A "MEG 21" that resolves outside them is named but not offered.
		 */
		candidates?: Card[] | null;
		/** Finishes the sentence "<card> …" for a code match outside `candidates`. */
		outsideNote?: string;
		placeholder?: string;
	} = $props();

	let query = $state('');

	const allowed = $derived(candidates ? new Set(candidates.map((card) => card.id)) : null);

	// "MEG 21" is a set code and number, not a name: resolve it to the exact printing and
	// show it first. Name search still runs underneath in case it was a name after all.
	// The quick-add grammar goes first because it also reads "3 MEG 21 rh"; the looser
	// query lookup then catches the shorthand it rejects, above all "meg21" with no space.
	const quick = $derived.by(() => {
		let card: Card | null;
		let note: string | null;

		const entry = parseQuickAddLine(query);
		if (entry) {
			({ card, note } = resolveQuickAdd(catalogue, entry));
		} else {
			const code = lookupCardCode(catalogue, query);
			if (!code) return null;
			card = code.cards[0] ?? null;
			note = `${code.set.name} has no card #${code.number}`;
		}

		if (card && allowed && !allowed.has(card.id)) {
			return { card: null, note: `${card.name} (${card.set.ptcglCode ?? card.set.id} #${card.localId}) ${outsideNote}` };
		}
		return { card, note };
	});

	// The catalogue is in memory, so searching on every keystroke is cheap. With a
	// candidate list the same matcher runs over just those cards.
	const results = $derived.by(() => {
		const text = query.trim();
		if (text.length < 2) return [];
		if (!candidates) return searchCards(catalogue, { query: text }, 40);
		const { matches } = cardQuery(catalogue, text);
		return candidates.filter(matches).slice(0, 40);
	});

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
