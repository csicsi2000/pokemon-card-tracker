<script lang="ts">
	/**
	 * Every game the user has saved, across every deck.
	 *
	 * The deck page's Battles tab answers "how is this build doing"; this page answers the
	 * questions that span decks — what is my overall record, which archetype keeps beating
	 * me whatever I bring, and where do I paste a log when I have just finished a game and
	 * am not already looking at the deck I played.
	 */
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import BattleLogDialog from '$lib/components/BattleLogDialog.svelte';
	import BattleLogRow from '$lib/components/BattleLogRow.svelte';
	import MatchupTable from '$lib/components/MatchupTable.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import Swords from '@lucide/svelte/icons/swords';
	import { toast } from 'svelte-sonner';
	import { logFacts } from '$lib/logs.svelte';
	import { store } from '$lib/store.svelte';
	import { battleRecord, matchups, recordLabel } from '$lib/tcg/battle-log/record';
	import type { BattleLog } from '$lib/types';

	let { data } = $props();

	/** The deck filter lives in the URL, so a filtered view can be bookmarked or shared. */
	const deckFilter = $derived(page.url.searchParams.get('deck') ?? '');

	function filterBy(deckId: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (deckId) params.set('deck', deckId);
		else params.delete('deck');
		const query = params.toString();
		goto(`${base}/battles/${query ? `?${query}` : ''}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	const deckName = (id: string) => store.deck(id)?.name ?? 'a deleted deck';

	/** Newest game first, across every deck — `battleLogsFor` only sorts within one. */
	const all = $derived(
		[...store.battleLogs].sort((a, b) =>
			(b.playedOn ?? b.createdAt).localeCompare(a.playedOn ?? a.createdAt)
		)
	);
	const logs = $derived(deckFilter ? all.filter((log) => log.deckId === deckFilter) : all);

	const record = $derived(battleRecord(logs));
	const byOpponent = $derived(matchups(logs));
	const facts = $derived(logFacts(logs));

	/** Which decks have games, best record first — the leaderboard of what is working. */
	const byDeck = $derived.by(() => {
		const groups = new Map<string, BattleLog[]>();
		for (const log of all) {
			const group = groups.get(log.deckId);
			if (group) group.push(log);
			else groups.set(log.deckId, [log]);
		}
		return [...groups]
			.map(([id, group]) => ({ id, label: deckName(id), record: battleRecord(group) }))
			.sort((a, b) => (b.record.winRate ?? -1) - (a.record.winRate ?? -1));
	});

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

<svelte:head><title>Battles · Cardex</title></svelte:head>

<PageHeader
	title="Battles"
	subtitle={all.length
		? `${recordLabel(battleRecord(all))} over ${all.length} saved game${all.length === 1 ? '' : 's'}`
		: 'Replays of the games you have played'}
>
	{#snippet actions()}
		<Button size="sm" onclick={add}>
			<Swords class="size-4" /> <span class="sr-only sm:not-sr-only">Save a battle log</span>
		</Button>
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-4 p-4 md:p-8">
	{#if all.length === 0}
		<Card.Root>
			<Card.Content class="text-muted-foreground flex flex-col items-center gap-3 py-16 text-center text-sm">
				<Swords class="size-8 opacity-40" />
				<p class="max-w-md">
					Paste a log from Pokémon TCG Live and Cardex replays the whole game — the board turn
					by turn, damage, prizes, and every card your opponent showed.
				</p>
				<p class="max-w-md text-xs">
					In TCG Live, open the log panel during or after a match and copy the text. Games are
					saved against the deck you played, so keep a record per build.
				</p>
				{#if store.decks.length === 0}
					<Button href="{base}/decks" variant="outline" size="sm">Make a deck first</Button>
				{:else}
					<Button size="sm" onclick={add}>Save your first log</Button>
				{/if}
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<StatTile label="Record" value={recordLabel(record)} hint="wins–losses" />
			<StatTile
				label="Win rate"
				value={record.winRate === null ? '—' : `${Math.round(record.winRate * 100)}%`}
				hint={record.unknown > 0 ? `${record.unknown} without a result` : 'of decided games'}
			/>
			<StatTile label="Games" value={record.played} />
			<StatTile
				label="Decks played"
				value={byDeck.length}
				hint={byDeck.length ? `best: ${byDeck[0].label}` : undefined}
			/>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<Select.Root type="single" value={deckFilter} onValueChange={filterBy}>
				<Select.Trigger class="w-56">
					{deckFilter ? deckName(deckFilter) : 'All decks'}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="">All decks</Select.Item>
					{#each byDeck as entry (entry.id)}
						<Select.Item value={entry.id}>
							{entry.label} · {recordLabel(entry.record)}
						</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>

			{#if deckFilter}
				<Button variant="ghost" size="sm" onclick={() => filterBy('')}>Clear filter</Button>
				<Button href="{base}/decks/{deckFilter}" variant="outline" size="sm">Open the deck</Button>
			{/if}
		</div>

		<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
			<div class="flex min-w-0 flex-col gap-2">
				{#each logs as log (log.id)}
					<BattleLogRow
						{log}
						deckName={deckFilter ? null : deckName(log.deckId)}
						facts={facts.get(log.id) ?? null}
						onedit={edit}
						ondelete={remove}
					/>
				{:else}
					<p class="text-muted-foreground py-12 text-center text-sm">
						No games saved for this deck yet.
					</p>
				{/each}
			</div>

			<aside class="flex flex-col gap-4">
				<MatchupTable
					rows={byOpponent}
					description={deckFilter
						? 'Worst matchup first, for this deck.'
						: 'Worst matchup first, across every deck.'}
				/>

				{#if byDeck.length > 1 && !deckFilter}
					<MatchupTable
						rows={byDeck}
						title="By deck"
						description="Best record first — what is actually working."
					/>
				{/if}
			</aside>
		</div>
	{/if}
</div>

<BattleLogDialog bind:open={dialogOpen} catalogue={data.catalogue} existing={editing} />
