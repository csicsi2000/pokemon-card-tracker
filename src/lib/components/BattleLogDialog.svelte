<script lang="ts">
	/**
	 * Save a game for a deck: paste the log out of TCG Live's log panel and this reads it.
	 *
	 * Everything the form offers is already filled in from the paste — both handles, which
	 * one is yours (guessed by matching what each side played against the deck's list), who
	 * won, how long it ran. The user's job is to glance at the guess, name the opponent's
	 * deck if they care to, and save.
	 */
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { toast } from 'svelte-sonner';
	import ClipboardPaste from '@lucide/svelte/icons/clipboard-paste';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { logTexts } from '$lib/logs.svelte';
	import { store } from '$lib/store.svelte';
	import { buildReplay, detectPlayer, parseBattleLog, summarize } from '$lib/tcg/battle-log';
	import { BATTLE_RESULTS, type BattleLog, type BattleResult } from '$lib/data/model';
	import type { Card } from '$lib/types';

	let {
		open = $bindable(false),
		deckId,
		/** The deck's cards, for guessing which side of the log is the user's. */
		deckCards,
		/** Editing an existing log instead of adding one: the text is then already there. */
		existing = null,
		onsaved
	}: {
		open?: boolean;
		deckId: string;
		deckCards: Card[];
		existing?: BattleLog | null;
		onsaved?: (log: BattleLog) => void;
	} = $props();

	let text = $state('');
	let player = $state('');
	let result = $state<BattleResult>('unknown');
	let playedOn = $state('');
	let opponentDeck = $state('');
	let note = $state('');
	/**
	 * Set once the user picks one of these by hand, so re-parsing stops overriding them.
	 * They are separate on purpose: correcting the side has to be free to flip the result,
	 * since a log read from the wrong side reports every win as a loss.
	 */
	let pickedPlayer = $state(false);
	let pickedResult = $state(false);

	const today = () => new Date().toISOString().slice(0, 10);

	/** An existing log is stored compressed, so its text arrives a tick after the dialog. */
	const existingText = $derived(existing ? logTexts.text(existing) : '');

	$effect(() => {
		if (!open) return;
		text = existingText ?? '';
		player = existing?.player ?? '';
		result = existing?.result ?? 'unknown';
		playedOn = existing?.playedOn ?? today();
		opponentDeck = existing?.opponentDeck ?? '';
		note = existing?.note ?? '';
		pickedPlayer = Boolean(existing);
		pickedResult = Boolean(existing);
	});

	/** Re-parsed as the user types; a full log is ~500 lines, which is nothing. */
	const parsed = $derived(text.trim() ? parseBattleLog(text) : null);
	const guess = $derived(
		parsed ? detectPlayer(parsed, deckCards.map((card) => card.name)) : null
	);

	// The guess fills the field until the user overrides it.
	$effect(() => {
		if (pickedPlayer || !guess?.player) return;
		player = guess.player;
	});

	const opponent = $derived(parsed?.players.find((name) => name !== player) ?? '');

	const summary = $derived.by(() => {
		if (!parsed || !player) return null;
		return summarize(buildReplay(parsed), player);
	});

	// The log states the winner; the user only has to touch this for a tie or a rage-quit.
	$effect(() => {
		if (pickedResult || !summary || summary.outcome === 'unknown') return;
		result = summary.outcome;
	});

	const RESULT_LABELS: Record<BattleResult, string> = {
		win: 'Win',
		loss: 'Loss',
		tie: 'Tie',
		unknown: 'Not recorded'
	};

	async function paste() {
		try {
			text = await navigator.clipboard.readText();
		} catch {
			// Firefox and Safari refuse clipboard reads without a gesture they trust; the
			// textarea is right there and Ctrl+V works.
		}
	}

	let saving = $state(false);

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!parsed || saving) return;

		const changes = {
			text,
			player,
			opponent,
			result,
			playedOn: playedOn || null,
			opponentDeck: opponentDeck.trim() || null,
			note: note.trim() || null
		};

		saving = true;
		try {
			if (existing) {
				await store.updateBattleLog(existing.id, changes);
				open = false;
				onsaved?.({ ...existing, ...changes, encoding: existing.encoding });
				return;
			}

			const log = await store.saveBattleLog({ deckId, ...changes });
			if (!log) {
				toast.error('That deck no longer exists.');
				return;
			}
			open = false;
			onsaved?.(log);
		} catch (error) {
			// Even compressed, a game is a few kilobytes, so this is the write most likely to
			// meet the browser's storage quota.
			toast.error((error as Error).message);
		} finally {
			saving = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>{existing ? 'Edit battle log' : 'Save a battle log'}</Dialog.Title>
			<Dialog.Description>
				Paste the log from Pokémon TCG Live — the whole thing, from “Setup” to the last line.
				Cardex reads the players, the turns and the result out of it, and replays the board.
			</Dialog.Description>
		</Dialog.Header>

		<form onsubmit={save} class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<Label for="battle-log-text">Log</Label>
					<Button type="button" variant="ghost" size="sm" onclick={paste}>
						<ClipboardPaste class="size-4" /> Paste
					</Button>
				</div>
				<Textarea
					id="battle-log-text"
					bind:value={text}
					rows={8}
					required
					class="font-mono text-xs"
					placeholder={'Setup\nSomeone chose tails for the opening coin flip.\n…'}
				/>
			</div>

			{#if parsed && parsed.players.length < 2}
				<p class="text-muted-foreground flex items-start gap-2 text-sm">
					<TriangleAlert class="mt-0.5 size-4 shrink-0" />
					This does not look like a TCG Live log — no turns with two players in it. Save it
					anyway if you like; the replay will be thin.
				</p>
			{/if}

			{#if summary}
				<div class="flex flex-wrap items-center gap-2 text-xs">
					<Badge variant="secondary">{summary.turns} turns</Badge>
					{#if summary.wentFirst}
						<Badge variant="secondary">
							{summary.wentFirst === player ? 'You went first' : `${summary.wentFirst} went first`}
						</Badge>
					{/if}
					{#if summary.winner}
						<Badge variant={summary.outcome === 'win' ? 'default' : 'destructive'}>
							{summary.winner} won
						</Badge>
					{/if}
					<span class="text-muted-foreground">
						{summary.you?.prizesTaken ?? 0}–{summary.them?.prizesTaken ?? 0} on prizes
					</span>
					{#if summary.them?.pokemon.length}
						<span class="text-muted-foreground truncate">
							· they played {summary.them.pokemon
								.slice(0, 4)
								.map((entry) => entry.name)
								.join(', ')}
						</span>
					{/if}
				</div>
			{/if}

			<div class="grid gap-4 sm:grid-cols-2">
				<div class="flex flex-col gap-2">
					<Label for="battle-log-player">Your side</Label>
					<Select.Root
						type="single"
						value={player}
						onValueChange={(value) => {
							player = value;
							pickedPlayer = true;
						}}
					>
						<Select.Trigger id="battle-log-player">
							{player || 'Pick a player'}
						</Select.Trigger>
						<Select.Content>
							{#each parsed?.players ?? [] as name (name)}
								<Select.Item value={name}>{name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					{#if guess && !guess.confident && parsed?.players.length}
						<p class="text-muted-foreground text-xs">
							Could not tell the sides apart from this deck's list — pick yours.
						</p>
					{:else if guess?.confident}
						<p class="text-muted-foreground text-xs">
							Guessed from {guess.scores.find((score) => score.player === guess.player)?.matched} cards
							matching this deck.
						</p>
					{/if}
				</div>

				<div class="flex flex-col gap-2">
					<Label for="battle-log-result">Result</Label>
					<Select.Root
						type="single"
						value={result}
						onValueChange={(value) => {
							result = value as BattleResult;
							pickedResult = true;
						}}
					>
						<Select.Trigger id="battle-log-result">{RESULT_LABELS[result]}</Select.Trigger>
						<Select.Content>
							{#each BATTLE_RESULTS as option (option)}
								<Select.Item value={option}>{RESULT_LABELS[option]}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<div class="flex flex-col gap-2">
					<Label for="battle-log-date">Played on</Label>
					<Input id="battle-log-date" type="date" bind:value={playedOn} />
				</div>

				<div class="flex flex-col gap-2">
					<Label for="battle-log-opponent-deck">
						Opponent's deck {opponent ? `(${opponent})` : ''}
					</Label>
					<Input
						id="battle-log-opponent-deck"
						bind:value={opponentDeck}
						placeholder="Grimmsnarl ex / Froslass"
					/>
				</div>
			</div>

			<div class="flex flex-col gap-2">
				<Label for="battle-log-note">Note</Label>
				<Textarea
					id="battle-log-note"
					bind:value={note}
					rows={2}
					placeholder="Bricked on turn one — no Poffin, no supporter. Needs a fourth Poffin."
				/>
			</div>

			<Dialog.Footer>
				<Button type="submit" disabled={!text.trim() || saving}>
					{existing ? 'Save changes' : 'Save log'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
