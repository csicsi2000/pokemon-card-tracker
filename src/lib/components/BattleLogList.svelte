<script lang="ts">
	/**
	 * A deck's saved games: the record, how each opponent deck has gone, and one row per
	 * log through to its replay.
	 *
	 * Each row's turn count and prize score are parsed from the log every time this
	 * renders. That is cheap (a long game is half a millisecond) and it means nothing
	 * derived is ever stale against a better parser.
	 */
	import { base } from '$app/paths';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import Play from '@lucide/svelte/icons/play';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Swords from '@lucide/svelte/icons/swords';
	import { toast } from 'svelte-sonner';
	import BattleLogDialog from './BattleLogDialog.svelte';
	import StatTile from './StatTile.svelte';
	import { logTexts } from '$lib/logs.svelte';
	import { store } from '$lib/store.svelte';
	import { battleRecord, matchups, recordLabel } from '$lib/tcg/battle-log/record';
	import { buildReplay, parseBattleLog, summarize } from '$lib/tcg/battle-log';
	import type { BattleLog, BattleResult, Card as CardType } from '$lib/types';

	let {
		deckId,
		deckCards
	}: {
		deckId: string;
		/** The deck's cards, so the dialog can tell which side of a log is the user's. */
		deckCards: CardType[];
	} = $props();

	const logs = $derived(store.battleLogsFor(deckId));
	const record = $derived(battleRecord(logs));
	const byOpponent = $derived(matchups(logs));

	/** One dialog does both jobs; `editing` decides which. */
	let dialogOpen = $state(false);
	let editing = $state<BattleLog | null>(null);

	function add() {
		editing = null;
		dialogOpen = true;
	}

	function edit(log: BattleLog) {
		editing = log;
		dialogOpen = true;
	}

	/**
	 * Turn count and prize score per log. The text has to be decompressed first, so a row
	 * renders without these and gains them a moment later — the rest of the row is real
	 * record data and does not wait for anything.
	 */
	const facts = $derived.by(() => {
		const out = new Map<string, { turns: number; prizes: string }>();
		for (const log of logs) {
			const text = logTexts.text(log);
			if (text === null) continue;
			const summary = summarize(buildReplay(parseBattleLog(text)), log.player);
			out.set(log.id, {
				turns: summary.turns,
				prizes: `${summary.you?.prizesTaken ?? 0}–${summary.them?.prizesTaken ?? 0}`
			});
		}
		return out;
	});

	const RESULT_STYLE: Record<BattleResult, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
		win: { label: 'Win', variant: 'default' },
		loss: { label: 'Loss', variant: 'destructive' },
		tie: { label: 'Tie', variant: 'secondary' },
		unknown: { label: 'No result', variant: 'outline' }
	};

	function remove(log: BattleLog) {
		store.deleteBattleLog(log.id);
		toast.success(`Deleted the game against ${log.opponent || 'your opponent'}`);
	}

	const dateLabel = (log: BattleLog) => log.playedOn ?? log.createdAt.slice(0, 10);
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<p class="text-muted-foreground text-sm">
			{#if logs.length === 0}
				No games saved for this deck yet.
			{:else}
				{logs.length} game{logs.length === 1 ? '' : 's'} saved
			{/if}
		</p>
		<Button size="sm" onclick={add}>
			<Swords class="size-4" /> Save a battle log
		</Button>
	</div>

	{#if logs.length > 0}
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<StatTile label="Record" value={recordLabel(record)} hint="wins–losses" />
			<StatTile
				label="Win rate"
				value={record.winRate === null ? '—' : `${Math.round(record.winRate * 100)}%`}
				hint={record.unknown > 0 ? `${record.unknown} game(s) without a result` : 'of decided games'}
			/>
			<StatTile label="Games" value={record.played} />
			<StatTile
				label="Matchups"
				value={byOpponent.length}
				hint={byOpponent.length ? `worst: ${byOpponent[0].label}` : 'name an opponent deck to track'}
			/>
		</div>

		{#if byOpponent.length > 0}
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">By opponent deck</Card.Title>
					<Card.Description>Worst matchup first — the reason to keep logs.</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-col gap-1.5">
					{#each byOpponent as matchup (matchup.label)}
						<div class="flex items-center gap-3 text-sm">
							<span class="min-w-0 flex-1 truncate">{matchup.label}</span>
							<span class="text-muted-foreground tabular-nums">
								{recordLabel(matchup.record)}
							</span>
							<span class="w-10 text-right tabular-nums">
								{matchup.record.winRate === null
									? '—'
									: `${Math.round(matchup.record.winRate * 100)}%`}
							</span>
						</div>
					{/each}
				</Card.Content>
			</Card.Root>
		{/if}

		<div class="flex flex-col gap-2">
			{#each logs as log (log.id)}
				{@const fact = facts.get(log.id)}
				{@const style = RESULT_STYLE[log.result]}
				<div class="hover:bg-accent/40 flex items-center gap-3 rounded-lg border p-2.5 transition-colors">
					<Badge variant={style.variant} class="shrink-0">{style.label}</Badge>

					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">
							vs {log.opponentDeck || log.opponent || 'unknown deck'}
						</p>
						<p class="text-muted-foreground truncate text-xs">
							{dateLabel(log)}
							{#if fact}
								· {fact.turns} turns · prizes {fact.prizes}
							{/if}
							{#if log.opponentDeck && log.opponent}· {log.opponent}{/if}
						</p>
						{#if log.note}
							<p class="text-muted-foreground mt-0.5 line-clamp-2 text-xs italic">{log.note}</p>
						{/if}
					</div>

					<Button href="{base}/decks/{deckId}/battles/{log.id}" size="sm" variant="outline">
						<Play class="size-4" /> <span class="max-sm:sr-only">Replay</span>
					</Button>
					<Button
						size="icon"
						variant="ghost"
						class="size-8"
						aria-label="Edit this log"
						onclick={() => edit(log)}
					>
						<Pencil class="size-4" />
					</Button>
					<Button
						size="icon"
						variant="ghost"
						class="text-destructive size-8"
						aria-label="Delete this log"
						onclick={() => remove(log)}
					>
						<Trash2 class="size-4" />
					</Button>
				</div>
			{/each}
		</div>
	{:else}
		<Card.Root>
			<Card.Content class="text-muted-foreground flex flex-col gap-2 py-8 text-center text-sm">
				<p>
					Paste a log from Pokémon TCG Live and Cardex replays the whole game — board, damage,
					prizes, turn by turn.
				</p>
				<p class="text-xs">
					In TCG Live, open the log panel during or after a match and copy the text.
				</p>
			</Card.Content>
		</Card.Root>
	{/if}
</div>

<!-- Adding and editing share the form; `existing` puts a saved log back into it. -->
<BattleLogDialog bind:open={dialogOpen} {deckId} {deckCards} existing={editing} />
