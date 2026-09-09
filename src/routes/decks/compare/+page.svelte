<script lang="ts">
	/**
	 * Two decks side by side — the "I have two versions of this archetype, what is
	 * actually different?" screen. Which decks are being compared lives in the URL
	 * (`?a=…&b=…`) so a comparison can be bookmarked or sent to someone.
	 *
	 * The maths is all in tcg/deck-diff.ts; this file only draws it.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CardImage from '$lib/components/CardImage.svelte';
	import CardDetailSheet from '$lib/components/CardDetailSheet.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import Copy from '@lucide/svelte/icons/copy';
	import GitCompare from '@lucide/svelte/icons/git-compare';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import { folderPath } from '$lib/data/folders';
	import { store } from '$lib/store.svelte';
	import { buildBuylist } from '$lib/tcg/buylist';
	import { diffDecks, diffToText, type DiffStatus } from '$lib/tcg/deck-diff';
	import type { DeckEntry } from '$lib/tcg/legality';
	import { SUPERTYPE_COLOR } from '$lib/components/appearance-classes';
	import { cn } from '$lib/utils';
	import type { Card as CardType } from '$lib/types';

	let { data } = $props();

	/** Every deck as a pickable option, deepest folder path spelled out to tell copies apart. */
	const options = $derived(
		store.decks
			.map((deck) => ({
				id: deck.id,
				name: deck.name,
				folder: folderPath(store.folders, deck.folderId)
					.map((folder) => folder.name)
					.join(' › '),
				updatedAt: deck.updatedAt
			}))
			.sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))
	);

	/** An id in the URL that no longer names a deck (a stale bookmark) counts as unpicked. */
	const pick = (side: 'a' | 'b') => {
		const id = page.url.searchParams.get(side) ?? '';
		return store.deck(id) ? id : '';
	};
	const idA = $derived(pick('a'));
	const idB = $derived(pick('b'));
	const deckA = $derived(idA ? store.deck(idA) : undefined);
	const deckB = $derived(idB ? store.deck(idB) : undefined);

	/** Both sides at once, because swapping has to move them together. */
	function select(a: string, b: string) {
		const params = new URLSearchParams(page.url.searchParams);
		for (const [side, id] of [['a', a], ['b', b]] as const) {
			if (id) params.set(side, id);
			else params.delete(side);
		}
		goto(`${base}/decks/compare/?${params}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	const choose = (side: 'a' | 'b', id: string) =>
		side === 'a' ? select(id, idB) : select(idA, id);
	const swap = () => select(idB, idA);

	/** Deck rows joined to the catalogue. Cards this browser's catalogue lacks are skipped. */
	const entriesOf = (deckId: string | undefined): DeckEntry[] => {
		const deck = deckId ? store.deck(deckId) : undefined;
		if (!deck) return [];
		return deck.cards.flatMap((row) => {
			const card = data.catalogue.byId.get(row.cardId);
			return card ? [{ card, quantity: row.quantity }] : [];
		});
	};

	const diff = $derived(diffDecks(entriesOf(idA), entriesOf(idB)));
	const ready = $derived(Boolean(deckA && deckB));

	/** The copies coming in that the user does not already own — the cost of switching. */
	const toBuy = $derived(
		buildBuylist(
			diff.rows
				.filter((row) => row.delta > 0)
				.map((row) => ({ card: row.card, quantity: row.delta })),
			store.collection.flatMap((entry) => {
				const card = data.catalogue.byId.get(entry.cardId);
				return card ? [{ name: card.name, quantity: entry.quantity }] : [];
			})
		)
	);

	let differencesOnly = $state(true);

	/** Reprint swaps count as a difference here: the counts match but the cards do not. */
	const shown = $derived(
		differencesOnly
			? diff.rows.filter((row) => row.status !== 'same' || row.reprintOnly)
			: diff.rows
	);

	/** How many rows the toggle is keeping out of sight. */
	const unchanged = $derived(diff.rows.length - diff.changes - diff.reprints);

	const sections = $derived(
		diff.groups
			.map((group) => ({
				...group,
				rows: shown.filter((row) => row.supertype === group.supertype)
			}))
			.filter((group) => group.rows.length > 0)
	);

	/**
	 * How each kind of change reads. Spelled out rather than built from a colour name so
	 * Tailwind sees every class, the same reason appearance-classes.ts exists.
	 */
	const STATUS: Record<DiffStatus, { tint: string; row: string; word: string }> = {
		added: {
			tint: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
			row: 'bg-emerald-500/5',
			word: 'only in the new list'
		},
		removed: {
			tint: 'bg-red-500/15 text-red-700 dark:text-red-300',
			row: 'bg-red-500/5',
			word: 'cut'
		},
		changed: {
			tint: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
			row: 'bg-amber-500/5',
			word: 'count changed'
		},
		same: { tint: 'bg-muted text-muted-foreground', row: '', word: 'unchanged' }
	};

	const signed = (delta: number) => (delta > 0 ? `+${delta}` : String(delta));

	/** Widths of the shared / in / out bar. The three add up to the union of both lists. */
	const union = $derived(diff.shared + diff.added + diff.removed);
	const share = (value: number) => (union === 0 ? 0 : (value / union) * 100);

	let selected = $state<CardType | null>(null);
	let sheetOpen = $state(false);

	function open(card: CardType) {
		selected = card;
		sheetOpen = true;
	}

	async function copy(text: string, label: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success(`${label} copied`);
		} catch {
			toast.error('Could not copy — the browser blocked clipboard access.');
		}
	}

	const missingText = $derived(
		toBuy.rows.map((row) => `${row.missing} ${row.name}`).join('\n') + '\n'
	);
</script>

<svelte:head><title>Compare decks · Cardex</title></svelte:head>

<PageHeader
	title="Compare decks"
	subtitle={ready
		? `${deckA?.name} → ${deckB?.name}`
		: 'Pick two decks to see what is different between them'}
	backHref="{base}/decks"
>
	{#snippet actions()}
		{#if ready}
			<Button variant="outline" size="sm" onclick={() => copy(diffToText(diff), 'Changes')}>
				<Copy class="size-4" /> <span class="sr-only sm:not-sr-only">Copy changes</span>
			</Button>
		{/if}
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-4 p-4 md:p-8">
	{#if options.length < 2}
		<div class="flex flex-col items-center gap-3 py-20 text-center">
			<GitCompare class="text-muted-foreground size-8" />
			<p class="text-muted-foreground text-sm">
				Comparing needs two decks — you have {options.length}.
			</p>
			<Button href="{base}/decks">Back to decks</Button>
		</div>
	{:else}
		<!-- The two pickers, with the swap in the middle: reading a diff backwards is
		     half of what this screen is for. -->
		<div class="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
			{#each [{ side: 'a' as const, value: idA, label: 'Compare from' }, { side: 'b' as const, value: idB, label: 'Compare to' }] as picker, index (picker.side)}
				{#if index === 1}
					<Button
						variant="outline"
						size="icon"
						class="self-center"
						aria-label="Swap the two decks"
						title="Swap"
						disabled={!idA && !idB}
						onclick={swap}
					>
						<ArrowRightLeft class="size-4" />
					</Button>
				{/if}
				<div class="flex min-w-0 flex-1 flex-col gap-1.5">
					<span class="text-muted-foreground text-xs font-medium">{picker.label}</span>
					<Select.Root
						type="single"
						value={picker.value}
						onValueChange={(id) => choose(picker.side, id ?? '')}
					>
						<Select.Trigger class="w-full">
							{options.find((option) => option.id === picker.value)?.name ?? 'Choose a deck'}
						</Select.Trigger>
						<Select.Content>
							{#each options as option (option.id)}
								<Select.Item value={option.id} label={option.name}>
									<span class="truncate">{option.name}</span>
									{#if option.folder}
										<span class="text-muted-foreground text-xs">{option.folder}</span>
									{/if}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{/each}
		</div>

		{#if !ready}
			<div class="flex flex-col items-center gap-3 py-20 text-center">
				<GitCompare class="text-muted-foreground size-8" />
				<p class="text-muted-foreground max-w-sm text-sm">
					Choose a deck on each side. Cards are matched by name, so the same card from a
					different set does not count as a change.
				</p>
			</div>
		{:else}
			<Card.Root>
				<Card.Content class="flex flex-col gap-4 py-4">
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<p class="text-sm">
							<a href="{base}/decks/{idA}" class="font-medium hover:underline">{deckA?.name}</a>
							<span class="text-muted-foreground">({diff.totals.a} cards)</span>
							<span class="text-muted-foreground mx-1">→</span>
							<a href="{base}/decks/{idB}" class="font-medium hover:underline">{deckB?.name}</a>
							<span class="text-muted-foreground">({diff.totals.b} cards)</span>
						</p>
						<p class="text-muted-foreground text-xs">
							{Math.round(diff.similarity * 100)}% the same list
						</p>
					</div>

					<!-- Shared copies, copies only the new list runs, copies only the old one did. -->
					<div class="bg-muted flex h-2 overflow-hidden rounded-full" aria-hidden="true">
						<div class="bg-muted-foreground/40" style="width: {share(diff.shared)}%"></div>
						<div class="bg-emerald-500" style="width: {share(diff.added)}%"></div>
						<div class="bg-red-500" style="width: {share(diff.removed)}%"></div>
					</div>

					<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
						{#each [{ label: 'in common', value: diff.shared, dot: 'bg-muted-foreground/40' }, { label: 'copies in', value: diff.added, dot: 'bg-emerald-500' }, { label: 'copies out', value: diff.removed, dot: 'bg-red-500' }, { label: 'cards differ', value: diff.changes, dot: '' }] as stat (stat.label)}
							<div class="flex flex-col gap-0.5">
								<span class="text-2xl leading-none font-semibold tabular-nums">{stat.value}</span>
								<span class="text-muted-foreground flex items-center gap-1.5 text-xs">
									{#if stat.dot}<span class="size-2 rounded-full {stat.dot}"></span>{/if}
									{stat.label}
								</span>
							</div>
						{/each}
					</div>

					<!-- Section counts: the shape of the two builds, before the card-by-card list. -->
					<div class="grid gap-2 border-t pt-3 sm:grid-cols-3">
						{#each diff.groups as group (group.supertype)}
							<div class="flex items-center gap-2 text-sm">
								<span class="size-2 shrink-0 rounded-full {SUPERTYPE_COLOR[group.supertype]}"></span>
								<span class="min-w-0 flex-1 truncate font-medium">{group.label}</span>
								<span class="text-muted-foreground tabular-nums">{group.a} → {group.b}</span>
								{#if group.delta !== 0}
									<Badge
										variant="secondary"
										class={cn(
											'tabular-nums',
											group.delta > 0 ? STATUS.added.tint : STATUS.removed.tint
										)}
									>
										{signed(group.delta)}
									</Badge>
								{/if}
							</div>
						{/each}
					</div>

					{#if diff.reprints > 0}
						<p class="text-muted-foreground border-t pt-3 text-xs">
							<RefreshCw class="mr-1 inline size-3" />
							{diff.reprints}
							{diff.reprints === 1 ? 'card appears' : 'cards appear'} in both lists in the same
							count but from a different set — same card to play, different regulation mark to
							check.
						</p>
					{/if}
				</Card.Content>
			</Card.Root>

			{#if toBuy.totalMissing > 0}
				<Card.Root class="border-amber-500/40">
					<Card.Content class="flex flex-wrap items-center gap-3 py-4">
						<ShoppingCart class="text-muted-foreground size-4 shrink-0" />
						<p class="min-w-0 flex-1 text-sm">
							Switching to “{deckB?.name}” needs
							<span class="font-medium">
								{toBuy.totalMissing} card{toBuy.totalMissing === 1 ? '' : 's'}
							</span>
							you do not own: {toBuy.rows.map((row) => `${row.missing}× ${row.name}`).join(', ')}
						</p>
						<Button variant="outline" size="sm" onclick={() => copy(missingText, 'Missing cards')}>
							<Copy class="size-4" /> Copy
						</Button>
					</Card.Content>
				</Card.Root>
			{/if}

			<label class="flex items-center justify-end gap-2 text-sm">
				<span class="text-muted-foreground">
					Differences only
					{#if differencesOnly && unchanged > 0}
						<span class="tabular-nums">({unchanged} unchanged hidden)</span>
					{/if}
				</span>
				<Switch checked={differencesOnly} onCheckedChange={(checked) => (differencesOnly = checked)} />
			</label>

			{#if sections.length === 0}
				<p class="text-muted-foreground py-16 text-center text-sm">
					{diff.rows.length === 0
						? 'Both decks are empty.'
						: 'These two lists are card-for-card identical.'}
				</p>
			{:else}
				{#each sections as section (section.supertype)}
					<div class="flex flex-col gap-1.5">
						<div class="flex items-center gap-2 px-1.5">
							<span
								class="size-2 shrink-0 rounded-full {SUPERTYPE_COLOR[section.supertype]}"
							></span>
							<h2 class="text-sm font-medium">{section.label}</h2>
							<span class="text-muted-foreground text-xs tabular-nums">
								{section.a} → {section.b}
							</span>
						</div>

						{#each section.rows as row (row.nameNormalized)}
							<div
								animate:flip={{ duration: 200 }}
								in:fly|global={{ y: 6, duration: 160 }}
								class={cn(
									'hover:bg-accent/50 flex items-center gap-3 rounded-lg p-1.5 transition-colors',
									STATUS[row.status].row
								)}
							>
								<button
									type="button"
									onclick={() => open(row.card)}
									aria-label="Details for {row.name}"
									class={cn('shrink-0', row.status === 'removed' && 'opacity-60 grayscale')}
								>
									<CardImage card={row.card} class="h-11 w-8 rounded" />
								</button>

								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">{row.name}</p>
									<p class="text-muted-foreground truncate text-xs">
										{#if row.reprintOnly}
											{row.printings.a
												.map((card) => `${card.set.ptcglCode ?? card.set.id} #${card.localId}`)
												.join(', ')}
											→
											{row.printings.b
												.map((card) => `${card.set.ptcglCode ?? card.set.id} #${card.localId}`)
												.join(', ')}
										{:else}
											{row.card.set.ptcglCode ?? row.card.set.id} · #{row.card.localId}
										{/if}
									</p>
								</div>

								<!-- The counts on both sides, then what changed between them. -->
								<span
									class="text-muted-foreground shrink-0 text-sm tabular-nums"
									title="{row.a} in “{deckA?.name}”, {row.b} in “{deckB?.name}”"
								>
									{row.a} → {row.b}
								</span>

								{#if row.delta !== 0}
									<Badge
										variant="secondary"
										class={cn('shrink-0 tabular-nums', STATUS[row.status].tint)}
										title={STATUS[row.status].word}
									>
										{signed(row.delta)}
									</Badge>
								{:else if row.reprintOnly}
									<Badge variant="outline" class="shrink-0 gap-1" title="Same card, different set">
										<RefreshCw class="size-3" /> reprint
									</Badge>
								{:else}
									<Badge variant="outline" class="text-muted-foreground shrink-0" title="Unchanged">
										=
									</Badge>
								{/if}
							</div>
						{/each}
					</div>
				{/each}
			{/if}
		{/if}
	{/if}
</div>

<CardDetailSheet bind:card={selected} bind:open={sheetOpen} />
