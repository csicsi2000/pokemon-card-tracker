<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { fly } from 'svelte/transition';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CardTile from '$lib/components/CardTile.svelte';
	import CardDetailSheet from '$lib/components/CardDetailSheet.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import Search from '@lucide/svelte/icons/search';
	import Download from '@lucide/svelte/icons/download';
	import type { CardVariant, CardWithSet } from '$lib/database.types';

	let { data } = $props();

	let q = $state(data.filters.q);
	let selected = $state<CardWithSet | null>(null);
	let sheetOpen = $state(false);
	let variantCounts = $state<Partial<Record<CardVariant, number>>>({});

	const setOptions = $derived([
		{ value: '', label: 'All sets' },
		...data.sets.map((set) => ({
			value: set.id,
			label: `${set.name}${set.ptcgl_code ? ` (${set.ptcgl_code})` : ''}`
		}))
	]);

	function navigate(changes: Record<string, string>) {
		const params = new URLSearchParams(page.url.searchParams);
		for (const [key, value] of Object.entries(changes)) {
			if (value) params.set(key, value);
			else params.delete(key);
		}
		goto(`?${params}`, { keepFocus: true, noScroll: true });
	}

	function openCard(card: CardWithSet, variants: Partial<Record<CardVariant, number>>) {
		selected = card;
		variantCounts = { ...variants };
		sheetOpen = true;
	}

	function onQuantityChange(_cardId: string, variant: CardVariant, quantity: number) {
		variantCounts = { ...variantCounts, [variant]: quantity };
	}
</script>

<svelte:head><title>Collection · Cardex</title></svelte:head>

<PageHeader title="Collection" subtitle="Everything you own">
	{#snippet actions()}
		<Button href="/import" variant="outline" size="sm">
			<Download class="size-4" />
			Import / Export
		</Button>
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-5 p-4 md:p-8">
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		<StatTile label="Cards owned" value={data.stats.totalCards} />
		<StatTile label="Unique printings" value={data.stats.distinctPrintings} />
		<StatTile label="Unique names" value={data.stats.distinctNames} />
		<StatTile label="Sets represented" value={data.stats.setCount} />
	</div>

	<form
		class="flex flex-wrap gap-2"
		onsubmit={(event) => {
			event.preventDefault();
			navigate({ q });
		}}
	>
		<div class="relative min-w-50 flex-1">
			<Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
			<Input bind:value={q} placeholder="Search your collection…" class="pl-9" />
		</div>

		<Select.Root
			type="single"
			value={data.filters.setId}
			onValueChange={(value) => navigate({ set: value ?? '' })}
		>
			<Select.Trigger class="w-48">
				{setOptions.find((o) => o.value === data.filters.setId)?.label ?? 'All sets'}
			</Select.Trigger>
			<Select.Content class="max-h-80">
				{#each setOptions as option (option.value)}
					<Select.Item value={option.value}>{option.label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>

		<Button type="submit">Search</Button>
	</form>

	{#if data.rows.length === 0}
		<div class="flex flex-col items-center gap-3 py-20 text-center">
			<p class="text-muted-foreground text-sm">
				{data.stats.totalCards === 0
					? 'Your collection is empty.'
					: 'Nothing matches those filters.'}
			</p>
			{#if data.stats.totalCards === 0}
				<div class="flex gap-2">
					<Button href="/cards">Browse cards</Button>
					<Button href="/import" variant="outline">Import a list</Button>
				</div>
			{/if}
		</div>
	{:else}
		<div
			class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8"
		>
			{#each data.rows as row, index (row.card.id)}
				<div in:fly|global={{ y: 8, duration: 200, delay: Math.min(index, 20) * 12 }}>
					<CardTile
						card={row.card}
						owned={row.total}
						onclick={() => openCard(row.card, row.variants)}
					/>
				</div>
			{/each}
		</div>
	{/if}
</div>

<CardDetailSheet
	bind:card={selected}
	bind:open={sheetOpen}
	quantities={variantCounts}
	onchange={onQuantityChange}
	onclose={invalidateAll}
/>
