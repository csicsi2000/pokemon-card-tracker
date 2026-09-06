<script lang="ts">
	/**
	 * The trade binder: copies you own but do not need. An entry is one printing in one
	 * finish and how many of it are spare. The copies stay in the collection until
	 * "Traded" takes them out, so the collection keeps being the sum of its lots.
	 */
	import { fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { base } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CardImage from '$lib/components/CardImage.svelte';
	import CardTile from '$lib/components/CardTile.svelte';
	import CardSearchPanel from '$lib/components/CardSearchPanel.svelte';
	import CardDetailSheet from '$lib/components/CardDetailSheet.svelte';
	import LotPicker from '$lib/components/LotPicker.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import Search from '@lucide/svelte/icons/search';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import Rows3 from '@lucide/svelte/icons/rows-3';
	import List from '@lucide/svelte/icons/list';
	import { cardQuery } from '$lib/tcg/card-query';
	import { pickVariant } from '$lib/tcg/quick-add';
	import { toPtcglText } from '$lib/tcg/exporter';
	import { prefs, WANT_VIEW_LABELS, type WantView } from '$lib/prefs.svelte';
	import { store } from '$lib/store.svelte';
	import { cn } from '$lib/utils';
	import {
		VARIANT_LABELS,
		type Card as CardType,
		type CardVariant,
		type TradeEntry
	} from '$lib/types';

	let { data } = $props();

	/** A binder entry joined to the catalogue and to how many of that finish you hold. */
	type Row = { trade: TradeEntry; card: CardType; owned: number; short: number };

	let query = $state('');
	let selected = $state<CardType | null>(null);
	let sheetOpen = $state(false);

	// What a new entry gets, and which lot "Traded" takes the copies out of.
	let addFinish = $state<CardVariant>('normal');
	/** '*' takes from whichever lots hold the most copies; '' is Unsorted; else a lot id. */
	let fromLot = $state('*');
	const fromLotId = $derived(fromLot === '*' ? undefined : fromLot === '' ? null : fromLot);

	const VIEW_ICONS: Record<WantView, typeof List> = {
		cards: LayoutGrid,
		detailed: Rows3,
		compact: List
	};

	const rows = $derived.by(() =>
		store.trades
			.flatMap((trade): Row[] => {
				const card = data.catalogue.byId.get(trade.cardId);
				if (!card) return []; // printing vanished from the catalogue
				const owned = store.ownedOf(trade.cardId, trade.variant);
				return [{ trade, card, owned, short: Math.max(0, trade.quantity - owned) }];
			})
			// Entries offering copies you no longer hold first — they need a decision.
			.sort(
				(a, b) =>
					Number(b.short > 0) - Number(a.short > 0) || a.card.name.localeCompare(b.card.name)
			)
	);

	const filtered = $derived.by(() => {
		// Name substring, or a set code and number like "MEG 21" / "meg21".
		const { matches } = cardQuery(data.catalogue, query);
		return rows.filter((row) => matches(row.card));
	});

	const stats = $derived({
		copies: rows.reduce((sum, row) => sum + row.trade.quantity, 0),
		printings: rows.length,
		sets: new Set(rows.map((row) => row.card.set.id)).size,
		short: rows.filter((row) => row.short > 0).length
	});

	/** Every printing you own at least one copy of — what the add panel searches. */
	const ownedCards = $derived.by(() => {
		const ids = new Set(store.collection.map((row) => row.cardId));
		return [...ids].flatMap((id) => {
			const card = data.catalogue.byId.get(id);
			return card ? [card] : [];
		});
	});

	/** The binder as a decklist, to paste into a trade thread. */
	const listText = $derived(
		toPtcglText(rows.map((row) => ({ quantity: row.trade.quantity, card: row.card, variant: row.trade.variant })))
	);

	const refOf = (row: Row) => ({ cardId: row.trade.cardId, variant: row.trade.variant });

	/** Every write can fail on a full storage quota; say so rather than silently losing it. */
	function write(action: () => void, success?: string) {
		try {
			action();
			if (success) toast.success(success);
		} catch (error) {
			toast.error((error as Error).message);
		}
	}

	/**
	 * One more spare copy of this card. The finish is the chosen one if you own copies in
	 * it, else the finish you do own most of — the binder should name cards you can hand
	 * over, not ones you would have to go and find.
	 */
	function addTrade(card: CardType) {
		const ownedVariants = store.collection
			.filter((row) => row.cardId === card.id)
			.reduce((totals, row) => totals.set(row.variant, (totals.get(row.variant) ?? 0) + row.quantity), new Map<CardVariant, number>());
		const preferred = pickVariant(card, null, addFinish);
		const variant = ownedVariants.has(preferred)
			? preferred
			: ([...ownedVariants].sort((a, b) => b[1] - a[1])[0]?.[0] ?? preferred);

		const existing = store.trade({ cardId: card.id, variant });
		const quantity = (existing?.quantity ?? 0) + 1;
		write(
			() => store.setTrade({ cardId: card.id, variant, quantity }),
			`${quantity}× ${card.name} (${VARIANT_LABELS[variant]}) up for trade`
		);
	}

	const adjust = (row: Row, delta: number) =>
		write(() => store.updateTrade(refOf(row), { quantity: row.trade.quantity + delta }));

	/** The copies changed hands: out of the collection, out of the binder. */
	function traded(row: Row) {
		const count = Math.min(row.trade.quantity, row.owned);
		const from =
			fromLotId === undefined
				? 'your collection'
				: fromLotId === null
					? 'Unsorted'
					: (store.lot(fromLotId)?.name ?? 'that lot');
		if (count > 0) {
			const ok = confirm(
				`Traded ${count}× ${row.card.name} (${VARIANT_LABELS[row.trade.variant]})?\n\nOK removes ${count === 1 ? 'the copy' : `${count} copies`} from ${from} and clears the binder entry.`
			);
			if (!ok) return;
		}
		write(
			() => store.tradeAway(refOf(row), row.trade.quantity, fromLotId),
			count > 0
				? `Removed ${count}× ${row.card.name} from ${from}`
				: `${row.card.name} taken out of the binder`
		);
	}

	function open(card: CardType) {
		selected = card;
		sheetOpen = true;
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(listText);
			toast.success('Trade list copied');
		} catch {
			toast.error('Could not copy — the browser blocked clipboard access.');
		}
	}
</script>

{#snippet stepper(row: Row)}
	<div class="flex items-center gap-1">
		<Button
			variant="outline"
			size="icon"
			class="size-7"
			aria-label="Offer one fewer"
			onclick={() => adjust(row, -1)}
		>
			<Minus class="size-3" />
		</Button>
		<span class="w-6 text-center text-sm font-semibold tabular-nums">{row.trade.quantity}</span>
		<Button
			variant="outline"
			size="icon"
			class="size-7"
			aria-label="Offer one more"
			onclick={() => adjust(row, 1)}
		>
			<Plus class="size-3" />
		</Button>
	</div>
{/snippet}

{#snippet tradedButton(row: Row, label: boolean)}
	<Button
		size="sm"
		variant="outline"
		onclick={() => traded(row)}
		aria-label="Traded {row.card.name}"
		title={row.owned > 0
			? `Remove ${Math.min(row.trade.quantity, row.owned)} from your collection and clear the entry`
			: 'Clear the entry — you no longer own these'}
	>
		<Check class="size-4" />
		{#if label}<span class="max-sm:sr-only">Traded</span>{/if}
	</Button>
{/snippet}

{#snippet removeButton(row: Row)}
	<Button
		variant="ghost"
		size="icon"
		class="text-muted-foreground size-8"
		aria-label="Remove {row.card.name} from the binder"
		title="Take it out of the binder — the cards stay in your collection"
		onclick={() => write(() => store.removeTrade(refOf(row)))}
	>
		<Trash2 class="size-4" />
	</Button>
{/snippet}

{#snippet ownedBadge(row: Row)}
	<Badge
		variant={row.short > 0 ? 'destructive' : 'secondary'}
		class="shrink-0 gap-1 tabular-nums"
		title={row.short > 0
			? `Offering ${row.trade.quantity} but you only own ${row.owned} in this finish`
			: `You own ${row.owned} in this finish`}
	>
		{#if row.short > 0}<TriangleAlert class="size-3" />{/if}
		{row.trade.quantity}/{row.owned}
	</Badge>
{/snippet}

<svelte:head><title>Trade binder · Cardex</title></svelte:head>

<PageHeader title="Trade binder" subtitle="Spare cards you own and would trade away">
	{#snippet actions()}
		<Button variant="outline" size="sm" disabled={rows.length === 0} onclick={copy}>
			<Copy class="size-4" /> Copy list
		</Button>
	{/snippet}
</PageHeader>

<div class="grid gap-6 p-4 md:p-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
	<div class="flex min-w-0 flex-col gap-4">
		<div class="flex flex-wrap items-center gap-2">
			<div class="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
				<StatTile label="Copies for trade" value={stats.copies} />
				<StatTile label="Printings" value={stats.printings} />
				<StatTile label="Sets" value={stats.sets} />
				<StatTile
					label="Not owned"
					value={stats.short}
					hint={stats.short > 0 ? 'Offered but no longer held' : undefined}
				/>
			</div>
		</div>

		{#if rows.length > 0}
			<div class="flex flex-wrap gap-2">
				<div class="relative min-w-50 flex-1">
					<Search
						class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
					/>
					<Input bind:value={query} placeholder="Search the binder, or type MEG 21…" class="pl-9" />
				</div>

				<!-- Segmented view switch; the choice sticks to this browser. -->
				<div class="bg-muted flex gap-0.5 rounded-lg p-0.5">
					{#each Object.entries(WANT_VIEW_LABELS) as [value, label] (value)}
						{@const Icon = VIEW_ICONS[value as WantView]}
						{@const active = prefs.tradeView === value}
						<button
							type="button"
							onclick={() => (prefs.tradeView = value as WantView)}
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

		{#if rows.length === 0}
			<div class="flex flex-col items-center gap-3 py-16 text-center">
				<ArrowLeftRight class="text-muted-foreground size-8" />
				<p class="text-muted-foreground max-w-sm text-sm">
					The binder is empty. Search your collection in the add panel for the spares you would
					part with — the cards stay counted in your collection until you mark them traded.
				</p>
				<Button href="{base}/collection" variant="outline">Browse your collection</Button>
			</div>
		{:else if filtered.length === 0}
			<p class="text-muted-foreground py-16 text-center text-sm">Nothing matches that search.</p>
		{:else if prefs.tradeView === 'cards'}
			<!-- Cards: the art, for showing a binder page across the table -->
			<div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
				{#each filtered as row, index (row.card.id + row.trade.variant)}
					<div
						animate:flip={{ duration: 200 }}
						in:fly|global={{ y: 8, duration: 200, delay: Math.min(index, 20) * 12 }}
						class="relative"
					>
						<CardTile
							card={row.card}
							owned={row.trade.quantity}
							onclick={() => open(row.card)}
							class={row.short > 0 ? 'opacity-60' : undefined}
						/>
						{#if row.short > 0}
							<span
								class="bg-destructive text-destructive-foreground pointer-events-none absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-full shadow"
								title="Offering more than you own"
							>
								<TriangleAlert class="size-3.5" />
							</span>
						{/if}
					</div>
				{/each}
			</div>
		{:else if prefs.tradeView === 'compact'}
			<!-- Compact: one line each, for reading off to someone at a trade night -->
			<div class="divide-y rounded-lg border">
				{#each filtered as row (row.card.id + row.trade.variant)}
					<div animate:flip={{ duration: 200 }} class="flex items-center gap-2 px-2 py-1.5 text-sm">
						{@render ownedBadge(row)}
						<button
							type="button"
							class="min-w-0 flex-1 truncate text-left hover:underline"
							onclick={() => open(row.card)}
						>
							{row.card.name}
							<span class="text-muted-foreground text-xs">
								{row.card.set.ptcglCode ?? row.card.set.id} · #{row.card.localId}
								{#if row.trade.variant !== 'normal'}· {VARIANT_LABELS[row.trade.variant]}{/if}
								{#if row.trade.note}· {row.trade.note}{/if}
							</span>
						</button>
						{@render tradedButton(row, false)}
						{@render removeButton(row)}
					</div>
				{/each}
			</div>
		{:else}
			<!-- Detailed: everything editable in place -->
			<div class="flex flex-col gap-2">
				{#each filtered as row (row.card.id + row.trade.variant)}
					<div
						animate:flip={{ duration: 200 }}
						in:fly|global={{ y: 6, duration: 160 }}
						class={cn(
							'flex flex-wrap items-center gap-3 rounded-lg border p-2 transition-colors',
							row.short > 0 && 'border-destructive/40 bg-destructive/5'
						)}
					>
						<button type="button" onclick={() => open(row.card)} class="shrink-0">
							<CardImage card={row.card} class="h-14 w-10 rounded" />
							<span class="sr-only">Details for {row.card.name}</span>
						</button>

						<div class="flex min-w-0 flex-1 basis-48 flex-col gap-1">
							<div class="flex items-center gap-2">
								<button
									type="button"
									class="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
									onclick={() => open(row.card)}
								>
									{row.card.name}
								</button>
								{@render ownedBadge(row)}
							</div>
							<p class="text-muted-foreground truncate text-xs">
								{row.card.set.ptcglCode ?? row.card.set.id} · #{row.card.localId} ·
								{VARIANT_LABELS[row.trade.variant]}
							</p>
							<Input
								value={row.trade.note ?? ''}
								placeholder="Note — condition, what you want for it…"
								class="h-7 text-xs"
								aria-label="Note for {row.card.name}"
								onchange={(event) =>
									write(() =>
										store.updateTrade(refOf(row), {
											note: event.currentTarget.value.trim() || null
										})
									)}
							/>
						</div>

						<!-- On a phone the controls take their own line rather than squeezing the name. -->
						<div
							class="ml-auto flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto sm:gap-2"
						>
							{@render stepper(row)}
							{@render tradedButton(row, true)}
							{@render removeButton(row)}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Below lg the add panel comes first, so offering a card never means scrolling past
	     the whole binder on a phone. -->
	<aside class="order-first lg:order-none lg:sticky lg:top-24 lg:h-[calc(100svh-8rem)]">
		<Card.Root class="flex h-full flex-col">
			<Card.Header>
				<Card.Title class="text-base">Add to the binder</Card.Title>
				<Card.Description>
					Searches only the cards you own. Each tap offers one more copy.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex min-h-0 flex-1 flex-col gap-3">
				<div class="flex flex-col gap-1.5">
					<Label class="text-xs">Finish</Label>
					<Select.Root
						type="single"
						value={addFinish}
						onValueChange={(value) => (addFinish = (value as CardVariant) ?? 'normal')}
					>
						<Select.Trigger class="h-9">{VARIANT_LABELS[addFinish]}</Select.Trigger>
						<Select.Content>
							{#each Object.entries(VARIANT_LABELS) as [value, label] (value)}
								<Select.Item {value}>{label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<div class="flex flex-col gap-1.5">
					<Label class="text-xs">"Traded" takes copies out of</Label>
					<LotPicker bind:value={fromLot} includeAll class="w-full" />
				</div>

				<CardSearchPanel
					catalogue={data.catalogue}
					candidates={ownedCards}
					outsideNote="is not in your collection"
					onadd={addTrade}
					placeholder="Search your collection, or type MEG 21…"
				/>
			</Card.Content>
		</Card.Root>
	</aside>
</div>

<CardDetailSheet bind:card={selected} bind:open={sheetOpen} />
