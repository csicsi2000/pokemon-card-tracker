<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { fly } from 'svelte/transition';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CardTile from '$lib/components/CardTile.svelte';
	import CardDetailSheet from '$lib/components/CardDetailSheet.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import Search from '@lucide/svelte/icons/search';
	import type { CardVariant, CardWithSet } from '$lib/database.types';

	let { data } = $props();

	let q = $state(data.filters.q);
	let selected = $state<CardWithSet | null>(null);
	let sheetOpen = $state(false);
	// Owned counts we have changed locally, so the grid updates without a reload.
	let localOwned = $state<Record<string, number>>({});
	let variantCounts = $state<Partial<Record<CardVariant, number>>>({});

	const setOptions = $derived([
		{ value: '', label: 'All sets' },
		...data.sets.map((set) => ({
			value: set.id,
			label: `${set.name}${set.ptcgl_code ? ` (${set.ptcgl_code})` : ''}`
		}))
	]);

	const typeOptions = [
		{ value: '', label: 'All types' },
		{ value: 'Pokemon', label: 'Pokémon' },
		{ value: 'Trainer', label: 'Trainer' },
		{ value: 'Energy', label: 'Energy' }
	];

	const lastPage = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));

	function navigate(changes: Record<string, string>) {
		const params = new URLSearchParams(page.url.searchParams);
		for (const [key, value] of Object.entries(changes)) {
			if (value) params.set(key, value);
			else params.delete(key);
		}
		if (!('page' in changes)) params.delete('page');
		goto(`?${params}`, { keepFocus: true, noScroll: true });
	}

	async function openCard(card: CardWithSet) {
		selected = card;
		sheetOpen = true;
		variantCounts = {};

		const response = await fetch(`/api/collection/${encodeURIComponent(card.id)}`);
		if (response.ok) variantCounts = await response.json();
	}

	function onQuantityChange(cardId: string, variant: CardVariant, quantity: number) {
		variantCounts = { ...variantCounts, [variant]: quantity };
		localOwned = {
			...localOwned,
			[cardId]: Object.values(variantCounts).reduce((sum, n) => sum + (n ?? 0), 0)
		};
	}

	const ownedFor = (id: string) => localOwned[id] ?? data.owned[id] ?? 0;
</script>

<svelte:head><title>Cards · Cardex</title></svelte:head>

<PageHeader title="Cards" subtitle={`${data.total.toLocaleString()} printings`} />

<div class="flex flex-col gap-4 p-4 md:p-8">
	<form
		class="flex flex-wrap gap-2"
		onsubmit={(event) => {
			event.preventDefault();
			navigate({ q });
		}}
	>
		<div class="relative min-w-50 flex-1">
			<Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
			<Input bind:value={q} placeholder="Search card names…" class="pl-9" />
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

		<Select.Root
			type="single"
			value={data.filters.supertype}
			onValueChange={(value) => navigate({ type: value ?? '' })}
		>
			<Select.Trigger class="w-36">
				{typeOptions.find((o) => o.value === data.filters.supertype)?.label ?? 'All types'}
			</Select.Trigger>
			<Select.Content>
				{#each typeOptions as option (option.value)}
					<Select.Item value={option.value}>{option.label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>

		<Button type="submit">Search</Button>
	</form>

	{#if data.cards.length === 0}
		<p class="text-muted-foreground py-16 text-center text-sm">
			No cards match those filters.
		</p>
	{:else}
		<div
			class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8"
		>
			{#each data.cards as card, index (card.id)}
				<div in:fly|global={{ y: 8, duration: 200, delay: Math.min(index, 20) * 12 }}>
					<CardTile {card} owned={ownedFor(card.id)} onclick={() => openCard(card)} />
				</div>
			{/each}
		</div>

		<div class="flex items-center justify-center gap-3 py-4">
			<Button
				variant="outline"
				disabled={data.page <= 1}
				onclick={() => navigate({ page: String(data.page - 1) })}
			>
				Previous
			</Button>
			<span class="text-muted-foreground text-sm tabular-nums">
				Page {data.page} of {lastPage.toLocaleString()}
			</span>
			<Button
				variant="outline"
				disabled={data.page >= lastPage}
				onclick={() => navigate({ page: String(data.page + 1) })}
			>
				Next
			</Button>
		</div>
	{/if}
</div>

<CardDetailSheet
	bind:card={selected}
	bind:open={sheetOpen}
	quantities={variantCounts}
	onchange={onQuantityChange}
/>
