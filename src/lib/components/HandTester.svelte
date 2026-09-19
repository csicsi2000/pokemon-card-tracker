<script lang="ts">
	/**
	 * Goldfishing the deck: deal an opening hand, see the mulligans it takes to keep one,
	 * draw turn by turn and check what got prized. The point is the question no count in
	 * the summary answers — does this list actually start?
	 *
	 * All the shuffling and the odds are in tcg/hand-test.ts; this only deals and draws.
	 * The tally survives across hands because one hand tells you nothing: a rough seven
	 * is luck until the sampled mulligan rate sits next to the calculated one.
	 */
	import { fly } from 'svelte/transition';
	import CardImage from './CardImage.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import { isBasicPokemon } from '$lib/tcg/deck-stats';
	import type { DeckEntry } from '$lib/tcg/legality';
	import {
		draw,
		handOdds,
		HAND_SIZE,
		openingHand,
		sortHand,
		tallyHand,
		type HandTest,
		type HandTally
	} from '$lib/tcg/hand-test';
	import { cn } from '$lib/utils';
	import Shuffle from '@lucide/svelte/icons/shuffle';
	import Layers from '@lucide/svelte/icons/layers';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import type { Card as CardType } from '$lib/types';

	let { entries }: { entries: DeckEntry[] } = $props();

	let test = $state<HandTest | null>(null);
	let tally = $state<HandTally>({ hands: 0, mulligans: 0 });
	let showPrizes = $state(false);

	const odds = $derived(handOdds(entries));

	/** The opening seven, minus nothing: what was drawn afterwards is shown on its own. */
	const opening = $derived(
		test ? sortHand(test.hand.slice(0, test.hand.length - test.drawn.length)) : []
	);

	const percent = (value: number) => `${Math.round(value * 100)}%`;

	/**
	 * The list as a string, so the reset below fires when a card is added or a count
	 * changes — and not merely because the page rebuilt the same entries.
	 */
	const signature = $derived(entries.map((entry) => `${entry.card.id}x${entry.quantity}`).join('|'));

	/** A deck changed under the tester is a different deck — the old tally would lie. */
	$effect(() => {
		void signature;
		test = null;
		tally = { hands: 0, mulligans: 0 };
		showPrizes = false;
	});

	function deal() {
		const next = openingHand(entries);
		test = next;
		tally = tallyHand(tally, next);
		showPrizes = false;
	}

	function drawOne() {
		if (test) test = draw(test);
	}
</script>

{#if entries.length === 0}
	<p class="text-muted-foreground py-12 text-center text-sm">
		Add some cards first — there is nothing to shuffle.
	</p>
{:else}
	<div class="flex flex-col gap-4">
		<!-- What to expect before anything is dealt, so a run of bad hands can be read as
		     luck or as the list. Every figure is for a fresh seven, before any mulligan. -->
		<Card.Root>
			<Card.Content class="flex flex-col gap-3 py-4">
				<div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
					<div class="flex items-baseline gap-2">
						<span class="text-2xl leading-none font-semibold tabular-nums">
							{percent(odds.mulligan)}
						</span>
						<span class="text-sm font-medium">chance of a mulligan</span>
					</div>
					<p class="text-muted-foreground text-xs">
						{odds.deckSize} cards · {odds.basicPokemon} Basic Pokémon ·
						{#if Number.isFinite(odds.expectedMulligans)}
							{odds.expectedMulligans.toFixed(2)} mulligans per game on average
						{:else}
							no hand can start a game
						{/if}
						· any one card is prized {percent(odds.prized)} of the time
					</p>
				</div>

				{#if odds.rows.length > 0}
					<div class="flex flex-col gap-2 border-t pt-3">
						<p class="text-xs font-medium">A fresh seven holds…</p>
						<div class="grid gap-2 sm:grid-cols-3">
							{#each odds.rows as row (row.label)}
								<div class="flex flex-col gap-0.5">
									<span class="text-sm font-medium tabular-nums">{percent(row.chance)}</span>
									<span class="text-muted-foreground text-xs">
										at least one {row.label} ({row.copies} in deck)
									</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<div class="flex flex-wrap items-center gap-2">
			<Button onclick={deal}>
				<Shuffle class="size-4" />
				{test ? 'New hand' : 'Draw opening hand'}
			</Button>

			{#if test}
				<Button variant="outline" onclick={drawOne} disabled={test.library.length === 0}>
					<Layers class="size-4" /> Draw a card
				</Button>
				<Button variant="outline" onclick={() => (showPrizes = !showPrizes)}>
					{#if showPrizes}
						<EyeOff class="size-4" /> Hide prizes
					{:else}
						<Eye class="size-4" /> Peek at prizes
					{/if}
				</Button>
			{/if}

			{#if tally.hands > 0}
				<p class="text-muted-foreground ml-auto flex items-center gap-2 text-xs tabular-nums">
					<span>
						{tally.hands} hand{tally.hands === 1 ? '' : 's'} · {tally.mulligans} mulligan{tally.mulligans ===
						1
							? ''
							: 's'} ({percent(tally.mulligans / tally.hands)} vs {percent(odds.mulligan)} expected)
					</span>
					<Button
						variant="ghost"
						size="icon"
						class="size-7"
						aria-label="Reset the tally"
						title="Reset the tally"
						onclick={() => (tally = { hands: 0, mulligans: 0 })}
					>
						<RotateCcw class="size-3.5" />
					</Button>
				</p>
			{/if}
		</div>

		{#if !test}
			<p class="text-muted-foreground py-12 text-center text-sm">
				Shuffle and deal {HAND_SIZE} cards. Mulligans are taken for you — a hand with no Basic Pokémon
				goes back and the deck is shuffled again.
			</p>
		{:else}
			{#if !test.keepable}
				<p class="text-destructive flex items-center gap-2 text-sm">
					<TriangleAlert class="size-4 shrink-0" />
					No Basic Pokémon anywhere in this deck, so no shuffle can produce a hand you could start
					on. This is what was dealt regardless.
				</p>
			{:else if test.mulligans.length > 0}
				<div class="flex flex-col gap-1">
					<p class="text-sm">
						<span class="font-medium">
							{test.mulligans.length} mulligan{test.mulligans.length === 1 ? '' : 's'}
						</span>
						<span class="text-muted-foreground">
							— your opponent draws {test.mulligans.length} extra card{test.mulligans.length === 1
								? ''
								: 's'}.
						</span>
					</p>
					{#each test.mulligans as hand, index (index)}
						<p class="text-muted-foreground truncate text-xs">
							{sortHand(hand)
								.map((card) => card.name)
								.join(', ')}
						</p>
					{/each}
				</div>
			{/if}

			{#snippet tile(card: CardType, index: number, drawn = false)}
				<div
					in:fly|global={{ y: 10, duration: 200, delay: Math.min(index, 7) * 40 }}
					class="relative"
				>
					<div
						class={cn(
							'ring-border/60 relative aspect-[63/88] overflow-hidden rounded-xl ring-1',
							isBasicPokemon(card) && 'ring-primary ring-2'
						)}
					>
						<CardImage {card} class="size-full" />
					</div>
					<p class="mt-1 truncate px-0.5 text-[11px] font-medium" title={card.name}>
						{drawn ? '+ ' : ''}{card.name}
					</p>
				</div>
			{/snippet}

			<div class="flex flex-col gap-2">
				<div class="flex flex-wrap items-center gap-2">
					<p class="text-sm font-medium">Opening hand</p>
					<!-- The ring on a tile says "you could start on this one", so the count says
					     it in words too rather than leaving the ring to be decoded. -->
					{#if test.keepable}
						{@const basics = opening.filter(isBasicPokemon).length}
						<Badge variant="secondary">{basics} Basic Pokémon to start on</Badge>
					{/if}
					<p class="text-muted-foreground ml-auto text-xs tabular-nums">
						{test.library.length} cards left in deck
					</p>
				</div>

				<div class="grid grid-cols-4 gap-2 sm:grid-cols-7">
					{#each opening as card, index (`${card.id}-${index}`)}
						{@render tile(card, index)}
					{/each}
				</div>
			</div>

			{#if test.drawn.length > 0}
				<div class="flex flex-col gap-2">
					<p class="text-sm font-medium">
						Drawn since <span class="text-muted-foreground font-normal">
							({test.drawn.length} card{test.drawn.length === 1 ? '' : 's'}, oldest first)
						</span>
					</p>
					<div class="grid grid-cols-4 gap-2 sm:grid-cols-7">
						{#each test.drawn as card, index (`${card.id}-${index}`)}
							{@render tile(card, index, true)}
						{/each}
					</div>
				</div>
			{/if}

			{#if test.prizes.length > 0}
				<div class="flex flex-col gap-2 border-t pt-3">
					<p class="text-sm font-medium">
						{test.prizes.length} prize{test.prizes.length === 1 ? '' : 's'}
						<span class="text-muted-foreground font-normal">
							— face down in a real game; here they answer “was it prized?”
						</span>
					</p>
					{#if showPrizes}
						<div class="grid grid-cols-4 gap-2 sm:grid-cols-7">
							{#each test.prizes as card, index (`${card.id}-${index}`)}
								{@render tile(card, index)}
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
{/if}
