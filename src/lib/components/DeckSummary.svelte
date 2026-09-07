<script lang="ts">
	/**
	 * What the deck is made of, above the list: the Pokémon / Trainer / Energy split with
	 * a bar you can read at a glance, the sub-counts a player actually thinks in
	 * (Supporters, Basics, basic vs special energy), and a few rules of thumb about the
	 * shape of the build. The maths is all in tcg/deck-stats.ts.
	 */
	import type { FormatRules } from '$lib/tcg/format-rules';
	import type { DeckEntry } from '$lib/tcg/legality';
	import { deckStats, deckTips, MIN_TIP_SIZE } from '$lib/tcg/deck-stats';
	import * as Card from '$lib/components/ui/card';
	import { SUPERTYPE_COLOR } from '$lib/components/appearance-classes';
	import Lightbulb from '@lucide/svelte/icons/lightbulb';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	let { entries, rules }: { entries: DeckEntry[]; rules: FormatRules | null } = $props();

	const stats = $derived(deckStats(entries));
	const tips = $derived(deckTips(stats, rules));

	/** Built here rather than in the markup, where the separators lose their spaces. */
	const facts = $derived(
		[
			`${stats.total} cards`,
			`${stats.distinctNames} different card${stats.distinctNames === 1 ? '' : 's'}`,
			`${stats.basicPokemon} Basic Pokémon to open on`,
			stats.types.length ? `needs ${stats.types.map((row) => row.type).join(', ')} energy` : null
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<Card.Root>
	<Card.Content class="flex flex-col gap-4 py-4">
		<!-- One bar for the whole deck: the three shares in decklist order. -->
		<div class="bg-muted flex h-2 overflow-hidden rounded-full" aria-hidden="true">
			{#each stats.groups as group (group.supertype)}
				{#if group.count > 0}
					<div class={SUPERTYPE_COLOR[group.supertype]} style="width: {group.share * 100}%"></div>
				{/if}
			{/each}
		</div>

		<div class="grid gap-3 sm:grid-cols-3">
			{#each stats.groups as group (group.supertype)}
				<div class="flex flex-col gap-0.5">
					<div class="flex items-baseline gap-2">
						<span class="text-2xl leading-none font-semibold tabular-nums">{group.count}</span>
						<span class="flex items-center gap-1.5 text-sm font-medium">
							<span class="size-2 rounded-full {SUPERTYPE_COLOR[group.supertype]}"></span>
							{group.label}
						</span>
						<span class="text-muted-foreground text-xs tabular-nums">
							{Math.round(group.share * 100)}%
						</span>
					</div>
					<p class="text-muted-foreground text-xs">
						{#if group.breakdown.length}
							{group.breakdown.map((row) => `${row.count} ${row.label}`).join(' · ')}
						{:else}
							none
						{/if}
					</p>
				</div>
			{/each}
		</div>

		<p class="text-muted-foreground border-t pt-3 text-xs">{facts}</p>

		{#if stats.total >= MIN_TIP_SIZE}
			<div class="flex flex-col gap-2 border-t pt-3">
				<p class="text-xs font-medium">Tips</p>
				{#if tips.length === 0}
					<p class="text-muted-foreground text-xs">
						Nothing stands out — the counts are in the range most decks land in.
					</p>
				{:else}
					<ul class="flex flex-col gap-1.5">
						{#each tips as tip (tip.id)}
							{@const Icon = tip.tone === 'warn' ? TriangleAlert : Lightbulb}
							<li class="flex gap-2 text-xs">
								<Icon
									class="mt-0.5 size-3.5 shrink-0 {tip.tone === 'warn'
										? 'text-destructive'
										: 'text-muted-foreground'}"
								/>
								<span class={tip.tone === 'warn' ? '' : 'text-muted-foreground'}>{tip.message}</span>
							</li>
						{/each}
					</ul>
				{/if}
				<p class="text-muted-foreground text-[11px]">
					Rules of thumb, not rules — they scale to the size of this deck and ignore what the
					cards actually do.
				</p>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
