<script lang="ts">
	/**
	 * One position from a battle log, drawn the way the game lays it out: the opponent's
	 * side above, yours below, the stadium and turn counter between the two actives. Each
	 * side shows every zone the log lets us count — hand, deck, discard pile, prizes,
	 * bench and Active Spot — so a review can see *why* a turn went the way it did.
	 *
	 * The geometry is fixed on purpose. Every slot is drawn whether or not something is in
	 * it, the bench always has five, and every tile keeps its aspect ratio while its art
	 * loads: a board whose height changed every time a Pokémon came or went would jump
	 * under the controls as the replay plays, and on a phone that is the whole screen.
	 *
	 * The log names cards and nothing else, so every card here is a name resolved to a
	 * printing by `LogCardIndex` — the deck's own printings first. A name the catalogue
	 * does not know still gets a tile, just without art.
	 */
	import CardImage from './CardImage.svelte';
	import EnergyPip from './EnergyPip.svelte';
	import { energyType } from '$lib/tcg/energy';
	import { cn } from '$lib/utils';
	import type { Card } from '$lib/types';
	import type { LogCardIndex } from '$lib/tcg/battle-log/artwork';
	import type { BoardState, InPlay, SideState } from '$lib/tcg/battle-log/replay';

	let {
		state,
		/** The handle whose board is drawn at the bottom. */
		you,
		cards,
		/** uids the current step touched — they get a ring. */
		touched = [],
		/** Who took the first turn, for the badge next to their name. */
		wentFirst = null,
		/** A card tile was tapped — the page shows the printing's details. */
		onselect,
		/** A discard pile was tapped — the page lists what is in it. */
		onshowdiscard
	}: {
		state: BoardState;
		you: string | null;
		cards: LogCardIndex;
		touched?: string[];
		wentFirst?: string | null;
		onselect?: (card: Card) => void;
		onshowdiscard?: (side: SideState) => void;
	} = $props();

	const bottom = $derived(you && state.sides[you] ? state.sides[you] : state.sides[state.order[0]]);
	const top = $derived(
		state.sides[state.order.find((name) => name !== bottom.player) ?? state.order[1]] ??
			state.sides[state.order[1]]
	);

	const BENCH_SLOTS = 5;
	const HAND_TILES = 12;

	/** Damage as a share of printed HP, for the bar under the art. */
	function health(mon: InPlay) {
		const total = cards.find(mon.name)?.hp;
		if (!total) return null;
		return Math.max(0, Math.min(1, 1 - mon.damage / total));
	}

	/** Bench Pokémon padded out to a fixed row of slots, so the row never changes shape. */
	const slots = (side: SideState): (InPlay | null)[] => {
		const out: (InPlay | null)[] = [...side.bench];
		while (out.length < BENCH_SLOTS) out.push(null);
		return out;
	};

	/** What a hand shows: the cards the log named face up, the rest as card backs. */
	function handTiles(side: SideState): { key: string; name: string | null }[] {
		const known = side.hand.known.slice(0, HAND_TILES);
		const hidden = Math.max(0, Math.min(HAND_TILES, side.hand.count) - known.length);
		return [
			...known.map((name, index) => ({ key: `k${index}`, name })),
			...Array.from({ length: hidden }, (_, index) => ({ key: `h${index}`, name: null }))
		];
	}

	/** The energy on a Pokémon as pips, and its tools counted — five energy would hide the art. */
	function attachments(mon: InPlay) {
		const pips: string[] = [];
		let tools = 0;
		for (const name of mon.attached) {
			const card = cards.find(name);
			const type = card ? energyType(card) : null;
			if (type) pips.push(type);
			else if (card?.supertype === 'Energy' || /energy$/i.test(name)) pips.push('Colorless');
			else tools += 1;
		}
		return { pips, tools };
	}

	const CONDITIONS: Record<string, { short: string; class: string }> = {
		Poisoned: { short: 'PSN', class: 'bg-purple-600' },
		Asleep: { short: 'SLP', class: 'bg-slate-500' },
		Paralyzed: { short: 'PAR', class: 'bg-yellow-500 text-black' },
		Confused: { short: 'CNF', class: 'bg-pink-600' },
		Burned: { short: 'BRN', class: 'bg-orange-600' }
	};

	const select = (name: string) => {
		const card = cards.find(name);
		if (card && onselect) onselect(card);
	};
</script>

<!-- A face-down card: the deck, the prizes, the unknown part of a hand. -->
{#snippet back(className: string)}
	<div
		class={cn(
			'grid aspect-[63/88] place-items-center rounded-md border border-blue-900/60 bg-gradient-to-br from-blue-700 to-blue-950 shadow-sm',
			className
		)}
	>
		<span class="size-1/3 rounded-full border-2 border-blue-300/50 bg-blue-200/20"></span>
	</div>
{/snippet}

<!-- A card by name: its art when the catalogue knows it, the name otherwise. -->
{#snippet tile(name: string, className: string, lit = false)}
	{@const card = cards.find(name)}
	{@const clickable = Boolean(card && onselect)}
	<button
		type="button"
		disabled={!clickable}
		onclick={() => select(name)}
		class={cn(
			'block shrink-0 rounded-md text-left disabled:cursor-default',
			clickable && 'cursor-zoom-in',
			className
		)}
		title={name}
	>
		{#if card}
			<CardImage
				{card}
				eager
				class={cn('aspect-[63/88] w-full rounded-md', lit && 'ring-primary ring-2')}
			/>
		{:else}
			<div
				class={cn(
					'bg-muted text-muted-foreground grid aspect-[63/88] w-full place-items-center rounded-md border p-0.5 text-center text-[8px] leading-tight',
					lit && 'ring-primary ring-2'
				)}
			>
				<span class="line-clamp-3">{name}</span>
			</div>
		{/if}
	</button>
{/snippet}

{#snippet pokemon(mon: InPlay, size: 'active' | 'bench')}
	{@const bar = health(mon)}
	{@const lit = touched.includes(mon.uid)}
	{@const held = attachments(mon)}
	<div
		class={cn(
			'relative w-full shrink-0 transition-transform duration-200',
			lit && '-translate-y-1'
		)}
		title="{mon.stack.join(' → ')}{mon.damage ? ` · ${mon.damage} damage` : ''}{mon.attached.length
			? ` · ${mon.attached.join(', ')}`
			: ''}{mon.conditions.length ? ` · ${mon.conditions.join(', ')}` : ''}"
	>
		<!-- A stack of two or three shows as paper behind the art, like the real thing. -->
		{#if mon.stack.length > 1}
			<div class="bg-muted absolute -top-1 -right-1 h-full w-full rounded-md border"></div>
		{/if}
		{#if mon.stack.length > 2}
			<div class="bg-muted absolute -top-2 -right-2 h-full w-full rounded-md border"></div>
		{/if}

		{@render tile(mon.name, 'relative w-full', lit)}

		{#if mon.damage > 0}
			<span
				class="bg-destructive text-destructive-foreground absolute -top-1 -left-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums shadow"
			>
				{mon.damage}
			</span>
		{/if}

		{#if bar !== null && mon.damage > 0}
			<div class="bg-muted absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-md">
				<div
					class={cn('h-full', bar > 0.5 ? 'bg-emerald-500' : bar > 0.2 ? 'bg-amber-500' : 'bg-destructive')}
					style="width: {bar * 100}%"
				></div>
			</div>
		{/if}

		{#if mon.conditions.length > 0}
			<span class="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-0.5">
				{#each mon.conditions as condition (condition)}
					{@const look = CONDITIONS[condition] ?? { short: condition.slice(0, 3).toUpperCase(), class: 'bg-neutral-600' }}
					<span class={cn('rounded px-1 py-0.5 text-[9px] font-bold text-white shadow', look.class)}>
						{look.short}
					</span>
				{/each}
			</span>
		{/if}

		<!-- Energy as pips along the bottom edge, tools as a count — always in the same place,
		     so a tile's footprint does not depend on what is attached. -->
		{#if mon.attached.length > 0}
			<span class="absolute inset-x-0 -bottom-2 flex items-center justify-center gap-px">
				{#each held.pips.slice(0, size === 'active' ? 6 : 4) as type, index (index)}
					<EnergyPip {type} class="size-3.5 text-[7px] shadow ring-1 ring-black/20 sm:size-4 sm:text-[8px]" />
				{/each}
				{#if held.pips.length > (size === 'active' ? 6 : 4)}
					<span class="bg-background rounded-full border px-1 text-[8px] font-semibold tabular-nums">
						+{held.pips.length - (size === 'active' ? 6 : 4)}
					</span>
				{/if}
				{#if held.tools > 0}
					<span
						class="bg-background rounded-full border px-1 text-[8px] font-semibold shadow-sm"
						title="{held.tools} tool{held.tools === 1 ? '' : 's'}"
					>
						T{held.tools > 1 ? held.tools : ''}
					</span>
				{/if}
			</span>
		{/if}
	</div>
{/snippet}

{#snippet slot(mon: InPlay | null, size: 'active' | 'bench')}
	<div
		class={cn(
			'relative shrink-0',
			size === 'active' ? 'w-[4.5rem] sm:w-28' : 'w-11 sm:w-16'
		)}
	>
		{#if mon}
			{@render pokemon(mon, size)}
		{:else}
			<div
				class="border-border/70 text-muted-foreground/60 grid aspect-[63/88] w-full place-items-center rounded-md border border-dashed text-[8px] uppercase"
			>
				{size === 'active' ? 'Active' : ''}
			</div>
		{/if}
	</div>
{/snippet}

<!-- A face-down pile with its count: the deck, the prizes. -->
{#snippet pile(label: string, count: number, tiles: number)}
	<div class="flex flex-col items-center gap-0.5">
		<span class="text-muted-foreground text-[9px] tracking-wide uppercase">{label}</span>
		<div class="relative w-9 sm:w-12">
			{#if count > 0}
				{#each Array.from({ length: Math.min(tiles, 3) }) as _, index (index)}
					<div class="absolute inset-0" style="transform: translate({index * 2}px, {-index * 2}px)">
						{@render back('w-full')}
					</div>
				{/each}
				<div class="invisible aspect-[63/88] w-full"></div>
			{:else}
				<div
					class="border-border/70 text-muted-foreground/60 grid aspect-[63/88] w-full place-items-center rounded-md border border-dashed text-[8px]"
				>
					—
				</div>
			{/if}
		</div>
		<span class="text-xs font-semibold tabular-nums">{count}</span>
	</div>
{/snippet}

{#snippet discard(side: SideState)}
	{@const total = side.discard.length + side.discardUnknown}
	{@const topCard = side.discard.at(-1)}
	<div class="flex flex-col items-center gap-0.5">
		<span class="text-muted-foreground text-[9px] tracking-wide uppercase">Discard</span>
		<button
			type="button"
			class="w-9 rounded-md sm:w-12"
			disabled={total === 0 || !onshowdiscard}
			onclick={() => onshowdiscard?.(side)}
			title={total > 0 ? `${total} cards in the discard pile — tap to list them` : 'Discard pile empty'}
		>
			{#if topCard}
				{@const card = cards.find(topCard)}
				{#if card}
					<CardImage {card} eager class="aspect-[63/88] w-full rounded-md opacity-90 grayscale-[35%]" />
				{:else}
					<div
						class="bg-muted text-muted-foreground grid aspect-[63/88] w-full place-items-center rounded-md border p-0.5 text-center text-[8px] leading-tight"
					>
						<span class="line-clamp-3">{topCard}</span>
					</div>
				{/if}
			{:else}
				<div
					class="border-border/70 text-muted-foreground/60 grid aspect-[63/88] w-full place-items-center rounded-md border border-dashed text-[8px]"
				>
					—
				</div>
			{/if}
		</button>
		<span class="text-xs font-semibold tabular-nums">{total}</span>
	</div>
{/snippet}

{#snippet hand(side: SideState, mine: boolean)}
	{@const tiles = handTiles(side)}
	<div class="flex h-12 items-center gap-1 sm:h-16">
		<span class="text-muted-foreground w-12 shrink-0 text-[10px] leading-tight sm:w-16">
			{mine ? 'Your' : 'Their'} hand
			<span class="block text-xs font-semibold tabular-nums text-foreground">{side.hand.count}</span>
		</span>
		<div class="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto py-1">
			{#each tiles as item (item.key)}
				{#if item.name}
					{@render tile(item.name, 'w-7 sm:w-10')}
				{:else}
					{@render back('w-7 shrink-0 sm:w-10')}
				{/if}
			{/each}
			{#if side.hand.count > HAND_TILES}
				<span class="text-muted-foreground shrink-0 pl-1 text-[10px] tabular-nums">
					+{side.hand.count - HAND_TILES}
				</span>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet nameplate(side: SideState, mine: boolean)}
	<div class="flex min-w-0 items-center gap-2 text-xs">
		<span class="truncate font-semibold">{side.player}</span>
		{#if wentFirst === side.player}
			<span class="bg-muted text-muted-foreground rounded-full border px-1.5 py-px text-[9px] tracking-wide uppercase">
				went first
			</span>
		{/if}
		{#if state.turnPlayer === side.player}
			<span class="bg-primary text-primary-foreground rounded-full px-1.5 py-px text-[9px] tracking-wide uppercase">
				{mine ? 'your turn' : 'their turn'}
			</span>
		{/if}
		{#if side.knockedOut.length > 0}
			<span class="text-muted-foreground ml-auto shrink-0 tabular-nums">{side.knockedOut.length} KO'd</span>
		{/if}
	</div>
{/snippet}

<!-- One player's half of the table, mirrored top to bottom for the opponent: hands at the
     far edges, names and actives towards the middle, so both actives meet in the centre
     like the real thing. -->
{#snippet half(side: SideState, mine: boolean)}
	<div class={cn('flex gap-2', mine ? 'flex-col-reverse' : 'flex-col')}>
		{@render hand(side, mine)}
		<div class="flex items-stretch gap-2 sm:gap-3">
			<div class={cn('flex shrink-0 justify-between gap-2', mine ? 'flex-col' : 'flex-col-reverse')}>
				{@render pile('Deck', side.deck, 3)}
				{@render discard(side)}
			</div>

			<div class={cn('flex min-w-0 flex-1 flex-col items-center gap-2', mine ? 'flex-col-reverse' : 'flex-col')}>
				<div class="flex justify-center gap-1 sm:gap-2">
					{#each slots(side) as mon, index (mon?.uid ?? `empty-${index}`)}
						{@render slot(mon, 'bench')}
					{/each}
				</div>
				{@render slot(side.active, 'active')}
			</div>

			<div class="flex shrink-0 flex-col justify-start">
				{@render pile('Prizes', side.prizesLeft, side.prizesLeft)}
			</div>
		</div>
		{@render nameplate(side, mine)}
	</div>
{/snippet}

<div class="bg-card flex flex-col gap-2 rounded-xl border p-2 sm:p-3">
	{@render half(top, false)}

	<!-- Between the two actives: whose turn, the stadium, and the turn number. -->
	<div class="border-border/60 flex items-center justify-center gap-3 border-y py-2 sm:gap-6">
		<div class="text-center">
			<p class="text-muted-foreground text-[9px] tracking-wide uppercase">Turn</p>
			<p class="text-lg font-semibold tabular-nums">{state.turnNumber ?? '–'}</p>
		</div>

		<div class="flex w-28 items-center gap-2 sm:w-40">
			{#if state.stadium}
				{@render tile(state.stadium.card, 'w-9 sm:w-12')}
				<div class="min-w-0">
					<p class="text-muted-foreground text-[9px] tracking-wide uppercase">Stadium</p>
					<p class="truncate text-[11px] font-medium" title={state.stadium.card}>{state.stadium.card}</p>
					<p class="text-muted-foreground truncate text-[10px]">{state.stadium.player}</p>
				</div>
			{:else}
				<div
					class="border-border/70 text-muted-foreground/60 grid aspect-[63/88] w-9 shrink-0 place-items-center rounded-md border border-dashed sm:w-12"
				></div>
				<p class="text-muted-foreground text-[10px] tracking-wide uppercase">No stadium</p>
			{/if}
		</div>

		<div class="w-10 text-center sm:w-12">
			<p class="text-muted-foreground text-[9px] tracking-wide uppercase">Prizes</p>
			<p class="text-sm font-semibold tabular-nums">{bottom.prizesTaken}–{top.prizesTaken}</p>
		</div>
	</div>

	{@render half(bottom, true)}
</div>
