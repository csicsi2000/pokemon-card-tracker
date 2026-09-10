<script lang="ts">
	/**
	 * One position from a battle log, drawn the way the game lays it out: the opponent's
	 * board above, yours below, the stadium between the two active Pokémon.
	 *
	 * The log names cards and nothing else, so every card here is a name resolved to a
	 * printing by `LogCardIndex` — the deck's own printings first. A name the catalogue
	 * does not know still gets a tile, just without art.
	 */
	import CardImage from './CardImage.svelte';
	import { cn } from '$lib/utils';
	import type { LogCardIndex } from '$lib/tcg/battle-log/artwork';
	import type { BoardState, InPlay, SideState } from '$lib/tcg/battle-log/replay';

	let {
		state,
		/** The handle whose board is drawn at the bottom. */
		you,
		cards,
		/** uids the current step touched — they get a ring. */
		touched = []
	}: {
		state: BoardState;
		you: string | null;
		cards: LogCardIndex;
		touched?: string[];
	} = $props();

	const bottom = $derived(you && state.sides[you] ? state.sides[you] : state.sides[state.order[0]]);
	const top = $derived(
		state.sides[state.order.find((name) => name !== bottom.player) ?? state.order[1]] ??
			state.sides[state.order[1]]
	);

	const hp = (mon: InPlay) => cards.find(mon.name)?.hp ?? null;

	const PRIZE_SLOTS = [0, 1, 2, 3, 4, 5];

	/** Damage as a share of printed HP, for the bar under the art. */
	function health(mon: InPlay) {
		const total = hp(mon);
		if (!total) return null;
		return Math.max(0, Math.min(1, 1 - mon.damage / total));
	}
</script>

{#snippet pokemon(mon: InPlay, size: 'active' | 'bench')}
	{@const card = cards.find(mon.name)}
	{@const bar = health(mon)}
	{@const lit = touched.includes(mon.uid)}
	<div
		class={cn(
			'relative shrink-0 transition-transform duration-200',
			size === 'active' ? 'w-24 sm:w-28' : 'w-14 sm:w-16',
			lit && '-translate-y-1'
		)}
		title="{mon.stack.join(' → ')}{mon.damage ? ` · ${mon.damage} damage` : ''}{mon.attached.length
			? ` · ${mon.attached.join(', ')}`
			: ''}"
	>
		<!-- A stack of two or three shows as paper behind the art, like the real thing. -->
		{#if mon.stack.length > 1}
			<div class="bg-muted absolute -top-1 -right-1 h-full w-full rounded-lg border"></div>
		{/if}

		{#if card}
			<!-- The aspect ratio is load-bearing: art that is still loading, or that never
			     arrives, would otherwise collapse the slot and shuffle the whole board. -->
			<CardImage
				{card}
				class={cn('aspect-[63/88] w-full rounded-lg', lit && 'ring-primary ring-2')}
			/>
		{:else}
			<div
				class={cn(
					'bg-muted text-muted-foreground grid aspect-[63/88] w-full place-items-center rounded-lg border p-1 text-center text-[9px] leading-tight',
					lit && 'ring-primary ring-2'
				)}
			>
				<span class="line-clamp-3">{mon.name}</span>
			</div>
		{/if}

		{#if mon.damage > 0}
			<span
				class="bg-destructive text-destructive-foreground absolute -top-1 -left-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums shadow"
			>
				{mon.damage}
			</span>
		{/if}

		{#if bar !== null && mon.damage > 0}
			<div class="bg-muted absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-lg">
				<div
					class={cn('h-full', bar > 0.5 ? 'bg-emerald-500' : bar > 0.2 ? 'bg-amber-500' : 'bg-destructive')}
					style="width: {bar * 100}%"
				></div>
			</div>
		{/if}

		{#if mon.attached.length > 0}
			<!-- Attachment count rather than the cards themselves: five energy on one
			     Grimmsnarl would otherwise hide the Pokémon it is attached to. -->
			<span
				class="bg-background/90 absolute -right-1 -bottom-1 rounded-full border px-1 text-[9px] font-semibold tabular-nums shadow-sm"
			>
				+{mon.attached.length}
			</span>
		{/if}
	</div>
{/snippet}

{#snippet nameplate(player: SideState)}
	<div class="flex items-center gap-2 text-xs">
		<span class="truncate font-medium">{player.player}</span>
		<!-- Prize cards still face down in front of this player. -->
		<span class="flex gap-0.5" title="{player.prizesLeft} prize cards left">
			{#each PRIZE_SLOTS as slot (slot)}
				<span
					class={cn(
						'size-2 rounded-sm',
						slot < player.prizesLeft ? 'bg-primary' : 'bg-muted border'
					)}
				></span>
			{/each}
		</span>
		<span class="text-muted-foreground tabular-nums">{player.prizesLeft} left</span>
		{#if player.knockedOut.length > 0}
			<span class="text-muted-foreground">· {player.knockedOut.length} KO'd</span>
		{/if}
	</div>
{/snippet}

{#snippet bench(player: SideState)}
	<div class="flex min-h-[4.5rem] flex-wrap items-start gap-1.5 sm:min-h-[5.5rem]">
		{#each player.bench as mon (mon.uid)}
			{@render pokemon(mon, 'bench')}
		{:else}
			<p class="text-muted-foreground self-center text-xs">Bench empty</p>
		{/each}
	</div>
{/snippet}

<div class="bg-card flex flex-col gap-2 rounded-xl border p-3">
	{@render nameplate(top)}
	{@render bench(top)}

	<!-- Two actives facing each other with the stadium between them. On a phone the gap and
	     the stadium column shrink rather than the cards: the active Pokémon is the thing
	     being looked at. -->
	<div class="border-border/60 flex items-center justify-center gap-2 border-y py-3 sm:gap-4">
		<div class="flex flex-1 justify-end">
			{#if top.active}
				{@render pokemon(top.active, 'active')}
			{:else}
				<p class="text-muted-foreground self-center text-xs">No active</p>
			{/if}
		</div>

		<div class="w-16 shrink-0 text-center sm:w-28">
			{#if state.stadium}
				{@const card = cards.find(state.stadium.card)}
				<p class="text-muted-foreground text-[10px] tracking-wide uppercase">Stadium</p>
				{#if card}
					<CardImage {card} class="mx-auto mt-1 aspect-[63/88] w-16 rounded" />
				{/if}
				<p class="mt-1 truncate text-[10px] font-medium" title={state.stadium.card}>
					{state.stadium.card}
				</p>
				<p class="text-muted-foreground truncate text-[10px]">{state.stadium.player}</p>
			{:else}
				<p class="text-muted-foreground text-[10px] tracking-wide uppercase">No stadium</p>
			{/if}
		</div>

		<div class="flex flex-1 justify-start">
			{#if bottom.active}
				{@render pokemon(bottom.active, 'active')}
			{:else}
				<p class="text-muted-foreground self-center text-xs">No active</p>
			{/if}
		</div>
	</div>

	{@render bench(bottom)}
	{@render nameplate(bottom)}
</div>
