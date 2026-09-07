<script lang="ts">
	/**
	 * Add cards the way they are printed: "MEG 21", "3 PAL 188 rh". A line that is not a
	 * set code and number is read as a card name instead, and the printings it matches are
	 * listed to pick from — so a card whose set code you cannot see still goes in. One line
	 * previews the card and Enter adds it; pasting several lines switches to a review list
	 * with one "Add all" button. The parent decides where the cards go (collection, lot, deck).
	 *
	 * The field and whatever `controls` the parent passes (a set or finish picker) share one
	 * row inside this component, and every preview or result list renders under that row at
	 * full width. Laying it out here is what keeps the field level with those pickers: when
	 * the parent owned the row, a preview grew the quick-add column and shunted the field
	 * off the pickers' line.
	 */
	import { Textarea } from '$lib/components/ui/textarea';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Label } from '$lib/components/ui/label';
	import Plus from '@lucide/svelte/icons/plus';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Zap from '@lucide/svelte/icons/zap';
	import CardImage from './CardImage.svelte';
	import { searchCards, type Catalogue } from '$lib/catalogue';
	import { normalizeName } from '$lib/tcg/normalize';
	import {
		parseQuickAdd,
		parseQuickAddLine,
		quickAddCode,
		resolveQuickAdd,
		resolveQuickAddAll
	} from '$lib/tcg/quick-add';
	import { VARIANT_LABELS, type Card, type CardSet, type CardVariant } from '$lib/types';
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';

	let {
		catalogue,
		onadd,
		defaultSet = null,
		placeholder,
		label,
		controls,
		class: className
	}: {
		catalogue: Catalogue;
		onadd: (card: Card, quantity: number, variant: CardVariant | null) => void;
		/** Pin a set: lines then need only the collector number ("21", "3 188 rh"). */
		defaultSet?: CardSet | null;
		placeholder?: string;
		/** Field label. Shown above the box, on the pickers' label line. */
		label?: string;
		/** Pickers to sit beside the field. Use `sm:contents` to unwrap them on a wide screen. */
		controls?: Snippet;
		class?: string;
	} = $props();

	const fieldId = $props.id();

	let text = $state('');

	const options = $derived({ defaultSetCode: defaultSet ? quickAddCode(defaultSet) : null });
	// Short enough to fit a phone on one line: the set picker beside the box already says
	// which set is pinned, and the box is one line tall, so an overflowing hint is cut off.
	const hint = $derived(
		placeholder ??
			(defaultSet
				? '21, 3 188 rh, or a card name'
				: 'MEG 21, a card name, or a list')
	);

	const multiline = $derived(text.includes('\n'));
	const single = $derived(!multiline && text.trim() ? parseQuickAddLine(text, 1, options) : null);
	const preview = $derived(single ? resolveQuickAdd(catalogue, single) : null);
	const batch = $derived(multiline ? parseQuickAdd(text, options) : null);
	const rows = $derived(batch ? resolveQuickAddAll(catalogue, batch.entries) : []);
	const addable = $derived(rows.filter((row) => row.card));
	const total = $derived(addable.reduce((sum, row) => sum + row.entry.quantity, 0));

	/**
	 * A leading or trailing count in front of a name, the same way a quick-add line carries
	 * one: "3 Charizard ex", "Iono x2". The rest is the name to search for.
	 */
	function parseNameLine(line: string): { quantity: number; name: string } | null {
		const match = line.trim().match(/^(?:(\d+)\s*[x×]?\s+)?(.*?)(?:\s*[x×]\s*(\d+))?$/);
		if (!match) return null;

		const name = match[2].trim();
		if (!name) return null;

		const quantity = Number(match[3] ?? match[1] ?? 1);
		if (!Number.isFinite(quantity) || quantity < 1) return null;

		return { quantity, name };
	}

	// Only a line the code-and-number grammar could not turn into a real printing is a name
	// — a resolved "MEG 21" is never searched for, but "MEG 999" falls through to the name
	// search along with its note, since a typo and a name look the same from here.
	const named = $derived(multiline || preview?.card ? null : parseNameLine(text));

	/**
	 * Name matches, best first: the pinned set before the rest (a stack that is all one set
	 * is the reason to pin one), and the card actually called that before the cards whose
	 * name merely contains it — "Iono" ahead of "Iono's Bellibolt ex".
	 */
	const matches = $derived.by(() => {
		if (!named) return [];
		const needle = normalizeName(named.name);
		const rank = (card: Card) =>
			(card.set.id === defaultSet?.id ? 0 : 2) + (card.nameNormalized === needle ? 0 : 1);
		return searchCards(catalogue, { query: named.name }, 200)
			.sort((a, b) => rank(a) - rank(b))
			.slice(0, 24);
	});

	function addSingle() {
		if (!preview?.card) return;
		onadd(preview.card, preview.entry.quantity, preview.entry.variant);
		text = '';
	}

	function addAll() {
		for (const row of addable) onadd(row.card!, row.entry.quantity, row.entry.variant);
		text = '';
	}

	/** A name match has no finish marker of its own; the parent's default decides. */
	function addMatch(card: Card) {
		onadd(card, named?.quantity ?? 1, null);
		text = '';
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.shiftKey) return;
		if (multiline) return; // Enter inside a pasted list is just a newline
		event.preventDefault();
		if (preview?.card) addSingle();
		else if (matches.length) addMatch(matches[0]);
	}

	const codeLabel = (card: Card) => `${card.set.ptcglCode ?? card.set.id} · #${card.localId}`;
</script>

<div class={cn('flex flex-col gap-2', className)}>
	<div class="flex flex-wrap items-end gap-3">
		<div class="flex min-w-64 flex-1 flex-col gap-2">
			{#if label}<Label for={fieldId}>{label}</Label>{/if}
			<div class="relative">
				<Zap
					class="text-muted-foreground pointer-events-none absolute top-2.5 left-3 size-4"
					aria-hidden="true"
				/>
				<Textarea
					id={fieldId}
					bind:value={text}
					{onkeydown}
					rows={multiline ? 5 : 1}
					placeholder={hint}
					aria-label={label ?? 'Quick add by set code, number or card name'}
					class={cn(
						'min-h-9 resize-none pl-9 font-mono text-sm',
						// One line sits in a row with 36px inputs and pickers, so it takes their exact
						// height and pill shape; a pasted list grows into a regular rounded box.
						multiline ? 'rounded-xl py-3' : 'h-9 rounded-4xl py-[7px]'
					)}
					spellcheck={false}
				/>
			</div>
		</div>
		{@render controls?.()}
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
	{/if}

	{#if named && matches.length}
		<div class="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-lg border p-1.5">
			{#each matches as card, index (card.id)}
				<button
					type="button"
					class={cn(
						'flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors',
						index === 0
							? 'border-primary/40 bg-primary/5 hover:bg-primary/10 border'
							: 'hover:bg-accent'
					)}
					onclick={() => addMatch(card)}
				>
					<CardImage {card} class="h-12 w-9 shrink-0 rounded" />
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">{card.name}</p>
						<p class="text-muted-foreground truncate text-xs">
							{card.set.name} · #{card.localId}
						</p>
					</div>
					{#if named.quantity > 1}
						<Badge variant="secondary" class="shrink-0">{named.quantity}×</Badge>
					{/if}
					{#if index === 0}
						<Badge variant="outline" class="shrink-0 text-[10px]">Enter</Badge>
					{/if}
					<Plus class="text-muted-foreground size-4 shrink-0" />
				</button>
			{/each}
		</div>
	{:else if named && !preview}
		<p class="text-muted-foreground px-1 text-xs">
			No card named “{named.name}”. Or type a set code and number, like
			{#if defaultSet}
				<span class="font-mono">21</span> — <span class="font-mono">{quickAddCode(defaultSet)}</span>
				is pinned.
			{:else}
				<span class="font-mono">MEG 21</span>.
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
									{codeLabel(row.card)}
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
