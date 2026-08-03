<script lang="ts">
	import { fly } from 'svelte/transition';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { replaceState } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CardTile from '$lib/components/CardTile.svelte';
	import CardDetailSheet from '$lib/components/CardDetailSheet.svelte';
	import SetLogo from '$lib/components/SetLogo.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import Search from '@lucide/svelte/icons/search';
	import { searchCards } from '$lib/catalogue';
	import { store } from '$lib/store.svelte';
	import type { Card, Supertype } from '$lib/types';

	let { data } = $props();

	const PAGE_SIZE = 60;

	// Seeded from the URL so /cards?set=sv03 works — that is how the Sets page links here.
	let query = $state(page.url.searchParams.get('q') ?? '');
	let setId = $state(page.url.searchParams.get('set') ?? '');
	let supertype = $state<Supertype | ''>('');
	let pageNumber = $state(1);
	let selected = $state<Card | null>(null);
	let sheetOpen = $state(false);

	const matches = $derived(searchCards(data.catalogue, { query, setId, supertype }));
	const lastPage = $derived(Math.max(1, Math.ceil(matches.length / PAGE_SIZE)));
	const visible = $derived(matches.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE));

	const activeSet = $derived(setId ? data.catalogue.setsById.get(setId) : undefined);

	// Any filter change puts you back on page one, and is mirrored into the URL so the
	// view can be shared or reloaded.
	$effect(() => {
		const url = new URL(page.url);
		const sync = (key: string, value: string) =>
			value ? url.searchParams.set(key, value) : url.searchParams.delete(key);

		sync('q', query);
		sync('set', setId);

		if (url.href !== page.url.href) replaceState(url, {});
		pageNumber = 1;
	});

	const setOptions = $derived([
		{ value: '', label: 'All sets' },
		...data.catalogue.sets.map((set) => ({
			value: set.id,
			label: `${set.name}${set.ptcglCode ? ` (${set.ptcglCode})` : ''}`
		}))
	]);

	const typeOptions = [
		{ value: '', label: 'All types' },
		{ value: 'Pokemon', label: 'Pokémon' },
		{ value: 'Trainer', label: 'Trainer' },
		{ value: 'Energy', label: 'Energy' }
	];

	function open(card: Card) {
		selected = card;
		sheetOpen = true;
	}
</script>

<svelte:head><title>Cards · Cardex</title></svelte:head>

<PageHeader
	title={activeSet?.name ?? 'Cards'}
	subtitle={`${matches.length.toLocaleString()} printings`}
	backHref={activeSet ? `${base}/sets` : undefined}
>
	{#snippet actions()}
		{#if activeSet}
			<div class="hidden h-9 items-center sm:flex">
				<SetLogo set={activeSet} class="dark:brightness-0 dark:invert" />
			</div>
		{/if}
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-4 p-4 md:p-8">
	<div class="flex flex-wrap gap-2">
		<div class="relative min-w-50 flex-1">
			<Search
				class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
			/>
			<Input bind:value={query} placeholder="Search card names…" class="pl-9" />
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

		<Select.Root
			type="single"
			value={supertype}
			onValueChange={(v) => (supertype = (v ?? '') as Supertype | '')}
		>
			<Select.Trigger class="w-36">
				{typeOptions.find((o) => o.value === supertype)?.label ?? 'All types'}
			</Select.Trigger>
			<Select.Content>
				{#each typeOptions as option (option.value)}
					<Select.Item value={option.value}>{option.label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	{#if visible.length === 0}
		<p class="text-muted-foreground py-16 text-center text-sm">No cards match those filters.</p>
	{:else}
		<div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
			{#each visible as card, index (card.id)}
				<div in:fly|global={{ y: 8, duration: 200, delay: Math.min(index, 20) * 12 }}>
					<CardTile {card} owned={store.ownedTotal(card.id)} onclick={() => open(card)} />
				</div>
			{/each}
		</div>

		<div class="flex items-center justify-center gap-3 py-4">
			<Button variant="outline" disabled={pageNumber <= 1} onclick={() => (pageNumber -= 1)}>
				Previous
			</Button>
			<span class="text-muted-foreground text-sm tabular-nums">
				Page {pageNumber} of {lastPage.toLocaleString()}
			</span>
			<Button
				variant="outline"
				disabled={pageNumber >= lastPage}
				onclick={() => (pageNumber += 1)}
			>
				Next
			</Button>
		</div>
	{/if}
</div>

<CardDetailSheet bind:card={selected} bind:open={sheetOpen} />
