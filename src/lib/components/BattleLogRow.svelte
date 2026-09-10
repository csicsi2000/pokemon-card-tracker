<script lang="ts">
	/**
	 * One saved game, as a row: result, who it was against, and the way through to its replay.
	 *
	 * The turn count and prize score arrive a moment after the row does — the log they come
	 * from is stored compressed — so the row is built to read fine without them rather than
	 * hold everything back behind a spinner.
	 */
	import { base } from '$app/paths';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import Play from '@lucide/svelte/icons/play';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { BattleLog, BattleResult } from '$lib/types';

	let {
		log,
		/** Shown on the Battles page, where games from every deck sit in one list. */
		deckName = null,
		facts = null,
		onedit,
		ondelete
	}: {
		log: BattleLog;
		deckName?: string | null;
		facts?: { turns: number; prizes: string } | null;
		onedit: (log: BattleLog) => void;
		ondelete: (log: BattleLog) => void;
	} = $props();

	const RESULT_STYLE: Record<
		BattleResult,
		{ label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }
	> = {
		win: { label: 'Win', variant: 'default' },
		loss: { label: 'Loss', variant: 'destructive' },
		tie: { label: 'Tie', variant: 'secondary' },
		unknown: { label: 'No result', variant: 'outline' }
	};

	const style = $derived(RESULT_STYLE[log.result]);
	const playedOn = $derived(log.playedOn ?? log.createdAt.slice(0, 10));

	/**
	 * Joined here rather than in the markup: Svelte trims the whitespace around a template
	 * conditional, so the separators would collide with the text around them.
	 */
	const meta = $derived(
		[
			deckName,
			playedOn,
			facts ? `${facts.turns} turns` : null,
			facts ? `prizes ${facts.prizes}` : null,
			// The handle only earns its place once the opponent's *deck* has taken the title.
			log.opponentDeck && log.opponent ? log.opponent : null
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<div class="hover:bg-accent/40 flex items-center gap-3 rounded-lg border p-2.5 transition-colors">
	<Badge variant={style.variant} class="shrink-0">{style.label}</Badge>

	<div class="min-w-0 flex-1">
		<!-- The opponent leads: it is what a list of games is scanned for, and on a phone
		     anything after it is the first thing to be truncated away. -->
		<p class="truncate text-sm font-medium">
			vs {log.opponentDeck || log.opponent || 'unknown deck'}
		</p>
		<p class="text-muted-foreground truncate text-xs">{meta}</p>
		{#if log.note}
			<p class="text-muted-foreground mt-0.5 line-clamp-2 text-xs italic">{log.note}</p>
		{/if}
	</div>

	<Button href="{base}/decks/{log.deckId}/battles/{log.id}" size="sm" variant="outline">
		<Play class="size-4" /> <span class="max-sm:sr-only">Replay</span>
	</Button>
	<Button
		size="icon"
		variant="ghost"
		class="size-8"
		aria-label="Edit this log"
		onclick={() => onedit(log)}
	>
		<Pencil class="size-4" />
	</Button>
	<Button
		size="icon"
		variant="ghost"
		class="text-destructive size-8"
		aria-label="Delete this log"
		onclick={() => ondelete(log)}
	>
		<Trash2 class="size-4" />
	</Button>
</div>
