<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CardSearchPanel from '$lib/components/CardSearchPanel.svelte';
	import FolderPicker from '$lib/components/FolderPicker.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import * as Tabs from '$lib/components/ui/tabs';
	import { toast } from 'svelte-sonner';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import Copy from '@lucide/svelte/icons/copy';
	import Download from '@lucide/svelte/icons/download';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Check from '@lucide/svelte/icons/check';
	import Heart from '@lucide/svelte/icons/heart';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import List from '@lucide/svelte/icons/list';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import CardImage from '$lib/components/CardImage.svelte';
	import CardTile from '$lib/components/CardTile.svelte';
	import CardDetailSheet from '$lib/components/CardDetailSheet.svelte';
	import ResolveMissing, { wantMissing } from '$lib/components/ResolveMissing.svelte';
	import { folderPath } from '$lib/data/folders';
	import { prefs, DECK_VIEW_LABELS, type DeckView } from '$lib/prefs.svelte';
	import { store } from '$lib/store.svelte';
	import { parseRules } from '$lib/tcg/format-rules';
	import { checkLegality, type DeckEntry } from '$lib/tcg/legality';
	import { buildBuylist } from '$lib/tcg/buylist';
	import { toPtcglText, toAiEntries, AI_PREAMBLE } from '$lib/tcg/exporter';
	import { cn } from '$lib/utils';
	import type { Card as CardType } from '$lib/types';

	let { data } = $props();

	const deckId = $derived(page.params.id!);
	const deck = $derived(store.deck(deckId));

	/** Deck rows joined to the catalogue, in the order players expect. */
	const entries = $derived.by((): DeckEntry[] => {
		if (!deck) return [];
		const order = { Pokemon: 0, Trainer: 1, Energy: 2 };
		return deck.cards
			.flatMap((row) => {
				const card = data.catalogue.byId.get(row.cardId);
				return card ? [{ card, quantity: row.quantity }] : [];
			})
			.sort(
				(a, b) =>
					order[a.card.supertype] - order[b.card.supertype] ||
					a.card.name.localeCompare(b.card.name)
			);
	});

	const total = $derived(entries.reduce((sum, entry) => sum + entry.quantity, 0));

	const format = $derived(deck?.formatId ? store.format(deck.formatId) : null);
	const path = $derived(
		deck ? folderPath(store.folders, deck.folderId).map((folder) => folder.name) : []
	);
	const backHref = $derived(
		deck?.folderId ? `${base}/decks/?folder=${deck.folderId}` : `${base}/decks`
	);

	const report = $derived.by(() => {
		if (!format) return null;
		const poolIds = new Set(format.pool.map((card) => card.cardId));
		return checkLegality(entries, parseRules(format.rules), poolIds);
	});

	/** Copies owned per card name, any printing or finish — how deck requirements count. */
	const ownedByName = $derived.by(() => {
		const totals = new Map<string, number>();
		for (const row of store.collection) {
			const card = data.catalogue.byId.get(row.cardId);
			if (card) totals.set(card.nameNormalized, (totals.get(card.nameNormalized) ?? 0) + row.quantity);
		}
		return totals;
	});

	/** What you would still have to buy to sleeve this deck up. */
	const buylist = $derived(
		buildBuylist(
			entries,
			store.collection.flatMap((entry) => {
				const card = data.catalogue.byId.get(entry.cardId);
				return card ? [{ name: card.name, quantity: entry.quantity }] : [];
			})
		)
	);

	const ptcglText = $derived(toPtcglText(entries));
	const missingText = $derived(
		toPtcglText(buylist.rows.map((row) => ({ quantity: row.missing, card: row.suggestion })))
	);
	const aiPayload = $derived(
		`${AI_PREAMBLE}\n${JSON.stringify(
			{ deck: deck?.name, format: format?.name ?? null, cards: toAiEntries(entries) },
			null,
			2
		)}`
	);

	function adjust(cardId: string, delta: number) {
		if (!deck) return;
		const current = deck.cards.find((row) => row.cardId === cardId)?.quantity ?? 0;
		store.setDeckQuantity(deckId, cardId, current + delta);
	}

	const add = (card: CardType) => adjust(card.id, 1);

	const VIEW_ICONS: Record<DeckView, typeof List> = { list: List, grid: LayoutGrid };

	let selected = $state<CardType | null>(null);
	let sheetOpen = $state(false);

	/** The card sheet is the long way to fix a shortfall: any finish, any lot, wants too. */
	function open(card: CardType) {
		selected = card;
		sheetOpen = true;
	}

	/** The whole buylist onto the wants list in one go, skipping what is already on it. */
	function wantEverythingMissing() {
		try {
			const added = buylist.rows.filter((row) => wantMissing(row.suggestion, row.missing)).length;
			if (added === 0) toast.info('Everything missing is already on your wants list');
			else toast.success(`${added} card${added === 1 ? '' : 's'} added to your wants list`);
		} catch (error) {
			toast.error((error as Error).message);
		}
	}

	async function copy(text: string, label: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success(`${label} copied`);
		} catch {
			toast.error('Could not copy — the browser blocked clipboard access.');
		}
	}
</script>

<svelte:head><title>{deck?.name ?? 'Deck'} · Cardex</title></svelte:head>

{#if !deck}
	<div class="flex flex-col items-center gap-3 py-24 text-center">
		<p class="text-muted-foreground text-sm">This deck does not exist in this browser.</p>
		<Button href="{base}/decks">Back to decks</Button>
	</div>
{:else}
	<PageHeader
		title={deck.name}
		subtitle={[`${total} cards`, format?.name, path.length ? path.join(' › ') : null]
			.filter(Boolean)
			.join(' · ')}
		{backHref}
	>
		{#snippet actions()}
			<!-- Labels drop away on a phone: four full ones leave the deck name a single letter. -->
			<Button variant="outline" size="sm" onclick={() => copy(ptcglText, 'Decklist')}>
				<Copy class="size-4" /> <span class="sr-only sm:not-sr-only">Copy list</span>
			</Button>
			<Button variant="outline" size="sm" onclick={() => copy(aiPayload, 'AI export')}>
				<Sparkles class="size-4" /> <span class="sr-only sm:not-sr-only">Copy for AI</span>
			</Button>
			<!-- Import arrives pointed at this deck, ready to replace its list with a paste. -->
			<Button
				href="{base}/import?target=existing&deck={deckId}"
				variant="outline"
				size="sm"
				aria-label="Import a decklist into this deck"
			>
				<Download class="size-4" /> <span class="sr-only sm:not-sr-only">Import list</span>
			</Button>
		{/snippet}
	</PageHeader>

	<div class="grid gap-6 p-4 md:p-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
		<div class="flex min-w-0 flex-col gap-4">
			<div class="flex flex-wrap items-center gap-2">
				<Input
					value={deck.name}
					class="h-9 max-w-64"
					aria-label="Deck name"
					onchange={(event) => store.updateDeck(deckId, { name: event.currentTarget.value })}
				/>

				<Select.Root
					type="single"
					value={deck.formatId ?? ''}
					onValueChange={(value) => store.updateDeck(deckId, { formatId: value || null })}
				>
					<Select.Trigger class="h-9 w-44">{format?.name ?? 'No format'}</Select.Trigger>
					<Select.Content>
						<Select.Item value="">No format</Select.Item>
						{#each store.formats as option (option.id)}
							<Select.Item value={option.id}>{option.name}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>

				<FolderPicker
					value={deck.folderId ?? ''}
					folders={store.folders}
					rootLabel="Decks"
					class="w-44"
					onchange={(value) => store.moveDeck(deckId, value || null)}
				/>

				{#if report}
					{#if report.legal}
						<Badge class="gap-1"><Check class="size-3" /> Legal</Badge>
					{:else}
						<Badge variant="destructive" class="gap-1">
							<TriangleAlert class="size-3" />
							{report.issues.length} issue{report.issues.length === 1 ? '' : 's'}
						</Badge>
					{/if}
				{/if}
			</div>

			{#if report && !report.legal}
				<Card.Root class="border-destructive/40">
					<Card.Content class="flex flex-col gap-1 py-4 text-sm">
						{#each report.issues as issue (issue.message)}
							<p class="text-muted-foreground">{issue.message}</p>
						{/each}
					</Card.Content>
				</Card.Root>
			{/if}

			<Tabs.Root value="list">
				<Tabs.List>
					<Tabs.Trigger value="list">Decklist</Tabs.Trigger>
					<Tabs.Trigger value="buylist">
						Missing
						{#if buylist.totalMissing > 0}
							<Badge variant="secondary" class="ml-1.5">{buylist.totalMissing}</Badge>
						{/if}
					</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="list" class="flex flex-col gap-1.5 pt-3">
					{#if entries.length === 0}
						<p class="text-muted-foreground py-12 text-center text-sm">
							Empty deck — search under “Add cards” to fill it.
						</p>
					{:else}
						<div class="flex flex-wrap items-center gap-2 px-1.5">
							<p class="text-muted-foreground text-xs">
								{Math.round(buylist.coverage * 100)}% owned · counts show owned / needed, any printing
							</p>

							<!-- Segmented view switch; the choice sticks to this browser. -->
							<div class="bg-muted ml-auto flex gap-0.5 rounded-lg p-0.5">
								{#each Object.entries(DECK_VIEW_LABELS) as [value, label] (value)}
									{@const Icon = VIEW_ICONS[value as DeckView]}
									{@const active = prefs.deckView === value}
									<button
										type="button"
										onclick={() => (prefs.deckView = value as DeckView)}
										aria-pressed={active}
										title="{label} view"
										class={cn(
											'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
											active
												? 'bg-background text-foreground shadow-sm'
												: 'text-muted-foreground hover:text-foreground'
										)}
									>
										<Icon class="size-4" />
										<span class="max-sm:sr-only">{label}</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}

					{#if prefs.deckView === 'grid'}
						<!-- Binder view: the art, with the deck's counter and the shortfall drawn on the
						     card they belong to. The lift sits on the wrapper so the badges rise with it. -->
						<div
							class="grid grid-cols-3 gap-3 pt-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5"
						>
							{#each entries as entry, index (entry.card.id)}
								{@const owned = ownedByName.get(entry.card.nameNormalized) ?? 0}
								{@const missing = Math.max(0, entry.quantity - owned)}
								<div
									animate:flip={{ duration: 200 }}
									in:fly|global={{ y: 8, duration: 200, delay: Math.min(index, 20) * 12 }}
									class="relative transition-transform duration-200 hover:-translate-y-1"
								>
									<CardTile card={entry.card} />

									<!-- The art opens the card sheet: every finish, every lot, wants and trades —
									     the long way round for anything the two quick actions do not cover. -->
									<button
										type="button"
										onclick={() => open(entry.card)}
										aria-label="Details for {entry.card.name}"
										class="focus-visible:ring-ring absolute inset-x-0 top-0 aspect-[63/88] rounded-xl outline-none focus-visible:ring-2"
									></button>

									{#if missing > 0}
										<span
											class="ring-destructive/70 pointer-events-none absolute inset-x-0 top-0 aspect-[63/88] rounded-xl ring-2"
										></span>
										<ResolveMissing
											card={entry.card}
											{missing}
											compact
											ondetails={() => open(entry.card)}
											class="absolute top-1.5 left-1.5"
										/>
									{/if}

									<!-- Deck counter over the foot of the art, so the grid still edits the deck. -->
									<div
										class="bg-background/85 absolute inset-x-1.5 bottom-11 flex items-center justify-between rounded-full p-0.5 shadow-sm backdrop-blur"
									>
										<Button
											variant="ghost"
											size="icon"
											class="size-6 rounded-full"
											aria-label="Remove one {entry.card.name}"
											onclick={() => adjust(entry.card.id, -1)}
										>
											<Minus class="size-3" />
										</Button>
										<span
											class={cn(
												'text-xs font-semibold tabular-nums',
												missing > 0 && 'text-destructive'
											)}
											title="{Math.min(owned, entry.quantity)} owned of {entry.quantity} needed"
										>
											{Math.min(owned, entry.quantity)}/{entry.quantity}
										</span>
										<Button
											variant="ghost"
											size="icon"
											class="size-6 rounded-full"
											aria-label="Add one {entry.card.name}"
											onclick={() => adjust(entry.card.id, 1)}
										>
											<Plus class="size-3" />
										</Button>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						{#each entries as entry (entry.card.id)}
							{@const owned = ownedByName.get(entry.card.nameNormalized) ?? 0}
							{@const missing = Math.max(0, entry.quantity - owned)}
							<div
								animate:flip={{ duration: 200 }}
								in:fly|global={{ y: 6, duration: 160 }}
								class={cn(
									'hover:bg-accent/50 flex items-center gap-3 rounded-lg p-1.5 transition-colors',
									missing > 0 && 'bg-destructive/5'
								)}
							>
								<button
									type="button"
									onclick={() => open(entry.card)}
									aria-label="Details for {entry.card.name}"
									class="shrink-0"
								>
									<CardImage card={entry.card} class="h-11 w-8 rounded" />
								</button>

								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">{entry.card.name}</p>
									<p class="text-muted-foreground truncate text-xs">
										{entry.card.set.ptcglCode ?? entry.card.set.id} · #{entry.card.localId}
									</p>
								</div>

								{#if missing > 0}
									<ResolveMissing card={entry.card} {missing} ondetails={() => open(entry.card)} />
								{:else}
									<Badge variant="outline" class="shrink-0 tabular-nums" title="You own enough">
										{entry.quantity}/{entry.quantity}
									</Badge>
								{/if}

								<div class="flex items-center gap-1">
									<Button
										variant="outline"
										size="icon"
										class="size-7"
										aria-label="Remove one"
										onclick={() => adjust(entry.card.id, -1)}
									>
										<Minus class="size-3" />
									</Button>
									<span class="w-6 text-center text-sm font-semibold tabular-nums">
										{entry.quantity}
									</span>
									<Button
										variant="outline"
										size="icon"
										class="size-7"
										aria-label="Add one"
										onclick={() => adjust(entry.card.id, 1)}
									>
										<Plus class="size-3" />
									</Button>
								</div>
							</div>
						{/each}
					{/if}
				</Tabs.Content>

				<Tabs.Content value="buylist" class="pt-3">
					{#if buylist.rows.length === 0}
						<p class="text-muted-foreground py-12 text-center text-sm">
							{entries.length === 0
								? 'Add some cards first.'
								: 'You already own every card in this deck.'}
						</p>
					{:else}
						<div class="flex flex-col gap-2">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<p class="text-muted-foreground text-sm">
									{buylist.totalMissing} card{buylist.totalMissing === 1 ? '' : 's'} to buy ·
									{Math.round(buylist.coverage * 100)}% of the deck already owned
								</p>
								<div class="flex flex-wrap gap-2">
									<Button variant="outline" size="sm" onclick={wantEverythingMissing}>
										<Heart class="size-4" /> Add all to wants
									</Button>
									<Button variant="outline" size="sm" onclick={() => copy(missingText, 'Missing cards')}>
										<Copy class="size-4" /> Copy missing as list
									</Button>
								</div>
							</div>
							{#each buylist.rows as row (row.name)}
								<div class="flex items-center gap-3 rounded-lg border p-2">
									<ShoppingCart class="text-muted-foreground size-4 shrink-0" />
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium">{row.name}</p>
										<p class="text-muted-foreground text-xs">
											need {row.needed} · own {row.owned} · e.g.
											{row.suggestion.set.ptcglCode ?? row.suggestion.set.id} #{row.suggestion
												.localId}
										</p>
									</div>
									<ResolveMissing
										card={row.suggestion}
										missing={row.missing}
										ondetails={() => open(row.suggestion)}
									/>
								</div>
							{/each}
						</div>
					{/if}
				</Tabs.Content>
			</Tabs.Root>
		</div>

		<!-- Below lg the search panel comes first: on a phone the list can run to sixty rows,
		     and nobody should scroll past all of them to add a card. -->
		<aside class="order-first lg:order-none lg:sticky lg:top-24 lg:h-[calc(100svh-8rem)]">
			<Card.Root class="flex h-full flex-col">
				<Card.Header>
					<Card.Title class="text-base">Add cards</Card.Title>
				</Card.Header>
				<Card.Content class="flex min-h-0 flex-1 flex-col">
					<CardSearchPanel catalogue={data.catalogue} onadd={add} />
				</Card.Content>
			</Card.Root>
		</aside>
	</div>
{/if}

<CardDetailSheet bind:card={selected} bind:open={sheetOpen} />
