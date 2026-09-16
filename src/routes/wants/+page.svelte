<script lang="ts">
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
	import WantListDialog from '$lib/components/WantListDialog.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Select from '$lib/components/ui/select';
	import Search from '@lucide/svelte/icons/search';
	import Heart from '@lucide/svelte/icons/heart';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import Rows3 from '@lucide/svelte/icons/rows-3';
	import List from '@lucide/svelte/icons/list';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Coins from '@lucide/svelte/icons/coins';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { cardQuery } from '$lib/tcg/card-query';
	import { pickVariant } from '$lib/tcg/quick-add';
	import { toPtcglText } from '$lib/tcg/exporter';
	import {
		clearPriceCache,
		formatMoney,
		formatPrice,
		priceFrom,
		CURRENCY_OF,
		PRICE_SOURCES,
		PRICE_SOURCE_LABELS,
		type MarketPrice,
		type PriceSource
	} from '$lib/card-details';
	import { priceBook } from '$lib/prices.svelte';
	import { prefs, WANT_VIEW_LABELS, type WantView } from '$lib/prefs.svelte';
	import { store, wantKey, type WantProgress } from '$lib/store.svelte';
	import { cn } from '$lib/utils';
	import {
		VARIANT_LABELS,
		WANT_COUNTING_HINTS,
		WANT_COUNTING_LABELS,
		WANT_PRIORITY_LABELS,
		type Card as CardType,
		type CardVariant,
		type WantCounting,
		type WantEntry,
		type WantPriority
	} from '$lib/types';

	let { data } = $props();

	type Row = WantProgress & { want: WantEntry; card: CardType; list: string };

	let query = $state('');
	let priorityFilter = $state<WantPriority | ''>('');
	let hideFound = $state(false);
	let selected = $state<CardType | null>(null);
	let sheetOpen = $state(false);
	let listDialogOpen = $state(false);
	let renaming = $state<string | null>(null);

	// What a new want gets, and where "Got it" files the copies once they turn up.
	let addFinish = $state<CardVariant>('normal');
	let addPriority = $state<WantPriority>('normal');
	let addCounting = $state<WantCounting>('extra');
	let foundLot = $state('');
	const foundLotId = $derived(foundLot === '' ? null : foundLot);

	const VIEW_ICONS: Record<WantView, typeof List> = {
		cards: LayoutGrid,
		detailed: Rows3,
		compact: List
	};
	const RANK: Record<WantPriority, number> = { high: 0, normal: 1, low: 2 };
	// Red, grey, faint grey — the theme's primary is red too, so it cannot mark "normal".
	const DOT: Record<WantPriority, string> = {
		high: 'bg-destructive',
		normal: 'bg-muted-foreground',
		low: 'bg-muted-foreground/30'
	};

	const lists = $derived([...store.wantLists].sort((a, b) => a.name.localeCompare(b.name)));

	/** '*' every list, '' the default list, else a list id — the LotPicker convention. */
	const listValue = $derived.by(() => {
		const saved = prefs.wantList;
		if (saved === '*' || saved === '') return saved;
		// The list may have been deleted here or on another device since we last looked.
		return store.wantList(saved) ? saved : '*';
	});
	/** `undefined` means every list; `null` is the default list. */
	const listId = $derived(listValue === '*' ? undefined : listValue === '' ? null : listValue);
	/** Where new wants go — the list being viewed, or the default one when viewing all. */
	const targetListId = $derived(listId ?? null);
	const listName = (id: string | null) => (id ? (store.wantList(id)?.name ?? 'List') : 'Main list');
	const currentName = $derived(listValue === '*' ? 'All lists' : listName(targetListId));

	/**
	 * Wants joined to the catalogue and to what you own. A want is for one finish, so
	 * only copies in that finish count towards it — however many lots they sit in. The
	 * progress is worked out over every list, whichever one is showing: when two lists
	 * want the same card, the copies owned go to one of them, not to both.
	 */
	const rows = $derived.by(() => {
		const progress = store.wantProgress();
		return store
			.wantsIn(listId)
			.flatMap((want): Row[] => {
				const card = data.catalogue.byId.get(want.cardId);
				if (!card) return []; // printing vanished from the catalogue
				return [{ ...progress.get(wantKey(want))!, want, card, list: listName(want.listId) }];
			})
			// Most wanted first, cards you have already found last, then by name.
			.sort(
				(a, b) =>
					RANK[a.want.priority] - RANK[b.want.priority] ||
					Number(a.missing === 0) - Number(b.missing === 0) ||
					a.card.name.localeCompare(b.card.name)
			);
	});

	const filtered = $derived.by(() => {
		// Name substring, or a set code and number like "MEG 21" / "meg21".
		const { matches } = cardQuery(data.catalogue, query);
		return rows.filter(
			(row) =>
				matches(row.card) &&
				(!priorityFilter || row.want.priority === priorityFilter) &&
				(!hideFound || row.missing > 0)
		);
	});

	const stats = $derived({
		toFind: rows.reduce((sum, row) => sum + row.missing, 0),
		wants: rows.length,
		high: rows.filter((row) => row.want.priority === 'high' && row.missing > 0).length,
		found: rows.filter((row) => row.missing === 0).length
	});

	// -- prices ---------------------------------------------------------------
	// One REST call per card, so ask once per printing on the list and let the answers
	// land as they come. Nothing is fetched while prices are switched off.

	const source = $derived(prefs.priceSource);
	const currency = $derived(CURRENCY_OF[source]);

	const wantedIds = $derived([...new Set(rows.map((row) => row.card.id))]);

	$effect(() => {
		if (prefs.showPrices) priceBook.request(wantedIds);
	});

	/** The chosen marketplace's quote — the only one that can go into a total. */
	const quote = (cardId: string): MarketPrice | null =>
		priceFrom(priceBook.get(cardId), source);

	/** Any quote at all: a card Cardmarket has never listed may still have a US price. */
	const anyQuote = (cardId: string): MarketPrice | null =>
		quote(cardId) ?? priceBook.get(cardId)?.[0] ?? null;

	/**
	 * What the list costs, in the one currency that can be added up. Cards the chosen
	 * marketplace does not price are counted rather than quietly totalled as zero — plenty
	 * of Energy and promo printings have no quote anywhere.
	 */
	const money = $derived.by(() => {
		let toFind = 0;
		let all = 0;
		let unpriced = 0;
		for (const row of rows) {
			const price = quote(row.card.id)?.price;
			if (price === undefined) {
				unpriced += 1;
				continue;
			}
			toFind += price * row.missing;
			all += price * row.want.quantity;
		}
		return { toFind, all, unpriced };
	});

	/** The line under a stat tile: the money, plus why it may not be the whole story. */
	function priceHint(amount: number, suffix: string): string | undefined {
		if (!prefs.showPrices) return undefined;
		const tail =
			priceBook.pending > 0
				? ' · pricing…'
				: money.unpriced > 0
					? ` · ${money.unpriced} unpriced`
					: '';
		return `≈ ${formatMoney(currency, amount)} ${suffix}${tail}`;
	}

	function refreshPrices() {
		clearPriceCache();
		priceBook.refresh(wantedIds);
		toast.success('Fetching fresh prices…');
	}

	/** Wants per list, for the counts beside each name in the picker. */
	const counts = $derived.by(() => {
		const totals = new Map<string | null, number>();
		for (const want of store.wants) totals.set(want.listId, (totals.get(want.listId) ?? 0) + 1);
		return totals;
	});

	/** The still-missing copies as a decklist, to paste into a shop or a trade thread. */
	const missingText = $derived(
		toPtcglText(
			rows.filter((row) => row.missing > 0).map((row) => ({ quantity: row.missing, card: row.card }))
		)
	);

	const refOf = (row: Row) => ({
		cardId: row.want.cardId,
		variant: row.want.variant,
		listId: row.want.listId
	});

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
	 * Adding the same card again asks for one more copy, the way adding it again to a lot
	 * records one more copy. A want you already own copies of stays on the list: whether
	 * those count towards it is what `counting` decides, and a new want counts the copies
	 * still to find, so nothing arrives already ticked off.
	 */
	function addWant(card: CardType) {
		const variant = pickVariant(card, null, addFinish);
		const existing = store.want({ cardId: card.id, variant, listId: targetListId });
		const quantity = (existing?.quantity ?? 0) + 1;
		const counting = existing?.counting ?? addCounting;
		write(
			() =>
				store.setWant({
					cardId: card.id,
					variant,
					quantity,
					listId: targetListId,
					counting,
					priority: existing?.priority ?? addPriority
				}),
			`${counting === 'extra' ? 'Looking for' : 'Want'} ${quantity}× ${card.name} (${VARIANT_LABELS[variant]}) · ${listName(targetListId)}`
		);
	}

	const adjust = (row: Row, delta: number) =>
		write(() => store.updateWant(refOf(row), { quantity: row.want.quantity + delta }));

	/** Found them: file the missing copies into a lot and tick the want off the list. */
	function found(row: Row) {
		const lotName = foundLotId ? (store.lot(foundLotId)?.name ?? 'a lot') : 'Unsorted';
		write(
			() => {
				if (row.missing > 0) {
					store.addOwned(
						[
							{
								cardId: row.want.cardId,
								variant: row.want.variant,
								quantity: row.missing,
								lotId: foundLotId
							}
						],
						'add'
					);
				}
				store.removeWant(refOf(row));
			},
			row.missing > 0
				? `Added ${row.missing}× ${row.card.name} to ${lotName}`
				: `${row.card.name} ticked off`
		);
	}

	function deleteList(id: string) {
		const name = listName(id);
		const held = counts.get(id) ?? 0;
		const keep =
			held === 0 ||
			confirm(
				`Delete "${name}"?\n\nOK keeps its ${held} want${held === 1 ? '' : 's'} on the Main list.\nCancel keeps the list.`
			);
		if (!keep) return;
		write(() => store.deleteWantList(id, 'default'), `"${name}" deleted`);
		if (listValue === id) prefs.wantList = '*';
	}

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
</script>

<!-- The per-row menu: which list it sits on, and getting rid of it. -->
{#snippet rowMenu(row: Row)}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			class={buttonVariants({ variant: 'ghost', size: 'icon', class: 'text-muted-foreground size-8' })}
			aria-label="More for {row.card.name}"
		>
			<Ellipsis class="size-4" />
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end">
			<DropdownMenu.Group>
				<DropdownMenu.GroupHeading>The quantity counts</DropdownMenu.GroupHeading>
				<DropdownMenu.RadioGroup
					value={row.want.counting}
					onValueChange={(value) =>
						write(() => store.updateWant(refOf(row), { counting: value as WantCounting }))}
				>
					{#each Object.entries(WANT_COUNTING_LABELS) as [value, label] (value)}
						<DropdownMenu.RadioItem {value} title={WANT_COUNTING_HINTS[value as WantCounting]}>
							{label}
						</DropdownMenu.RadioItem>
					{/each}
				</DropdownMenu.RadioGroup>
			</DropdownMenu.Group>
			<DropdownMenu.Separator />
			<DropdownMenu.Group>
				<DropdownMenu.GroupHeading>Move to list</DropdownMenu.GroupHeading>
				<DropdownMenu.Item
					disabled={row.want.listId === null}
					onclick={() => write(() => store.moveWant(refOf(row), null))}
				>
					Main list
				</DropdownMenu.Item>
				{#each lists as list (list.id)}
					<DropdownMenu.Item
						disabled={row.want.listId === list.id}
						onclick={() => write(() => store.moveWant(refOf(row), list.id))}
					>
						{list.name}
					</DropdownMenu.Item>
				{/each}
				<DropdownMenu.Item onclick={() => (listDialogOpen = true)}>New list…</DropdownMenu.Item>
			</DropdownMenu.Group>
			<DropdownMenu.Separator />
			<DropdownMenu.Item variant="destructive" onclick={() => write(() => store.removeWant(refOf(row)))}>
				<Trash2 class="size-4" /> Remove from wants
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/snippet}

{#snippet priorityPicker(row: Row, className: string)}
	<Select.Root
		type="single"
		value={row.want.priority}
		onValueChange={(value) =>
			write(() => store.updateWant(refOf(row), { priority: value as WantPriority }))}
	>
		<Select.Trigger class={className} aria-label="Priority">
			{WANT_PRIORITY_LABELS[row.want.priority]}
		</Select.Trigger>
		<Select.Content>
			{#each Object.entries(WANT_PRIORITY_LABELS) as [value, label] (value)}
				<Select.Item {value}>{label}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
{/snippet}

{#snippet stepper(row: Row)}
	<div class="flex items-center gap-1">
		<Button
			variant="outline"
			size="icon"
			class="size-7"
			aria-label="Want one fewer"
			onclick={() => adjust(row, -1)}
		>
			<Minus class="size-3" />
		</Button>
		<span class="w-6 text-center text-sm font-semibold tabular-nums">{row.want.quantity}</span>
		<Button
			variant="outline"
			size="icon"
			class="size-7"
			aria-label="Want one more"
			onclick={() => adjust(row, 1)}
		>
			<Plus class="size-3" />
		</Button>
	</div>
{/snippet}

{#snippet gotIt(row: Row, label: boolean)}
	<Button
		size="sm"
		variant={row.missing === 0 ? 'default' : 'outline'}
		onclick={() => found(row)}
		aria-label="Got {row.card.name}"
		title={row.missing > 0
			? `Add ${row.missing} to your collection and clear the want`
			: 'Clear the want — you already own these'}
	>
		<Check class="size-4" />
		{#if label}<span class="max-sm:sr-only">Got it</span>{/if}
	</Button>
{/snippet}

<!-- "Copies to own" shows progress towards the playset; "copies to find" cannot, since
     what is already in the binder is beside the point — it shows the hunt instead. -->
{#snippet countBadge(row: Row)}
	<Badge
		variant={row.missing === 0 ? 'default' : 'secondary'}
		class="shrink-0 tabular-nums"
		title={row.want.counting === 'extra'
			? `${row.missing} to find, on top of the ${row.owned} you own`
			: row.missing === 0
				? 'You own enough of this finish'
				: `${row.missing} still to find — you own ${row.owned}` +
					(row.owned > row.counted ? `, ${row.owned - row.counted} counted towards another list` : '')}
	>
		{#if row.want.counting === 'extra'}
			+{row.want.quantity}
		{:else}
			{row.counted}/{row.want.quantity}
		{/if}
	</Badge>
{/snippet}

<!-- What the copies still to find would cost, in whichever marketplace quoted them. -->
{#snippet priceTag(row: Row, className?: string)}
	{@const price = anyQuote(row.card.id)}
	{#if prefs.showPrices && price}
		{@const copies = Math.max(row.missing, 1)}
		<span
			class={cn('text-muted-foreground shrink-0 text-xs tabular-nums', className)}
			title="{formatPrice(price)} each on {price.source}{copies > 1
				? ` · ${formatPrice(price, price.price * copies)} for ${copies}`
				: ''}"
		>
			{formatPrice(price, price.price * copies)}{copies > 1 ? ` (${copies}×)` : ''}
		</span>
	{/if}
{/snippet}

<svelte:head><title>Wants · Cardex</title></svelte:head>

<PageHeader title="Wants" subtitle="Cards you are hunting for but do not own yet">
	{#snippet actions()}
		<!-- Prices come from TCGdex and change daily, so which market and whether to ask at
		     all live here rather than in settings, next to the numbers they explain. -->
		<DropdownMenu.Root>
			<DropdownMenu.Trigger class={buttonVariants({ variant: 'outline', size: 'sm' })}>
				<Coins class="size-4" />
				<span class="max-sm:sr-only">Prices</span>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-56">
				<DropdownMenu.CheckboxItem
					checked={prefs.showPrices}
					onCheckedChange={(checked) => (prefs.showPrices = checked)}
				>
					Show prices
				</DropdownMenu.CheckboxItem>
				<DropdownMenu.Separator />
				<DropdownMenu.Group>
					<DropdownMenu.GroupHeading>Priced against</DropdownMenu.GroupHeading>
					<DropdownMenu.RadioGroup
						value={source}
						onValueChange={(value) => (prefs.priceSource = value as PriceSource)}
					>
						{#each PRICE_SOURCES as value (value)}
							<DropdownMenu.RadioItem {value}>{PRICE_SOURCE_LABELS[value]}</DropdownMenu.RadioItem>
						{/each}
					</DropdownMenu.RadioGroup>
				</DropdownMenu.Group>
				<DropdownMenu.Separator />
				<DropdownMenu.Item disabled={!prefs.showPrices} onclick={refreshPrices}>
					<RefreshCw class="size-4" /> Refresh prices
				</DropdownMenu.Item>
				<DropdownMenu.Label class="text-muted-foreground text-xs font-normal">
					Approximate, from TCGdex. Kept for half a day.
				</DropdownMenu.Label>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<Button
			variant="outline"
			size="sm"
			disabled={stats.toFind === 0}
			onclick={() => copy(missingText, currentName)}
		>
			<Copy class="size-4" /> Copy list
		</Button>
	{/snippet}
</PageHeader>

<div class="grid gap-6 p-4 md:p-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
	<div class="flex min-w-0 flex-col gap-4">
		<!-- Which list, and how to draw it -->
		<div class="flex flex-wrap items-center gap-2">
			<Select.Root
				type="single"
				value={listValue}
				onValueChange={(value) => {
					if (value === '+') listDialogOpen = true;
					else if (value) prefs.wantList = value;
				}}
			>
				<Select.Trigger class="w-full font-medium sm:w-52" aria-label="Wants list">
					{currentName}
				</Select.Trigger>
				<Select.Content class="max-h-72">
					<Select.Item value="*">All lists ({store.wants.length})</Select.Item>
					<Select.Item value="">Main list ({counts.get(null) ?? 0})</Select.Item>
					{#each lists as list (list.id)}
						<Select.Item value={list.id}>{list.name} ({counts.get(list.id) ?? 0})</Select.Item>
					{/each}
					<Select.Item value="+">+ New list…</Select.Item>
				</Select.Content>
			</Select.Root>

			{#if listValue !== '*' && listValue !== ''}
				{@const list = store.wantList(listValue)}
				<Button
					variant="ghost"
					size="icon"
					class="size-9"
					aria-label="Rename list"
					onclick={() => (renaming = renaming === listValue ? null : listValue)}
				>
					<Pencil class="size-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					class="text-muted-foreground size-9"
					aria-label="Delete list"
					onclick={() => deleteList(listValue)}
				>
					<Trash2 class="size-4" />
				</Button>
				{#if list?.note && renaming !== listValue}
					<p class="text-muted-foreground truncate text-sm">{list.note}</p>
				{/if}
			{/if}

			<!-- Segmented view switch; the choice sticks to this browser. -->
			<div class="bg-muted ml-auto flex gap-0.5 rounded-lg p-0.5">
				{#each Object.entries(WANT_VIEW_LABELS) as [value, label] (value)}
					{@const Icon = VIEW_ICONS[value as WantView]}
					{@const active = prefs.wantView === value}
					<button
						type="button"
						onclick={() => (prefs.wantView = value as WantView)}
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

		{#if renaming && renaming === listValue}
			{@const list = store.wantList(renaming)}
			<div class="flex flex-wrap items-center gap-2" in:fly={{ y: -4, duration: 150 }}>
				<Input
					value={list?.name ?? ''}
					class="h-9 max-w-56"
					aria-label="List name"
					onchange={(event) =>
						write(() =>
							store.updateWantList(renaming!, { name: event.currentTarget.value.trim() || 'List' })
						)}
				/>
				<Input
					value={list?.note ?? ''}
					class="h-9 max-w-72"
					placeholder="Note — what this list is for"
					aria-label="List note"
					onchange={(event) =>
						write(() =>
							store.updateWantList(renaming!, { note: event.currentTarget.value.trim() || null })
						)}
				/>
				<Button variant="secondary" size="sm" onclick={() => (renaming = null)}>Done</Button>
			</div>
		{/if}

		<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
			<StatTile label="Cards to find" value={stats.toFind} hint={priceHint(money.toFind, 'to buy')} />
			<StatTile label="On the list" value={stats.wants} hint={priceHint(money.all, 'all copies')} />
			<StatTile label="High priority" value={stats.high} />
			<StatTile label="Already found" value={stats.found} hint="Owned — tick them off" />
		</div>

		{#if rows.length > 0}
			<!-- On a phone the search box takes the first line and the two filters share the next. -->
			<div class="flex flex-wrap gap-2">
				<div class="relative min-w-50 flex-1 max-sm:basis-full">
					<Search
						class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
					/>
					<Input bind:value={query} placeholder="Search your wants, or type MEG 21…" class="pl-9" />
				</div>

				<Select.Root
					type="single"
					value={priorityFilter}
					onValueChange={(value) => (priorityFilter = (value as WantPriority) ?? '')}
				>
					<Select.Trigger class="min-w-0 flex-1 sm:w-36 sm:flex-none">
						{priorityFilter ? WANT_PRIORITY_LABELS[priorityFilter] : 'Any priority'}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="">Any priority</Select.Item>
						{#each Object.entries(WANT_PRIORITY_LABELS) as [value, label] (value)}
							<Select.Item {value}>{label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>

				<Button
					variant={hideFound ? 'default' : 'outline'}
					onclick={() => (hideFound = !hideFound)}
					aria-pressed={hideFound}
					class="min-w-0 flex-1 sm:flex-none"
				>
					Still missing only
				</Button>
			</div>
		{/if}

		{#if rows.length === 0}
			<div class="flex flex-col items-center gap-3 py-16 text-center">
				<Heart class="text-muted-foreground size-8" />
				<p class="text-muted-foreground max-w-sm text-sm">
					{listValue === '*'
						? 'Nothing on your wants list. Search in the add panel for the cards you are chasing — the list keeps track of how many you still need, and one tap files them into your collection when they arrive.'
						: `"${currentName}" is empty. Search in the add panel to put cards on it, or move some over from another list.`}
				</p>
				<Button href="{base}/cards" variant="outline">Browse the catalogue</Button>
			</div>
		{:else if filtered.length === 0}
			<p class="text-muted-foreground py-16 text-center text-sm">Nothing matches those filters.</p>
		{:else if prefs.wantView === 'cards'}
			<!-- Cards: the art, for scanning a binder-sized list at a glance -->
			<div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
				{#each filtered as row, index (row.card.id + row.want.variant + (row.want.listId ?? ''))}
					<div
						animate:flip={{ duration: 200 }}
						in:fly|global={{ y: 8, duration: 200, delay: Math.min(index, 20) * 12 }}
						class="relative"
					>
						<CardTile
							card={row.card}
							owned={row.missing}
							onclick={() => open(row.card)}
							class={row.missing === 0 ? 'opacity-60' : undefined}
						/>
						{#if row.missing === 0}
							<span
								class="bg-primary text-primary-foreground pointer-events-none absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-full shadow"
								title="You own enough of this finish"
							>
								<Check class="size-4" />
							</span>
						{/if}
						<!-- Bottom left: the top corners already carry the count and the found tick. -->
						<span
							class="ring-background/70 pointer-events-none absolute bottom-11 left-1.5 size-2.5 rounded-full ring-2 {DOT[
								row.want.priority
							]}"
							title="{WANT_PRIORITY_LABELS[row.want.priority]} priority"
						></span>
						{#if prefs.showPrices}
							{@const price = anyQuote(row.card.id)}
							{#if price}
								<span
									class="bg-background/85 pointer-events-none absolute right-1.5 bottom-10 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums shadow-sm"
									title="{formatPrice(price)} each on {price.source}"
								>
									{formatPrice(price)}
								</span>
							{/if}
						{/if}
					</div>
				{/each}
			</div>
		{:else if prefs.wantView === 'compact'}
			<!-- Compact: one line each, for checking a list on your phone in a shop -->
			<div class="divide-y rounded-lg border">
				{#each filtered as row (row.card.id + row.want.variant + (row.want.listId ?? ''))}
					<div
						animate:flip={{ duration: 200 }}
						class={cn(
							'flex items-center gap-2 px-2 py-1.5 text-sm',
							row.missing === 0 && 'bg-primary/5'
						)}
					>
						<span
							class="size-2 shrink-0 rounded-full {DOT[row.want.priority]}"
							title="{WANT_PRIORITY_LABELS[row.want.priority]} priority"
						></span>
						{@render countBadge(row)}
						<button
							type="button"
							class="min-w-0 flex-1 truncate text-left hover:underline"
							onclick={() => open(row.card)}
						>
							{row.card.name}
							<span class="text-muted-foreground text-xs">
								{row.card.set.ptcglCode ?? row.card.set.id} · #{row.card.localId}
								{#if row.want.variant !== 'normal'}· {VARIANT_LABELS[row.want.variant]}{/if}
								{#if listValue === '*'}· {row.list}{/if}
								{#if row.want.note}· {row.want.note}{/if}
							</span>
						</button>
						{@render priceTag(row)}
						{@render gotIt(row, false)}
						{@render rowMenu(row)}
					</div>
				{/each}
			</div>
		{:else}
			<!-- Detailed: everything editable in place -->
			<div class="flex flex-col gap-2">
				{#each filtered as row (row.card.id + row.want.variant + (row.want.listId ?? ''))}
					<div
						animate:flip={{ duration: 200 }}
						in:fly|global={{ y: 6, duration: 160 }}
						class={cn(
							'flex flex-wrap items-center gap-3 rounded-lg border p-2 transition-colors',
							row.missing === 0 && 'border-primary/40 bg-primary/5'
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
								{#if listValue === '*'}
									<Badge variant="outline" class="shrink-0 max-sm:hidden">{row.list}</Badge>
								{/if}
								{@render countBadge(row)}
							</div>
							<p class="text-muted-foreground flex items-center gap-1 truncate text-xs">
								<span class="truncate">
									{row.card.set.ptcglCode ?? row.card.set.id} · #{row.card.localId} ·
									{VARIANT_LABELS[row.want.variant]}
									{#if row.owned > 0}· own {row.owned}{/if}
								</span>
								{@render priceTag(row, 'text-foreground/80 font-medium')}
							</p>
							<Input
								value={row.want.note ?? ''}
								placeholder="Note — where to look, top price…"
								class="h-7 text-xs"
								aria-label="Note for {row.card.name}"
								onchange={(event) =>
									write(() =>
										store.updateWant(refOf(row), {
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
							{@render priorityPicker(row, 'h-8 w-24')}
							{@render gotIt(row, true)}
							{@render rowMenu(row)}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Below lg the add panel comes first, so putting a card on the list never means
	     scrolling past every want on a phone. -->
	<aside class="order-first lg:order-none lg:sticky lg:top-24 lg:h-[calc(100svh-8rem)]">
		<Card.Root class="flex h-full flex-col">
			<Card.Header>
				<Card.Title class="text-base">Add to {listName(targetListId)}</Card.Title>
				<Card.Description>
					Adding a card you already own is fine — a new want counts the copies still to find,
					so it will not arrive ticked off.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex min-h-0 flex-1 flex-col gap-3">
				<div class="flex gap-2">
					<div class="flex flex-1 flex-col gap-1.5">
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
					<div class="flex flex-1 flex-col gap-1.5">
						<Label class="text-xs">Priority</Label>
						<Select.Root
							type="single"
							value={addPriority}
							onValueChange={(value) => (addPriority = (value as WantPriority) ?? 'normal')}
						>
							<Select.Trigger class="h-9">{WANT_PRIORITY_LABELS[addPriority]}</Select.Trigger>
							<Select.Content>
								{#each Object.entries(WANT_PRIORITY_LABELS) as [value, label] (value)}
									<Select.Item {value}>{label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				</div>

				<div class="flex flex-col gap-1.5">
					<Label class="text-xs">The quantity counts</Label>
					<Select.Root
						type="single"
						value={addCounting}
						onValueChange={(value) => (addCounting = (value as WantCounting) ?? 'extra')}
					>
						<Select.Trigger class="h-9">{WANT_COUNTING_LABELS[addCounting]}</Select.Trigger>
						<Select.Content>
							{#each Object.entries(WANT_COUNTING_LABELS) as [value, label] (value)}
								<Select.Item {value}>{label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<p class="text-muted-foreground text-xs">{WANT_COUNTING_HINTS[addCounting]}</p>
				</div>

				<div class="flex flex-col gap-1.5">
					<Label class="text-xs">"Got it" files copies into</Label>
					<LotPicker bind:value={foundLot} allowCreate />
				</div>

				<CardSearchPanel
					catalogue={data.catalogue}
					onadd={addWant}
					placeholder="Search cards, or type MEG 21…"
				/>
			</Card.Content>
		</Card.Root>
	</aside>
</div>

<CardDetailSheet bind:card={selected} bind:open={sheetOpen} lotId={foundLotId} />

<WantListDialog bind:open={listDialogOpen} oncreate={(list) => (prefs.wantList = list.id)} />
