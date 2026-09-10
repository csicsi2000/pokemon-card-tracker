<script lang="ts">
	/**
	 * A deck's saved games: the record, how each opponent deck has gone, and one row per
	 * log through to its replay.
	 *
	 * The same rows and the same dialog serve the Battles page, which shows every deck at
	 * once; this is the view scoped to one.
	 */
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import Swords from '@lucide/svelte/icons/swords';
	import { toast } from 'svelte-sonner';
	import BattleLogDialog from './BattleLogDialog.svelte';
	import BattleLogRow from './BattleLogRow.svelte';
	import MatchupTable from './MatchupTable.svelte';
	import StatTile from './StatTile.svelte';
	import { logFacts } from '$lib/logs.svelte';
	import { store } from '$lib/store.svelte';
	import { battleRecord, matchups, recordLabel } from '$lib/tcg/battle-log/record';
	import type { BattleLog } from '$lib/types';
	import type { Catalogue } from '$lib/catalogue';

	let {
		deckId,
		catalogue
	}: {
		deckId: string;
		/** Lets the dialog read the deck's card names to guess which side of a log is yours. */
		catalogue: Catalogue;
	} = $props();

	const logs = $derived(store.battleLogsFor(deckId));
	const record = $derived(battleRecord(logs));
	const byOpponent = $derived(matchups(logs));
	const facts = $derived(logFacts(logs));

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

	function remove(log: BattleLog) {
		store.deleteBattleLog(log.id);
		toast.success(`Deleted the game against ${log.opponent || 'your opponent'}`);
	}
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

		<MatchupTable rows={byOpponent} />

		<div class="flex flex-col gap-2">
			{#each logs as log (log.id)}
				<BattleLogRow {log} facts={facts.get(log.id) ?? null} onedit={edit} ondelete={remove} />
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
<BattleLogDialog bind:open={dialogOpen} {deckId} {catalogue} existing={editing} />
