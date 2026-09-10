<script lang="ts">
	/**
	 * How a deck (or the whole collection) has gone against each opponent deck the user
	 * named, worst first — the question a pile of battle logs is actually kept to answer.
	 */
	import * as Card from '$lib/components/ui/card';
	import { cn } from '$lib/utils';
	import type { BattleRecord } from '$lib/tcg/battle-log/record';
	import { recordLabel } from '$lib/tcg/battle-log/record';

	let {
		rows,
		title = 'By opponent deck',
		description = 'Worst matchup first — the reason to keep logs.'
	}: {
		rows: { label: string; record: BattleRecord }[];
		title?: string;
		description?: string;
	} = $props();
</script>

{#if rows.length > 0}
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">{title}</Card.Title>
			<Card.Description>{description}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-1.5">
			{#each rows as row (row.label)}
				{@const rate = row.record.winRate}
				<div class="flex items-center gap-3 text-sm">
					<span class="min-w-0 flex-1 truncate">{row.label}</span>
					<span class="text-muted-foreground tabular-nums">{recordLabel(row.record)}</span>
					<span
						class={cn(
							'w-10 text-right tabular-nums',
							rate !== null && rate < 0.4 && 'text-destructive',
							rate !== null && rate >= 0.6 && 'text-emerald-600 dark:text-emerald-400'
						)}
					>
						{rate === null ? '—' : `${Math.round(rate * 100)}%`}
					</span>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
{/if}
