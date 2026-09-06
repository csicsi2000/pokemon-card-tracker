<script lang="ts">
	/**
	 * Add cards the way they are printed: "MEG 21", "3 PAL 188 rh". One line previews the
	 * card and Enter adds it; pasting several lines switches to a review list with one
	 * "Add all" button. The parent decides where the cards go (collection, lot, deck).
	 */
	import { Textarea } from '$lib/components/ui/textarea';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import Plus from '@lucide/svelte/icons/plus';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Zap from '@lucide/svelte/icons/zap';
	import CardImage from './CardImage.svelte';
	import type { Catalogue } from '$lib/catalogue';
	import {
		parseQuickAdd,
		parseQuickAddLine,
		quickAddCode,
		resolveQuickAdd,
		resolveQuickAddAll
	} from '$lib/tcg/quick-add';
	import { VARIANT_LABELS, type Card, type CardSet, type CardVariant } from '$lib/types';
	import { cn } from '$lib/utils';

	let {
		catalogue,
		onadd,
		defaultSet = null,
		placeholder,
		class: className
	}: {
		catalogue: Catalogue;
		onadd: (card: Card, quantity: number, variant: CardVariant | null) => void;
		/** Pin a set: lines then need only the collector number ("21", "3 188 rh"). */
		defaultSet?: CardSet | null;
		placeholder?: string;
		class?: string;
	} = $props();

	let text = $state('');

	const options = $derived({ defaultSetCode: defaultSet ? quickAddCode(defaultSet) : null });
	const hint = $derived(
		placeholder ??
			(defaultSet
				? `Quick add: 21, or 3 188 rh — ${quickAddCode(defaultSet)} is pinned`
				: 'Quick add: MEG 21, or 3 PAL 188 rh — paste a list for many')
	);

	const multiline = $derived(text.includes('\n'));
	const single = $derived(!multiline && text.trim() ? parseQuickAddLine(text, 1, options) : null);
	const preview = $derived(single ? resolveQuickAdd(catalogue, single) : null);
	const batch = $derived(multiline ? parseQuickAdd(text, options) : null);
	const rows = $derived(batch ? resolveQuickAddAll(catalogue, batch.entries) : []);
	const addable = $derived(rows.filter((row) => row.card));
	const total = $derived(addable.reduce((sum, row) => sum + row.entry.quantity, 0));

	function addSingle() {
		if (!preview?.card) return;
		onadd(preview.card, preview.entry.quantity, preview.entry.variant);
		text = '';
	}

	function addAll() {
		for (const row of addable) onadd(row.card!, row.entry.quantity, row.entry.variant);
		text = '';
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.shiftKey) return;
		if (multiline) return; // Enter inside a pasted list is just a newline
		event.preventDefault();
		addSingle();
	}

	const label = (card: Card) => `${card.set.ptcglCode ?? card.set.id} · #${card.localId}`;
</script>

<div class={cn('flex flex-col gap-2', className)}>
	<div class="relative">
		<Zap
			class="text-muted-foreground pointer-events-none absolute top-2.5 left-3 size-4"
			aria-hidden="true"
		/>
		<Textarea
			bind:value={text}
			{onkeydown}
			rows={multiline ? 5 : 1}
			placeholder={hint}
			aria-label="Quick add by set code and number"
			class="min-h-9 resize-none pl-9 font-mono text-sm"
			spellcheck={false}
		/>
	</div>

	{#if single && preview}
		<div class="flex items-center gap-3 rounded-lg border p-2">
			{#if preview.card}
				<CardImage card={preview.card} class="h-12 w-9 shrink-0 rounded" />
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium">{preview.card.name}</p>
					<p class="text-muted-foreground truncate text-xs">
						{preview.card.set.name} · #{preview.card.localId}
						{#if preview.entry.variant}· {VARIANT_LABELS[preview.entry.variant]}{/if}
					</p>
				</div>
				<Badge variant="secondary">{preview.entry.quantity}×</Badge>
				<Button size="sm" onclick={addSingle}><Plus class="size-4" /> Add</Button>
			{:else}
				<TriangleAlert class="text-destructive size-4 shrink-0" />
				<p class="text-muted-foreground text-sm">{preview.note}</p>
			{/if}
		</div>
	{:else if text.trim() && !multiline}
		<p class="text-muted-foreground px-1 text-xs">
			{#if defaultSet}
				Type a collector number, like <span class="font-mono">21</span> — or a set code and
				number to add from another set.
			{:else}
				Type a set code and number, like <span class="font-mono">MEG 21</span>.
			{/if}
		</p>
	{/if}

	{#if batch}
		<div class="flex flex-col gap-2 rounded-lg border p-2">
			{#each batch.warnings as warning (warning)}
				<p class="flex items-start gap-2 text-xs">
					<TriangleAlert class="text-destructive mt-0.5 size-3.5 shrink-0" />
					{warning}
				</p>
			{/each}

			<div class="flex max-h-64 flex-col divide-y overflow-y-auto">
				{#each rows as row (row.entry.lineNumber)}
					<div class="flex items-center gap-3 py-1.5">
						{#if row.card}
							<CardImage card={row.card} class="h-10 w-7 shrink-0 rounded" />
						{:else}
							<div class="bg-muted h-10 w-7 shrink-0 rounded"></div>
						{/if}
						<span class="w-7 shrink-0 text-xs font-semibold tabular-nums">
							{row.entry.quantity}×
						</span>
						<div class="min-w-0 flex-1">
							{#if row.card}
								<p class="truncate text-sm">{row.card.name}</p>
								<p class="text-muted-foreground truncate text-xs">
									{label(row.card)}
									{#if row.entry.variant}· {VARIANT_LABELS[row.entry.variant]}{/if}
								</p>
							{:else}
								<p class="truncate text-sm">{row.entry.raw}</p>
								<p class="text-destructive truncate text-xs">{row.note}</p>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			<div class="flex items-center justify-between gap-2">
				<span class="text-muted-foreground text-xs">
					{addable.length} of {rows.length} lines matched
				</span>
				<div class="flex gap-2">
					<Button variant="ghost" size="sm" onclick={() => (text = '')}>Clear</Button>
					<Button size="sm" disabled={total === 0} onclick={addAll}>
						<Plus class="size-4" /> Add {total} card{total === 1 ? '' : 's'}
					</Button>
				</div>
			</div>
		</div>
	{/if}
</div>
