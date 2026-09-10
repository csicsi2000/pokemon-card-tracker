<script lang="ts">
	/**
	 * A saved game, replayed: the board on the left, the log on the right, and controls
	 * that step, play and scrub through it.
	 *
	 * The whole replay is folded once per log — every board position for every line, which
	 * for a long game is a few hundred small objects — so stepping and scrubbing are just
	 * an index change and stay instant even while dragging the slider.
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
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronsLeft from '@lucide/svelte/icons/chevrons-left';
	import ChevronsRight from '@lucide/svelte/icons/chevrons-right';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import Swords from '@lucide/svelte/icons/swords';
	import { prefs } from '$lib/prefs.svelte';
	import { store } from '$lib/store.svelte';
	import { buildLogCardIndex } from '$lib/tcg/battle-log/artwork';
	import { buildReplay, isBookkeeping, parseBattleLog, summarize } from '$lib/tcg/battle-log';
	import { cn } from '$lib/utils';

	let { data } = $props();

	const deckId = $derived(page.params.id!);
	const logId = $derived(page.params.logId!);
	const deck = $derived(store.deck(deckId));
	const log = $derived(store.battleLog(logId));

	const replay = $derived(log ? buildReplay(parseBattleLog(log.text)) : null);
	const summary = $derived(replay && log ? summarize(replay, log.player) : null);

	/** The deck's printings, so the board shows the cards the user actually owns. */
	const cards = $derived(
		buildLogCardIndex(
			data.catalogue,
			(deck?.cards ?? []).map((row) => row.cardId)
		)
	);

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

		const keys: Record<string, () => void> = {
			ArrowRight: () => step(1),
			ArrowLeft: () => step(-1),
			ArrowDown: () => turn(1),
			ArrowUp: () => turn(-1),
			Home: () => goto(-1),
			End: () => goto(total - 1),
			' ': () => (playing = !playing)
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

	/** Keeps the current line in view as the replay plays itself. */
	$effect(() => {
		const element = document.querySelector<HTMLElement>(`[data-step="${cursor}"]`);
		element?.scrollIntoView({ block: 'nearest' });
	});

	const SPEEDS = [
		{ ms: 1400, label: '0.5×' },
		{ ms: 700, label: '1×' },
		{ ms: 350, label: '2×' },
		{ ms: 120, label: '5×' }
	];
</script>

<svelte:head><title>Replay · {deck?.name ?? 'Deck'} · Cardex</title></svelte:head>
<svelte:window {onkeydown} />

{#if !log || !deck || !replay || !board}
	<div class="flex flex-col items-center gap-3 py-24 text-center">
		<p class="text-muted-foreground text-sm">This battle log does not exist in this browser.</p>
		<Button href="{base}/decks/{deckId}">Back to the deck</Button>
	</div>
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

	<div class="grid gap-4 p-4 md:p-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
		<div class="flex min-w-0 flex-col gap-3">
			<BattleBoard state={board} you={log.player} {cards} touched={current?.touched ?? []} />

			<!-- What just happened, in the log's own words. -->
			<div class="bg-muted/50 flex min-h-16 flex-col gap-1 rounded-xl border p-3">
				<p class="text-muted-foreground text-xs tracking-wide uppercase">
					{current ? current.section : 'Before the game'}
					{#if current?.turnNumber}· turn {current.turnNumber}{/if}
				</p>
				<p class="text-sm">
					{current ? current.event.text : 'Press play, or step forward with the arrow keys.'}
				</p>
				{#if current?.event.cards.length}
					<p class="text-muted-foreground text-xs">{current.event.cards.join(', ')}</p>
				{/if}
			</div>

			<div class="flex flex-col gap-2 rounded-xl border p-3">
				<input
					type="range"
					min="-1"
					max={Math.max(0, total - 1)}
					value={cursor}
					aria-label="Position in the game"
					oninput={(event) => goto(Number(event.currentTarget.value))}
					class="accent-primary w-full"
				/>

				<div class="flex flex-wrap items-center gap-1.5">
					<Button variant="outline" size="icon" aria-label="Back to the start" onclick={() => goto(-1)}>
						<ChevronsLeft class="size-4" />
					</Button>
					<Button variant="outline" size="icon" aria-label="Previous line" onclick={() => step(-1)}>
						<ChevronLeft class="size-4" />
					</Button>
					<Button
						size="icon"
						aria-label={playing ? 'Pause' : 'Play'}
						onclick={() => (playing = !playing)}
					>
						{#if playing}<Pause class="size-4" />{:else}<Play class="size-4" />{/if}
					</Button>
					<Button variant="outline" size="icon" aria-label="Next line" onclick={() => step(1)}>
						<ChevronRight class="size-4" />
					</Button>
					<Button variant="outline" size="icon" aria-label="To the end" onclick={() => goto(total - 1)}>
						<ChevronsRight class="size-4" />
					</Button>

					<div class="mx-1 flex gap-1">
						<Button variant="ghost" size="sm" onclick={() => turn(-1)}>Prev turn</Button>
						<Button variant="ghost" size="sm" onclick={() => turn(1)}>Next turn</Button>
					</div>

					<span class="text-muted-foreground ml-auto text-xs tabular-nums">
						{position} / {stops.length}
					</span>
				</div>

				<div class="flex flex-wrap items-center gap-3">
					<div class="bg-muted flex gap-0.5 rounded-lg p-0.5">
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
							Show every line ({total - stops.length} hidden)
						</Label>
					</div>

					<span class="text-muted-foreground text-xs">
						← → step · ↑ ↓ turn · space plays
					</span>
				</div>
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

		<aside class="lg:sticky lg:top-24 lg:h-[calc(100svh-8rem)]">
			<Card.Root class="flex h-full flex-col">
				<Card.Header>
					<Card.Title class="text-base">The log</Card.Title>
					<Card.Description>Click a line to jump to it.</Card.Description>
				</Card.Header>
				<Card.Content class="min-h-0 flex-1 overflow-y-auto">
					<div class="flex flex-col">
						{#each lines as line (line.index)}
							{#if line.heading}
								<p
									class="text-muted-foreground bg-card sticky top-0 z-10 py-1 text-xs font-semibold tracking-wide uppercase"
								>
									{line.heading}
								</p>
							{/if}
							<button
								type="button"
								data-step={line.index}
								onclick={() => goto(line.index)}
								class={cn(
									'rounded px-1.5 py-0.5 text-left text-xs transition-colors',
									line.item.event.depth > 0 && 'text-muted-foreground pl-4',
									line.index === cursor
										? 'bg-primary text-primary-foreground'
										: 'hover:bg-accent'
								)}
							>
								{line.item.event.text}
							</button>
						{/each}
					</div>
				</Card.Content>
			</Card.Root>
		</aside>
	</div>
{/if}
