<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { cardImage } from '$lib/tcg/queries';
	import Search from '@lucide/svelte/icons/search';
	import Plus from '@lucide/svelte/icons/plus';
	import type { CardWithSet } from '$lib/database.types';

	let {
		onadd,
		placeholder = 'Search cards to add…'
	}: { onadd: (card: CardWithSet) => void; placeholder?: string } = $props();

	let query = $state('');
	let results = $state<CardWithSet[]>([]);
	let loading = $state(false);

	// Debounced search — the typeahead fires on every keystroke otherwise.
	$effect(() => {
		const term = query.trim();
		if (term.length < 2) {
			results = [];
			return;
		}

		const controller = new AbortController();
		const timer = setTimeout(async () => {
			loading = true;
			try {
				const response = await fetch(`/api/cards/search?q=${encodeURIComponent(term)}`, {
					signal: controller.signal
				});
				if (response.ok) results = await response.json();
			} catch {
				// aborted — a newer keystroke is already in flight
			} finally {
				loading = false;
			}
		}, 250);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});
</script>

<div class="flex min-h-0 flex-col gap-3">
	<div class="relative">
		<Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
		<Input bind:value={query} {placeholder} class="pl-9" />
	</div>

	<div class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
		{#if loading && results.length === 0}
			<p class="text-muted-foreground p-3 text-sm">Searching…</p>
		{:else if query.trim().length >= 2 && results.length === 0}
			<p class="text-muted-foreground p-3 text-sm">Nothing found.</p>
		{/if}

		{#each results as card (card.id)}
			<button
				type="button"
				class="hover:bg-accent flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors"
				onclick={() => onadd(card)}
			>
				{#if card.image_url}
					<img
						src={cardImage(card.image_url)}
						alt=""
						loading="lazy"
						class="h-12 w-9 shrink-0 rounded object-cover"
					/>
				{:else}
					<div class="bg-muted h-12 w-9 shrink-0 rounded"></div>
				{/if}
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium">{card.name}</p>
					<p class="text-muted-foreground truncate text-xs">
						{card.set?.ptcgl_code ?? card.set_id} · #{card.local_id}
					</p>
				</div>
				<Plus class="text-muted-foreground size-4 shrink-0" />
			</button>
		{/each}
	</div>
</div>
