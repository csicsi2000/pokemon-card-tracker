<script lang="ts">
	import { fly } from 'svelte/transition';
	import { base } from '$app/paths';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CardTile from '$lib/components/CardTile.svelte';
	import CardDetailSheet from '$lib/components/CardDetailSheet.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import Search from '@lucide/svelte/icons/search';
	import Download from '@lucide/svelte/icons/download';
	import { normalizeName } from '$lib/tcg/normalize';
	import { store } from '$lib/store.svelte';
	import type { Card } from '$lib/types';

	let { data } = $props();

	let query = $state('');
	let setId = $state('');
	let selected = $state<Card | null>(null);
	let sheetOpen = $state(false);

	/** One row per printing, with the per-variant counts folded together. */
	const rows = $derived.by(() => {
		const byCard = new Map<string, { card: Card; total: number }>();

		for (const entry of store.collection) {
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

	function open(card: Card) {
		selected = card;
		sheetOpen = true;
	}
</script>

<svelte:head><title>Collection · Cardex</title></svelte:head>

<PageHeader title="Collection" subtitle="Everything you own">
	{#snippet actions()}
		<Button href="{base}/import" variant="outline" size="sm">
			<Download class="size-4" />
			Import / Export
		</Button>
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-5 p-4 md:p-8">
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
				{rows.length === 0 ? 'Your collection is empty.' : 'Nothing matches those filters.'}
			</p>
			{#if rows.length === 0}
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

<CardDetailSheet bind:card={selected} bind:open={sheetOpen} />
