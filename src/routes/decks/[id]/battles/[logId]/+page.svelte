<script lang="ts">
	/**
	 * A saved game, replayed: the full table (hands, decks, discard piles, prizes, bench,
	 * actives, stadium), the log beside it, and controls that step, play and scrub.
	 *
	 * The whole replay is folded once per log — every board position for every line, which
	 * for a long game is a few hundred small objects — so stepping and scrubbing are just
	 * an index change and stay instant even while dragging the slider.
	 *
	 * Two things keep playback from feeling broken:
	 *
	 *   - the art for every card the log names is requested the moment the log is parsed,
	 *     not when a tile first appears. Tiles otherwise pop in blank one cue at a time, the
	 *     more so on a phone that starts each request only as the tile scrolls into view;
	 *   - the log list scrolls itself, never the page. Keeping the current line in view by
	 *     scrolling the *page* is what made the board jump off screen on a phone, where the
	 *     list sits below everything else.
	 *
	 * The log's bookkeeping lines (a stadium firing once per benched Pokémon, and the
	 * damage it prevents) are a third of a real game's text, so by default they are folded
	 * out of both the list and the stepping order; the toggle puts them back for anyone
	 * checking a rules interaction.
	 */
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import BattleBoard from '$lib/components/BattleBoard.svelte';
	import CardDetailSheet from '$lib/components/CardDetailSheet.svelte';
	import CardImage from '$lib/components/CardImage.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronsLeft from '@lucide/svelte/icons/chevrons-left';
	import ChevronsRight from '@lucide/svelte/icons/chevrons-right';
	import SkipBack from '@lucide/svelte/icons/skip-back';
	import SkipForward from '@lucide/svelte/icons/skip-forward';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Swords from '@lucide/svelte/icons/swords';
	import { cardImage } from '$lib/catalogue';
	import { logTexts } from '$lib/logs.svelte';
	import { prefs } from '$lib/prefs.svelte';
	import { store } from '$lib/store.svelte';
	import { buildLogCardIndex } from '$lib/tcg/battle-log/artwork';
	import {
		buildReplay,
		cardNames,
		isBookkeeping,
		parseBattleLog,
		summarize,
		type SideState
	} from '$lib/tcg/battle-log';
	import type { Card as CardType } from '$lib/types';
	import { cn } from '$lib/utils';

	let { data } = $props();

	const deckId = $derived(page.params.id!);
	const logId = $derived(page.params.logId!);
	const deck = $derived(store.deck(deckId));
	const log = $derived(store.battleLog(logId));

	/** Null for the moment it takes to decompress the log; see lib/logs.svelte.ts. */
	const text = $derived(log ? logTexts.text(log) : null);
	const unreadable = $derived(log ? logTexts.error(log) : null);

	const replay = $derived(text === null ? null : buildReplay(parseBattleLog(text)));
	const summary = $derived(replay && log ? summarize(replay, log.player) : null);

	/** The deck's printings, so the board shows the cards the user actually owns. */
	const cards = $derived(
		buildLogCardIndex(
			data.catalogue,
			(deck?.cards ?? []).map((row) => row.cardId)
		)
	);

	/**
	 * Ask for every scan the game will need up front, in the order the log first names
	 * them. `crossorigin` matches the <img> tiles so the response lands in the same cache
	 * entry (and the service worker's), and the Image objects are held until the page
	 * leaves so nothing is collected before it has loaded.
	 */
	let warm: HTMLImageElement[] = [];
	$effect(() => {
		if (!replay) return;
		const index = cards;
		const urls = cardNames(replay.log).flatMap((name) => {
			const url = index.find(name) ? cardImage(index.find(name)!, 'low') : null;
			return url ? [url] : [];
		});
		warm = urls.map((url) => {
			const image = new Image();
			image.crossOrigin = 'anonymous';
			image.decoding = 'async';
			image.src = url;
			return image;
		});
		return () => {
			warm = [];
		};
	});

	/**
	 * -1 is the empty board before the first line; every other value indexes `steps`.
	 * Stepping moves between `stops`, scrubbing can land anywhere.
	 */
	let cursor = $state(-1);
	let playing = $state(false);

	/** Step indices the controls stop at, honouring the bookkeeping toggle. */
	const stops = $derived(
		(replay?.steps ?? []).flatMap((step, index) =>
			prefs.replayHideNoise && isBookkeeping(step.event) ? [] : [index]
		)
	);

	const current = $derived(cursor >= 0 ? (replay?.steps[cursor] ?? null) : null);
	const board = $derived(current?.state ?? replay?.initial ?? null);
	const total = $derived(replay?.steps.length ?? 0);
	const atEnd = $derived(total > 0 && cursor >= total - 1);

	/** Where the cursor sits among the stops — for "step 40 of 300" and the slider. */
	const position = $derived(stops.filter((index) => index <= cursor).length);

	function goto(index: number) {
		cursor = Math.max(-1, Math.min(total - 1, index));
	}

	function step(delta: 1 | -1) {
		const next =
			delta === 1
				? stops.find((index) => index > cursor)
				: [...stops].reverse().find((index) => index < cursor);
		if (next === undefined) {
			if (delta === 1) playing = false;
			else cursor = -1;
			return;
		}
		cursor = next;
	}

	/** Play from here — or from the top again when the game has already been watched through. */
	function togglePlay() {
		if (playing) {
			playing = false;
			return;
		}
		if (atEnd) cursor = -1;
		playing = true;
	}

	/** Where each section starts — what "next turn" jumps between. */
	const sectionStarts = $derived(
		(replay?.steps ?? []).flatMap((step, index) =>
			index === 0 || replay!.steps[index - 1].section !== step.section ? [index] : []
		)
	);

	/**
	 * The next section, or the start of this one — pressing back once returns to the top of
	 * the current turn, which is what a review wants, and again goes to the turn before.
	 */
	function turn(delta: 1 | -1) {
		if (delta === 1) {
			const next = sectionStarts.find((index) => index > cursor);
			goto(next ?? total - 1);
			return;
		}
		const previous = [...sectionStarts].reverse().find((index) => index < cursor);
		goto(previous ?? -1);
	}

	// Autoplay. Each tick is one stop, so hidden bookkeeping does not stall the playback.
	$effect(() => {
		if (!playing) return;
		const timer = setInterval(() => step(1), prefs.replaySpeed);
		return () => clearInterval(timer);
	});

	function onkeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
		if (sheetOpen || discardSide) return;

		const keys: Record<string, () => void> = {
			ArrowRight: () => step(1),
			ArrowLeft: () => step(-1),
			ArrowDown: () => turn(1),
			ArrowUp: () => turn(-1),
			Home: () => goto(-1),
			End: () => goto(total - 1),
			' ': togglePlay,
			k: togglePlay
		};
		const action = keys[event.key];
		if (!action) return;
		event.preventDefault();
		action();
	}

	/**
	 * The log list: hidden lines dropped, each entry keeping its step index, and carrying
	 * the section heading when it is the first line under one.
	 */
	const lines = $derived.by(() => {
		let heading: string | null = null;
		return (replay?.steps ?? []).flatMap((item, index) => {
			if (prefs.replayHideNoise && isBookkeeping(item.event)) return [];
			const first = item.section !== heading;
			heading = item.section;
			return [{ item, index, heading: first ? item.section : null }];
		});
	});

	/**
	 * Keeps the current line in view as the replay plays itself, by scrolling the list and
	 * nothing else. `scrollIntoView` would also scroll every ancestor, the page included.
	 * The list is rendered twice (phone layout and wide layout, one of them hidden), so
	 * every instance is kept in step.
	 */
	$effect(() => {
		const index = cursor;
		for (const container of document.querySelectorAll<HTMLElement>('[data-log-list]')) {
			const element = container.querySelector<HTMLElement>(`[data-step="${index}"]`);
			if (!element) continue;
			// The container is positioned, so a line's offsetTop is already relative to it.
			const top = element.offsetTop;
			const bottom = top + element.offsetHeight;
			const viewTop = container.scrollTop;
			const viewBottom = viewTop + container.clientHeight;
			// Headings are sticky and cover the first row or two under them.
			const margin = 40;
			if (top - margin < viewTop || bottom + 8 > viewBottom) {
				container.scrollTo({ top: Math.max(0, top - container.clientHeight / 3), behavior: 'auto' });
			}
		}
	});

	// Speeds are stored as the pause between steps; 1× is the pace a person reads at.
	const SPEEDS = [
		{ ms: 2800, label: '0.25×' },
		{ ms: 1400, label: '0.5×' },
		{ ms: 700, label: '1×' },
		{ ms: 350, label: '2×' },
		{ ms: 175, label: '4×' }
	];

	/** Marks on the scrub bar: every knockout, coloured by whose Pokémon fell. */
	const marks = $derived(
		(summary?.highlights ?? [])
			.filter((mark) => mark.label.endsWith('knocked out'))
			.map((mark) => {
				const state = replay?.steps[mark.step]?.state;
				// The knockout line names the real owner, so the side whose KO count grew tells.
				const before = replay?.steps[mark.step - 1]?.state ?? replay?.initial;
				const owner =
					state && before
						? (Object.keys(state.sides).find(
								(name) => state.sides[name].knockedOut.length > before.sides[name].knockedOut.length
							) ?? null)
						: null;
				return { ...mark, mine: owner !== null && owner === log?.player };
			})
	);

	/** A card tapped on the board, shown in the app's own detail sheet. */
	let selected = $state<CardType | null>(null);
	let sheetOpen = $state(false);
	function select(card: CardType) {
		selected = card;
		sheetOpen = true;
		playing = false;
	}

	/** A discard pile tapped on the board, listed with counts. */
	let discardSide = $state<SideState | null>(null);
	const discardEntries = $derived.by(() => {
		if (!discardSide) return [];
		const counts = new Map<string, number>();
		for (const name of discardSide.discard) counts.set(name, (counts.get(name) ?? 0) + 1);
		return [...counts.entries()].map(([name, count]) => ({ name, count }));
	});
</script>

<svelte:head><title>Replay · {deck?.name ?? 'Deck'} · Cardex</title></svelte:head>
<svelte:window {onkeydown} />

{#if !log || !deck}
	<div class="flex flex-col items-center gap-3 py-24 text-center">
		<p class="text-muted-foreground text-sm">This battle log does not exist in this browser.</p>
		<Button href="{base}/decks/{deckId}">Back to the deck</Button>
	</div>
{:else if unreadable}
	<div class="flex flex-col items-center gap-3 py-24 text-center">
		<p class="text-muted-foreground max-w-md text-sm">{unreadable}</p>
		<Button href="{base}/decks/{deckId}">Back to the deck</Button>
	</div>
{:else if !replay || !board}
	<!-- One frame, while the log is decompressed. -->
	<p class="text-muted-foreground py-24 text-center text-sm">Reading the log…</p>
{:else}
	<PageHeader
		title="{log.player || 'You'} vs {log.opponentDeck || log.opponent || 'unknown deck'}"
		subtitle={[
			deck.name,
			log.playedOn,
			`${summary?.turns ?? 0} turns`,
			summary?.wentFirst
				? `${summary.wentFirst === log.player ? 'you' : summary.wentFirst} went first`
				: null
		]
			.filter(Boolean)
			.join(' · ')}
		backHref="{base}/decks/{deckId}"
	>
		{#snippet actions()}
			{#if log.result !== 'unknown'}
				<Badge variant={log.result === 'win' ? 'default' : log.result === 'loss' ? 'destructive' : 'secondary'}>
					{log.result === 'win' ? 'Win' : log.result === 'loss' ? 'Loss' : 'Tie'}
				</Badge>
			{/if}
			<Button href="{base}/decks/{deckId}" variant="outline" size="sm">
				<Swords class="size-4" /> <span class="sr-only sm:not-sr-only">All games</span>
			</Button>
		{/snippet}
	</PageHeader>

	<div class="grid gap-4 p-2 sm:p-4 md:p-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
		<div class="flex min-w-0 flex-col gap-3">
			<BattleBoard
				state={board}
				you={log.player}
				{cards}
				touched={current?.touched ?? []}
				wentFirst={summary?.wentFirst ?? null}
				onselect={select}
				onshowdiscard={(side) => {
					playing = false;
					discardSide = side;
				}}
			/>

			<div class="flex flex-col gap-2 rounded-xl border p-3">
				<!-- What just happened, in the log's own words. Fixed height, so the controls
				     under it never move while the game plays. -->
				<div class="bg-muted/50 flex h-[4.75rem] flex-col gap-0.5 overflow-hidden rounded-lg px-3 py-2">
					<p class="text-muted-foreground text-[11px] tracking-wide uppercase">
						{current ? current.section : 'Before the game'}
						{#if current?.turnNumber}· turn {current.turnNumber}{/if}
						<span class="float-right tabular-nums normal-case">{position} / {stops.length}</span>
					</p>
					<p class="line-clamp-2 text-sm leading-snug">
						{current ? current.event.text : 'Press play, or step forward with the arrow keys.'}
					</p>
					{#if current?.event.cards.length}
						<p class="text-muted-foreground truncate text-xs">{current.event.cards.join(', ')}</p>
					{/if}
				</div>

				<!-- The scrub bar, with a mark at every knockout: yours below the line, theirs above. -->
				<div class="relative px-1 pt-2 pb-1">
					<div class="pointer-events-none absolute inset-x-1 top-0 h-2">
						{#each marks.filter((mark) => !mark.mine) as mark (mark.step)}
							<span
								class="bg-destructive absolute top-0 h-2 w-0.5 -translate-x-1/2 rounded-sm"
								style="left: {((mark.step + 1) / Math.max(1, total)) * 100}%"
								title={mark.label}
							></span>
						{/each}
					</div>
					<input
						type="range"
						min="-1"
						max={Math.max(0, total - 1)}
						value={cursor}
						aria-label="Position in the game"
						oninput={(event) => goto(Number(event.currentTarget.value))}
						class="accent-primary block w-full"
					/>
					<div class="pointer-events-none absolute inset-x-1 bottom-0 h-2">
						{#each marks.filter((mark) => mark.mine) as mark (mark.step)}
							<span
								class="bg-primary absolute bottom-0 h-2 w-0.5 -translate-x-1/2 rounded-sm"
								style="left: {((mark.step + 1) / Math.max(1, total)) * 100}%"
								title={mark.label}
							></span>
						{/each}
					</div>
				</div>

				<div class="flex items-center justify-center gap-1.5 sm:gap-2">
					<Button variant="outline" size="icon" aria-label="Back to the start" onclick={() => goto(-1)}>
						<ChevronsLeft class="size-4" />
					</Button>
					<Button variant="outline" size="icon" aria-label="Previous turn" onclick={() => turn(-1)}>
						<SkipBack class="size-4" />
					</Button>
					<Button variant="outline" size="icon" aria-label="Previous line" onclick={() => step(-1)}>
						<ChevronLeft class="size-4" />
					</Button>
					<Button
						size="icon"
						class="size-11"
						aria-label={playing ? 'Pause' : atEnd ? 'Play again' : 'Play'}
						onclick={togglePlay}
					>
						{#if playing}<Pause class="size-5" />{:else if atEnd}<RotateCcw class="size-5" />{:else}<Play class="size-5" />{/if}
					</Button>
					<Button variant="outline" size="icon" aria-label="Next line" onclick={() => step(1)}>
						<ChevronRight class="size-4" />
					</Button>
					<Button variant="outline" size="icon" aria-label="Next turn" onclick={() => turn(1)}>
						<SkipForward class="size-4" />
					</Button>
					<Button variant="outline" size="icon" aria-label="To the end" onclick={() => goto(total - 1)}>
						<ChevronsRight class="size-4" />
					</Button>
				</div>

				<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
					<div class="bg-muted flex gap-0.5 rounded-lg p-0.5" role="group" aria-label="Playback speed">
						{#each SPEEDS as speed (speed.ms)}
							<button
								type="button"
								onclick={() => (prefs.replaySpeed = speed.ms)}
								aria-pressed={prefs.replaySpeed === speed.ms}
								class={cn(
									'rounded-md px-2 py-1 text-xs font-medium transition-colors',
									prefs.replaySpeed === speed.ms
										? 'bg-background text-foreground shadow-sm'
										: 'text-muted-foreground hover:text-foreground'
								)}
							>
								{speed.label}
							</button>
						{/each}
					</div>

					<div class="flex items-center gap-2">
						<Switch
							id="replay-noise"
							checked={!prefs.replayHideNoise}
							onCheckedChange={(checked) => (prefs.replayHideNoise = !checked)}
						/>
						<Label for="replay-noise" class="text-xs font-normal">
							Every line ({total - stops.length} hidden)
						</Label>
					</div>

					<span class="text-muted-foreground hidden text-xs xl:inline">
						← → line · ↑ ↓ turn · space plays · tap a card for details
					</span>
				</div>
			</div>

			<!-- On a phone the log sits here, in a box that scrolls on its own, so playback
			     never moves the page. On a wide screen it is the sticky column instead. -->
			<div class="xl:hidden">
				{@render logPanel('h-[40svh]')}
			</div>

			{#if summary?.them}
				<Card.Root>
					<Card.Header>
						<Card.Title class="text-base">What {log.opponent || 'they'} showed</Card.Title>
						<Card.Description>
							Every card they put into play this game, most-played first — the start of a
							matchup note.
						</Card.Description>
					</Card.Header>
					<Card.Content class="flex flex-wrap gap-1.5">
						{#each summary.them.cards as entry (entry.name)}
							<Badge variant="secondary" class="font-normal">
								{entry.name}{entry.count > 1 ? ` ×${entry.count}` : ''}
							</Badge>
						{/each}
					</Card.Content>
				</Card.Root>
			{/if}

			{#if log.note}
				<Card.Root>
					<Card.Header><Card.Title class="text-base">Your note</Card.Title></Card.Header>
					<Card.Content class="text-muted-foreground text-sm whitespace-pre-wrap">
						{log.note}
					</Card.Content>
				</Card.Root>
			{/if}
		</div>

		<aside class="hidden xl:sticky xl:top-24 xl:block xl:h-[calc(100svh-8rem)]">
			{@render logPanel('h-full')}
		</aside>
	</div>

	<CardDetailSheet bind:card={selected} bind:open={sheetOpen} />

	<Dialog.Root open={discardSide !== null} onOpenChange={(open) => !open && (discardSide = null)}>
		<Dialog.Content class="max-h-[85svh] overflow-y-auto sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title>{discardSide?.player}'s discard pile</Dialog.Title>
				<Dialog.Description>
					{discardSide?.discard.length ?? 0} cards the log named
					{#if discardSide?.discardUnknown}
						, plus {discardSide.discardUnknown} it did not
					{/if}
					— oldest first.
				</Dialog.Description>
			</Dialog.Header>
			<div class="grid grid-cols-4 gap-2 sm:grid-cols-5">
				{#each discardEntries as entry (entry.name)}
					{@const card = cards.find(entry.name)}
					<button
						type="button"
						class="relative text-left"
						disabled={!card}
						onclick={() => card && select(card)}
						title={entry.name}
					>
						{#if card}
							<CardImage {card} eager class="aspect-[63/88] w-full rounded-md" />
						{:else}
							<div
								class="bg-muted text-muted-foreground grid aspect-[63/88] w-full place-items-center rounded-md border p-1 text-center text-[10px] leading-tight"
							>
								<span class="line-clamp-3">{entry.name}</span>
							</div>
						{/if}
						{#if entry.count > 1}
							<span
								class="bg-background absolute -top-1 -right-1 rounded-full border px-1.5 text-[10px] font-semibold tabular-nums shadow-sm"
							>
								×{entry.count}
							</span>
						{/if}
					</button>
				{/each}
			</div>
		</Dialog.Content>
	</Dialog.Root>
{/if}

<!-- The action log. Rendered once, into whichever column the viewport uses. -->
{#snippet logPanel(heightClass: string)}
	<Card.Root class={cn('flex flex-col', heightClass)}>
		<Card.Header class="pb-2">
			<Card.Title class="text-base">The log</Card.Title>
			<Card.Description>Tap a line to jump to it.</Card.Description>
		</Card.Header>
		<Card.Content class="relative min-h-0 flex-1 overflow-y-auto pt-0" data-log-list>
			<div class="flex flex-col">
				{#each lines as line (line.index)}
					{#if line.heading}
						{@const turnNumber = line.item.turnNumber}
						<p
							class="text-muted-foreground bg-card sticky top-0 z-10 flex items-baseline justify-between py-1.5 text-[11px] font-semibold tracking-wide uppercase"
						>
							<span>{line.heading}</span>
							{#if turnNumber && /turn$/i.test(line.heading)}
								<span class="tabular-nums normal-case">turn {turnNumber}</span>
							{/if}
						</p>
					{/if}
					<button
						type="button"
						data-step={line.index}
						onclick={() => goto(line.index)}
						class={cn(
							'flex items-start gap-2 rounded px-1.5 py-1 text-left text-xs leading-snug transition-colors',
							line.item.event.depth > 0 && 'text-muted-foreground border-border ml-3 border-l pl-2.5',
							line.index === cursor
								? 'bg-primary text-primary-foreground'
								: line.index < cursor
									? 'hover:bg-accent'
									: 'hover:bg-accent opacity-80'
						)}
					>
						{#if line.item.event.depth === 0}
							<span class={cn('w-7 shrink-0 text-right tabular-nums', line.index === cursor ? 'text-primary-foreground/80' : 'text-muted-foreground/70')}>
								{line.index + 1}
							</span>
						{/if}
						<span class="min-w-0 flex-1">
							{line.item.event.text}
							{#if line.item.event.cards.length}
								<span class={cn('block text-[11px]', line.index === cursor ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
									{line.item.event.cards.join(', ')}
								</span>
							{/if}
						</span>
					</button>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>
{/snippet}
