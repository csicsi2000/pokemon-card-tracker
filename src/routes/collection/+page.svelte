<script lang="ts">
	import { fly } from 'svelte/transition';
	import { base } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CardTile from '$lib/components/CardTile.svelte';
	import CardDetailSheet from '$lib/components/CardDetailSheet.svelte';
	import QuickAddBar from '$lib/components/QuickAddBar.svelte';
	import LotPicker from '$lib/components/LotPicker.svelte';
	import LotDialog from '$lib/components/LotDialog.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import Search from '@lucide/svelte/icons/search';
	import Download from '@lucide/svelte/icons/download';
	import Package from '@lucide/svelte/icons/package';
	import Plus from '@lucide/svelte/icons/plus';
	import Layers from '@lucide/svelte/icons/layers';
	import { cardQuery } from '$lib/tcg/card-query';
	import { pickVariant } from '$lib/tcg/quick-add';
	import { store } from '$lib/store.svelte';
	import type { CollectionEntry } from '$lib/data/model';
	import { VARIANT_LABELS, type Card as CardType, type CardVariant } from '$lib/types';

	let { data } = $props();

	let query = $state('');
	let setId = $state('');
	/** '*' every lot, '' Unsorted, else a lot id — see LotPicker. */
	let lotFilter = $state('*');
	/** Show the cards under a heading per lot instead of one flat grid. */
	let groupByLot = $state(false);
	let lotDialogOpen = $state(false);
	let selected = $state<CardType | null>(null);
	let sheetOpen = $state(false);

	// Quick add target: which lot and which finish new cards are recorded under.
	let addLot = $state('');
	let addFinish = $state<CardVariant>('normal');
	const addLotId = $derived(addLot === '' ? null : addLot);

	type Row = { card: CardType; total: number };

	/** One row per printing, with the per-variant counts folded together. */
	function fold(entries: CollectionEntry[]): Row[] {
		const byCard = new Map<string, Row>();

		for (const entry of entries) {
			const card = data.catalogue.byId.get(entry.cardId);
			if (!card) continue; // printing vanished from the catalogue
			const existing = byCard.get(card.id);
			if (existing) existing.total += entry.quantity;
			else byCard.set(card.id, { card, total: entry.quantity });
		}

		return [...byCard.values()].sort((a, b) => a.card.name.localeCompare(b.card.name));
	}

	const visible = $derived(
		store.collection.filter((entry) => lotFilter === '*' || (entry.lotId ?? '') === lotFilter)
	);

	const rows = $derived(fold(visible));

	// Name substring, or a set code and number like "MEG 21" / "meg21".
	const matches = $derived(cardQuery(data.catalogue, query).matches);
	const keep = (row: Row) => matches(row.card) && (!setId || row.card.set.id === setId);

	const filtered = $derived(rows.filter(keep));

	const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

	/** The same cards, split per lot: newest acquisition first, Unsorted last. */
	const sections = $derived.by(() => {
		if (!groupByLot) return [];

		const byLot = new Map<string | null, CollectionEntry[]>();
		for (const entry of visible) {
			const list = byLot.get(entry.lotId);
			if (list) list.push(entry);
			else byLot.set(entry.lotId, [entry]);
		}

		// Lots without a date fall back to when they were created, so they still sort.
		const dateOf = (lot: { acquiredOn: string | null; createdAt: string }) =>
			lot.acquiredOn ?? lot.createdAt.slice(0, 10);

		const section = (
			key: string,
			lot: { name: string; acquiredOn: string | null; note: string | null },
			href: string,
			entries: CollectionEntry[]
		) => {
			const rows = fold(entries).filter(keep);
			return {
				key,
				name: lot.name,
				href,
				acquiredOn: lot.acquiredOn,
				note: lot.note,
				rows,
				cards: rows.reduce((sum, row) => sum + row.total, 0),
				printings: rows.length
			};
		};

		const out = [...store.lots]
			.filter((lot) => byLot.has(lot.id))
			.sort((a, b) => dateOf(b).localeCompare(dateOf(a)))
			.map((lot) => section(lot.id, lot, `${base}/lots/${lot.id}`, byLot.get(lot.id)!));

		if (byLot.has(null))
			out.push(
				section(
					'unsorted',
					{ name: 'Unsorted', acquiredOn: null, note: null },
					`${base}/lots/unsorted`,
					byLot.get(null)!
				)
			);

		return out.filter((entry) => entry.rows.length > 0);
	});

	const stats = $derived({
		totalCards: rows.reduce((sum, row) => sum + row.total, 0),
		printings: rows.length,
		names: new Set(rows.map((row) => row.card.nameNormalized)).size,
		sets: new Set(rows.map((row) => row.card.set.id)).size
	});

	const setOptions = $derived([
		{ value: '', label: 'All sets' },
		...[...new Map(rows.map((row) => [row.card.set.id, row.card.set])).values()].map((set) => ({
			value: set.id,
			label: `${set.name}${set.ptcglCode ? ` (${set.ptcglCode})` : ''}`
		}))
	]);

	function open(card: CardType) {
		selected = card;
		sheetOpen = true;
	}

	function quickAdd(card: CardType, quantity: number, variant: CardVariant | null) {
		try {
			const finish = pickVariant(card, variant, addFinish);
			store.addOwned([{ cardId: card.id, variant: finish, quantity, lotId: addLotId }], 'add');
			const lotName = addLotId ? store.lot(addLotId)?.name : 'Unsorted';
			toast.success(`Added ${quantity}× ${card.name} (${VARIANT_LABELS[finish]}) to ${lotName}`);
		} catch (error) {
			toast.error((error as Error).message);
		}
	}
</script>

<svelte:head><title>Collection · Cardex</title></svelte:head>

<PageHeader title="Collection" subtitle="Everything you own">
	{#snippet actions()}
		<Button size="sm" onclick={() => (lotDialogOpen = true)}>
			<Plus class="size-4" />
			New lot
		</Button>
		<!-- Labels drop away on a phone; three full buttons crowd out the page title. -->
		<Button href="{base}/lots" variant="outline" size="sm" aria-label="Lots">
			<Package class="size-4" />
			<span class="hidden sm:inline">Lots</span>
		</Button>
		<Button href="{base}/import" variant="outline" size="sm" aria-label="Import / Export">
			<Download class="size-4" />
			<span class="hidden sm:inline">Import / Export</span>
		</Button>
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-5 p-4 md:p-8">
	<Card.Root>
		<Card.Content class="flex flex-col gap-3 py-4">
			<div class="flex flex-wrap items-end gap-3">
				<div class="flex min-w-64 flex-1 flex-col gap-2">
					<Label>Quick add</Label>
					<QuickAddBar catalogue={data.catalogue} onadd={quickAdd} />
				</div>
				<!-- On a phone the two pickers share one line under the quick add box. -->
				<div class="flex basis-full gap-3 sm:contents">
					<div class="flex min-w-0 flex-1 flex-col gap-2 sm:flex-none">
						<Label>Into lot</Label>
						<LotPicker bind:value={addLot} allowCreate class="w-full sm:w-44" />
					</div>
					<div class="flex min-w-0 flex-1 flex-col gap-2 sm:flex-none">
						<Label>Finish</Label>
						<Select.Root
							type="single"
							value={addFinish}
							onValueChange={(v) => (addFinish = (v as CardVariant) ?? 'normal')}
						>
							<Select.Trigger class="w-full sm:w-36">{VARIANT_LABELS[addFinish]}</Select.Trigger>
							<Select.Content>
								{#each Object.entries(VARIANT_LABELS) as [value, label] (value)}
									<Select.Item {value}>{label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		<StatTile label="Cards owned" value={stats.totalCards} />
		<StatTile label="Unique printings" value={stats.printings} />
		<StatTile label="Unique names" value={stats.names} />
		<StatTile label="Sets represented" value={stats.sets} />
	</div>

	<!-- On a phone the search box takes the first line and the two pickers share the next. -->
	<div class="flex flex-wrap gap-2">
		<div class="relative min-w-50 flex-1 max-sm:basis-full">
			<Search
				class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
			/>
			<Input bind:value={query} placeholder="Search your collection, or type MEG 21…" class="pl-9" />
		</div>

		<LotPicker bind:value={lotFilter} includeAll class="min-w-0 flex-1 sm:w-44 sm:flex-none" />

		<Select.Root type="single" value={setId} onValueChange={(v) => (setId = v ?? '')}>
			<Select.Trigger class="min-w-0 flex-1 sm:w-48 sm:flex-none">
				{setOptions.find((o) => o.value === setId)?.label ?? 'All sets'}
			</Select.Trigger>
			<Select.Content class="max-h-80">
				{#each setOptions as option (option.value)}
					<Select.Item value={option.value}>{option.label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>

		<Button
			variant={groupByLot ? 'secondary' : 'outline'}
			onclick={() => (groupByLot = !groupByLot)}
			aria-pressed={groupByLot}
			class="max-sm:w-full"
		>
			<Layers class="size-4" />
			Group by lot
		</Button>
	</div>

	{#if filtered.length === 0}
		<div class="flex flex-col items-center gap-3 py-20 text-center">
			<p class="text-muted-foreground text-sm">
				{rows.length === 0
					? lotFilter === '*'
						? 'Your collection is empty.'
						: 'Nothing in this lot yet.'
					: 'Nothing matches those filters.'}
			</p>
			{#if store.collection.length === 0}
				<div class="flex gap-2">
					<Button href="{base}/cards">Browse cards</Button>
					<Button href="{base}/import" variant="outline">Import a list</Button>
				</div>
			{/if}
		</div>
	{:else if groupByLot}
		{#each sections as section (section.key)}
			<section class="flex flex-col gap-3">
				<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2">
					<a href={section.href} class="text-base font-semibold hover:underline">{section.name}</a>
					<span class="text-muted-foreground text-sm">
						{section.acquiredOn ?? 'No date'} · {plural(section.cards, 'card')} · {plural(
							section.printings,
							'printing'
						)}
					</span>
					{#if section.note}
						<span class="text-muted-foreground truncate text-sm">{section.note}</span>
					{/if}
				</div>
				{@render grid(section.rows)}
			</section>
		{/each}
	{:else}
		{@render grid(filtered)}
	{/if}
</div>

{#snippet grid(items: Row[])}
	<div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
		{#each items as row, index (row.card.id)}
			<div in:fly|global={{ y: 8, duration: 200, delay: Math.min(index, 20) * 12 }}>
				<CardTile card={row.card} owned={row.total} onclick={() => open(row.card)} />
			</div>
		{/each}
	</div>
{/snippet}

<LotDialog
	bind:open={lotDialogOpen}
	oncreate={(lot) => {
		// Point quick add at the new lot and show the groups, so it is visible right away.
		addLot = lot.id;
		groupByLot = true;
		toast.success(`Created ${lot.name} — quick add now files cards here`);
	}}
/>

<CardDetailSheet
	bind:card={selected}
	bind:open={sheetOpen}
	lotId={lotFilter === '*' ? addLotId : lotFilter === '' ? null : lotFilter}
/>
