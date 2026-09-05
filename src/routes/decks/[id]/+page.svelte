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
	import Check from '@lucide/svelte/icons/check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import CardImage from '$lib/components/CardImage.svelte';
	import { folderPath } from '$lib/data/folders';
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
			<Button variant="outline" size="sm" onclick={() => copy(ptcglText, 'Decklist')}>
				<Copy class="size-4" /> Copy list
			</Button>
			<Button variant="outline" size="sm" onclick={() => copy(aiPayload, 'AI export')}>
				Copy for AI
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
						<p class="text-muted-foreground px-1.5 text-xs">
							{Math.round(buylist.coverage * 100)}% owned · counts show owned / needed, any printing
						</p>
					{/if}

					{#each entries as entry (entry.card.id)}
						{@const owned = ownedByName.get(entry.card.nameNormalized) ?? 0}
						{@const short = owned < entry.quantity}
						<div
							animate:flip={{ duration: 200 }}
							in:fly|global={{ y: 6, duration: 160 }}
							class={cn(
								'hover:bg-accent/50 flex items-center gap-3 rounded-lg p-1.5 transition-colors',
								short && 'bg-destructive/5'
							)}
						>
							<CardImage card={entry.card} class="h-11 w-8 shrink-0 rounded" />

							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium">{entry.card.name}</p>
								<p class="text-muted-foreground truncate text-xs">
									{entry.card.set.ptcglCode ?? entry.card.set.id} · #{entry.card.localId}
								</p>
							</div>

							<Badge
								variant={short ? 'destructive' : 'outline'}
								class="shrink-0 tabular-nums"
								title={short ? `${entry.quantity - owned} missing` : 'You own enough'}
							>
								{Math.min(owned, entry.quantity)}/{entry.quantity}
							</Badge>

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
								<Button variant="outline" size="sm" onclick={() => copy(missingText, 'Missing cards')}>
									<Copy class="size-4" /> Copy missing as list
								</Button>
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
									<Badge variant="secondary">{row.missing}×</Badge>
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
