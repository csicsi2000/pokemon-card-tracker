<script lang="ts">
	import { fly } from 'svelte/transition';
	import { base } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CardTile from '$lib/components/CardTile.svelte';
	import CardDetailSheet from '$lib/components/CardDetailSheet.svelte';
	import QuickAddBar from '$lib/components/QuickAddBar.svelte';
	import LotPicker from '$lib/components/LotPicker.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import Search from '@lucide/svelte/icons/search';
	import Download from '@lucide/svelte/icons/download';
	import Package from '@lucide/svelte/icons/package';
	import { normalizeName } from '$lib/tcg/normalize';
	import { pickVariant } from '$lib/tcg/quick-add';
	import { store } from '$lib/store.svelte';
	import { VARIANT_LABELS, type Card as CardType, type CardVariant } from '$lib/types';

	let { data } = $props();

	let query = $state('');
	let setId = $state('');
	/** '*' every lot, '' Unsorted, else a lot id — see LotPicker. */
	let lotFilter = $state('*');
	let selected = $state<CardType | null>(null);
	let sheetOpen = $state(false);

	// Quick add target: which lot and which finish new cards are recorded under.
	let addLot = $state('');
	let addFinish = $state<CardVariant>('normal');
	const addLotId = $derived(addLot === '' ? null : addLot);

	/** One row per printing, with the per-variant counts folded together. */
	const rows = $derived.by(() => {
		const byCard = new Map<string, { card: CardType; total: number }>();

		for (const entry of store.collection) {
			if (lotFilter !== '*' && (entry.lotId ?? '') !== lotFilter) continue;
			const card = data.catalogue.byId.get(entry.cardId);
			if (!card) continue; // printing vanished from the catalogue
			const existing = byCard.get(card.id);
			if (existing) existing.total += entry.quantity;
			else byCard.set(card.id, { card, total: entry.quantity });
		}

		return [...byCard.values()].sort((a, b) => a.card.name.localeCompare(b.card.name));
	});

	const filtered = $derived.by(() => {
		const needle = query.trim() ? normalizeName(query) : '';
		return rows.filter(
			({ card }) =>
				(!needle || card.nameNormalized.includes(needle)) && (!setId || card.set.id === setId)
		);
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
		<Button href="{base}/lots" variant="outline" size="sm">
			<Package class="size-4" />
			Lots
		</Button>
		<Button href="{base}/import" variant="outline" size="sm">
			<Download class="size-4" />
			Import / Export
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
				<div class="flex flex-col gap-2">
					<Label>Into lot</Label>
					<LotPicker bind:value={addLot} allowCreate />
				</div>
				<div class="flex flex-col gap-2">
					<Label>Finish</Label>
					<Select.Root
						type="single"
						value={addFinish}
						onValueChange={(v) => (addFinish = (v as CardVariant) ?? 'normal')}
					>
						<Select.Trigger class="w-36">{VARIANT_LABELS[addFinish]}</Select.Trigger>
						<Select.Content>
							{#each Object.entries(VARIANT_LABELS) as [value, label] (value)}
								<Select.Item {value}>{label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
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

	<div class="flex flex-wrap gap-2">
		<div class="relative min-w-50 flex-1">
			<Search
				class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
			/>
			<Input bind:value={query} placeholder="Search your collection…" class="pl-9" />
		</div>

		<LotPicker bind:value={lotFilter} includeAll />

		<Select.Root type="single" value={setId} onValueChange={(v) => (setId = v ?? '')}>
			<Select.Trigger class="w-48">
				{setOptions.find((o) => o.value === setId)?.label ?? 'All sets'}
			</Select.Trigger>
			<Select.Content class="max-h-80">
				{#each setOptions as option (option.value)}
					<Select.Item value={option.value}>{option.label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
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
	{:else}
		<div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
			{#each filtered as row, index (row.card.id)}
				<div in:fly|global={{ y: 8, duration: 200, delay: Math.min(index, 20) * 12 }}>
					<CardTile card={row.card} owned={row.total} onclick={() => open(row.card)} />
				</div>
			{/each}
		</div>
	{/if}
</div>

<CardDetailSheet
	bind:card={selected}
	bind:open={sheetOpen}
	lotId={lotFilter === '*' ? addLotId : lotFilter === '' ? null : lotFilter}
/>
