<script lang="ts">
	import { base } from '$app/paths';
	import { fly } from 'svelte/transition';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import SetLogo from '$lib/components/SetLogo.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Progress } from '$lib/components/ui/progress';
	import { Badge } from '$lib/components/ui/badge';
	import * as Select from '$lib/components/ui/select';
	import Search from '@lucide/svelte/icons/search';
	import { setAsset } from '$lib/catalogue';
	import { store } from '$lib/store.svelte';
	import { normalizeName } from '$lib/tcg/normalize';

	let { data } = $props();

	let query = $state('');
	let seriesFilter = $state('');

	/** Which printings the user owns at least one copy of, for completion counts. */
	const ownedCardIds = $derived(new Set(store.collection.map((entry) => entry.cardId)));

	const rows = $derived.by(() => {
		// One pass over the catalogue rather than one filter per set — 203 sets × 21k
		// cards would be four million comparisons on every keystroke.
		const totals = new Map<string, { total: number; owned: number }>();
		for (const set of data.catalogue.sets) totals.set(set.id, { total: 0, owned: 0 });

		for (const card of data.catalogue.cards) {
			const bucket = totals.get(card.set.id);
			if (!bucket) continue;
			bucket.total += 1;
			if (ownedCardIds.has(card.id)) bucket.owned += 1;
		}

		return data.catalogue.sets.map((set) => {
			const counts = totals.get(set.id) ?? { total: 0, owned: 0 };
			return {
				set,
				...counts,
				percent: counts.total === 0 ? 0 : Math.round((counts.owned / counts.total) * 100)
			};
		});
	});

	const filtered = $derived.by(() => {
		const needle = query.trim() ? normalizeName(query) : '';
		return rows.filter(
			(row) =>
				(!needle ||
					normalizeName(row.set.name).includes(needle) ||
					(row.set.ptcglCode ?? '').toLowerCase().includes(query.trim().toLowerCase())) &&
				(!seriesFilter || row.set.series === seriesFilter)
		);
	});

	const seriesOptions = $derived([
		{ value: '', label: 'All series' },
		...[...new Set(data.catalogue.sets.map((set) => set.series).filter(Boolean))].map((series) => ({
			value: series as string,
			label: series as string
		}))
	]);

	const totals = $derived({
		sets: rows.length,
		started: rows.filter((row) => row.owned > 0).length,
		complete: rows.filter((row) => row.total > 0 && row.owned === row.total).length,
		owned: rows.reduce((sum, row) => sum + row.owned, 0)
	});
</script>

<svelte:head><title>Sets · Cardex</title></svelte:head>

<PageHeader title="Sets" subtitle="Every English set, and how far through it you are" />

<div class="flex flex-col gap-5 p-4 md:p-8">
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		<StatTile label="Sets" value={totals.sets} />
		<StatTile label="Started" value={totals.started} />
		<StatTile label="Completed" value={totals.complete} />
		<StatTile label="Distinct printings owned" value={totals.owned} />
	</div>

	<div class="flex flex-wrap gap-2">
		<div class="relative min-w-50 flex-1">
			<Search
				class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
			/>
			<Input bind:value={query} placeholder="Search sets…" class="pl-9" />
		</div>

		<Select.Root
			type="single"
			value={seriesFilter}
			onValueChange={(v) => (seriesFilter = v ?? '')}
		>
			<Select.Trigger class="w-56">
				{seriesOptions.find((o) => o.value === seriesFilter)?.label ?? 'All series'}
			</Select.Trigger>
			<Select.Content class="max-h-80">
				{#each seriesOptions as option (option.value)}
					<Select.Item value={option.value}>{option.label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	{#if filtered.length === 0}
		<p class="text-muted-foreground py-16 text-center text-sm">No sets match that.</p>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{#each filtered as row, index (row.set.id)}
				{@const symbol = setAsset(row.set.symbolUrl)}
				<a
					href="{base}/cards?set={row.set.id}"
					in:fly|global={{ y: 10, duration: 200, delay: Math.min(index, 16) * 25 }}
					class="hover:border-primary/40 group flex flex-col gap-3 rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
				>
					<div class="grid h-16 place-items-center">
						<!-- Most set logos are dark artwork on transparency; invert them in dark mode. -->
						<SetLogo
							set={row.set}
							class="transition-transform group-hover:scale-105 dark:brightness-0 dark:invert"
						/>
					</div>

					<div class="flex items-start gap-2">
						{#if symbol}
							<img src={symbol} alt="" loading="lazy" class="mt-0.5 size-4 object-contain" />
						{/if}
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">{row.set.name}</p>
							<p class="text-muted-foreground truncate text-xs">
								{row.set.releaseDate ?? 'Unknown date'}
								{#if row.set.ptcglCode}· {row.set.ptcglCode}{/if}
							</p>
						</div>
						{#if row.total > 0 && row.owned === row.total}
							<Badge class="shrink-0">Complete</Badge>
						{:else if !row.set.artworkPublished}
							<Badge variant="outline" class="shrink-0" title="TCGdex has not scanned this set yet">
								No art yet
							</Badge>
						{/if}
					</div>

					<div class="flex flex-col gap-1.5">
						<Progress value={row.percent} class="h-1.5" />
						<p class="text-muted-foreground flex justify-between text-xs tabular-nums">
							<span>{row.owned} / {row.total}</span>
							<span>{row.percent}%</span>
						</p>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
