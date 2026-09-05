<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import Plus from '@lucide/svelte/icons/plus';
	import Package from '@lucide/svelte/icons/package';
	import Inbox from '@lucide/svelte/icons/inbox';
	import { store } from '$lib/store.svelte';

	let dialogOpen = $state(false);
	let name = $state('');
	let acquiredOn = $state(new Date().toISOString().slice(0, 10));
	let note = $state('');

	/** Card and printing counts per lot, in one pass over the collection. */
	const counts = $derived.by(() => {
		const totals = new Map<string | null, { cards: number; printings: Set<string> }>();
		for (const row of store.collection) {
			const bucket = totals.get(row.lotId) ?? { cards: 0, printings: new Set<string>() };
			bucket.cards += row.quantity;
			bucket.printings.add(row.cardId);
			totals.set(row.lotId, bucket);
		}
		return totals;
	});

	const countOf = (lotId: string | null) => {
		const bucket = counts.get(lotId);
		return { cards: bucket?.cards ?? 0, printings: bucket?.printings.size ?? 0 };
	};

	// Newest acquisition first; lots without a date sort by when they were created.
	const lots = $derived(
		[...store.lots].sort((a, b) =>
			(b.acquiredOn ?? b.createdAt.slice(0, 10)).localeCompare(a.acquiredOn ?? a.createdAt.slice(0, 10))
		)
	);

	function create(event: SubmitEvent) {
		event.preventDefault();
		const lot = store.createLot({
			name: name.trim() || 'New lot',
			acquiredOn: acquiredOn || null,
			note: note.trim() || null
		});
		dialogOpen = false;
		name = '';
		note = '';
		goto(`${base}/lots/${lot.id}`);
	}
</script>

<svelte:head><title>Lots · Cardex</title></svelte:head>

<PageHeader title="Lots" subtitle="Purchases and batches — where each card came from">
	{#snippet actions()}
		<Button size="sm" onclick={() => (dialogOpen = true)}>
			<Plus class="size-4" /> New lot
		</Button>
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-4 p-4 md:p-8">
	<a href="{base}/lots/unsorted" in:fly|global={{ y: 10, duration: 220 }}>
		<Card.Root class="border-dashed transition-shadow hover:shadow-md">
			<Card.Header>
				<Card.Title class="flex items-center gap-2 text-base">
					<Inbox class="text-muted-foreground size-4" /> Unsorted
				</Card.Title>
				<Card.Description>
					{countOf(null).cards} cards · {countOf(null).printings} printings — cards not assigned
					to a lot
				</Card.Description>
			</Card.Header>
		</Card.Root>
	</a>

	{#if lots.length === 0}
		<div class="flex flex-col items-center gap-3 py-16 text-center">
			<Package class="text-muted-foreground size-8" />
			<p class="text-muted-foreground max-w-sm text-sm">
				A lot is a batch of cards you got together — a bulk buy, a booster box, a trade. Add
				cards into it and later check exactly what that lot contained.
			</p>
			<Button onclick={() => (dialogOpen = true)}>Create your first lot</Button>
		</div>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each lots as lot, index (lot.id)}
				{@const count = countOf(lot.id)}
				<div
					animate:flip={{ duration: 250 }}
					in:fly|global={{ y: 10, duration: 220, delay: index * 30 }}
				>
					<a href="{base}/lots/{lot.id}" class="block h-full">
						<Card.Root class="h-full transition-shadow hover:shadow-md">
							<Card.Header>
								<Card.Title class="flex items-start justify-between gap-2 text-base">
									<span class="truncate">{lot.name}</span>
									<Badge variant="secondary" class="shrink-0">{count.cards} cards</Badge>
								</Card.Title>
								<Card.Description>
									{lot.acquiredOn ?? 'No date'} · {count.printings} printings
									{#if lot.note}
										<br />{lot.note}
									{/if}
								</Card.Description>
							</Card.Header>
						</Card.Root>
					</a>
				</div>
			{/each}
		</div>
	{/if}
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>New lot</Dialog.Title>
			<Dialog.Description>Name it after the purchase so you can find it again.</Dialog.Description>
		</Dialog.Header>
		<form onsubmit={create} class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Label for="lot-name">Name</Label>
				<Input id="lot-name" bind:value={name} required placeholder="july.2 lot" />
			</div>
			<div class="flex flex-col gap-2">
				<Label for="lot-date">Acquired on</Label>
				<Input id="lot-date" type="date" bind:value={acquiredOn} />
			</div>
			<div class="flex flex-col gap-2">
				<Label for="lot-note">Note</Label>
				<Input id="lot-note" bind:value={note} placeholder="eBay bulk lot, 300 cards, CHF 45" />
			</div>
			<Dialog.Footer>
				<Button type="submit">Create</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
