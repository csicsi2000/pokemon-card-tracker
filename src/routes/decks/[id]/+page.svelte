<script lang="ts">
	import { runAction } from '$lib/actions';
	import { flip } from 'svelte/animate';
	import { fly, slide } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CardSearchPanel from '$lib/components/CardSearchPanel.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Tabs from '$lib/components/ui/tabs';
	import { cardImage } from '$lib/tcg/queries';
	import Copy from '@lucide/svelte/icons/copy';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import type { CardWithSet, Supertype } from '$lib/database.types';

	let { data } = $props();

	const SECTIONS: Supertype[] = ['Pokemon', 'Trainer', 'Energy'];
	const SECTION_LABELS: Record<Supertype, string> = {
		Pokemon: 'Pokémon',
		Trainer: 'Trainer',
		Energy: 'Energy'
	};

	const total = $derived(data.entries.reduce((sum, entry) => sum + entry.quantity, 0));

	const grouped = $derived(
		SECTIONS.map((supertype) => ({
			supertype,
			entries: data.entries.filter((entry) => entry.card.supertype === supertype)
		})).filter((group) => group.entries.length > 0)
	);

	async function setQuantity(card: CardWithSet, quantity: number) {
		try {
			await runAction('?/setQuantity', { cardId: card.id, quantity: Math.max(0, quantity) });
		} catch (error) {
			toast.error((error as Error).message);
		}
	}

	const quantityOf = (cardId: string) =>
		data.entries.find((entry) => entry.card.id === cardId)?.quantity ?? 0;

	async function copyList() {
		await navigator.clipboard.writeText(data.ptcgl);
		toast.success('Decklist copied in PTCGL format');
	}
</script>

<svelte:head><title>{data.deck.name} · Cardex</title></svelte:head>

<PageHeader title={data.deck.name} subtitle={`${total} cards`}>
	{#snippet actions()}
		<Button variant="outline" size="sm" onclick={copyList}>
			<Copy class="size-4" /> Copy list
		</Button>
	{/snippet}
</PageHeader>

<div class="grid gap-6 p-4 md:p-8 lg:grid-cols-[1fr_320px]">
	<div class="flex min-w-0 flex-col gap-5">
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<StatTile label="Cards" value={total} />
			<StatTile label="Unique" value={data.entries.length} />
			<StatTile
				label="Owned"
				value={`${Math.round(data.buylist.coverage * 100)}%`}
				hint="of this deck"
			/>
			<StatTile label="To buy" value={data.buylist.totalMissing} />
		</div>

		{#if data.legality}
			<div transition:slide>
				{#if data.legality.legal}
					<Alert.Root>
						<CircleCheck class="size-4" />
						<Alert.Title>Legal in {data.deck.format?.name}</Alert.Title>
					</Alert.Root>
				{:else}
					<Alert.Root variant="destructive">
						<TriangleAlert class="size-4" />
						<Alert.Title>Not legal in {data.deck.format?.name}</Alert.Title>
						<Alert.Description>
							<ul class="list-disc pl-4">
								{#each data.legality.issues.slice(0, 8) as issue (issue.message)}
									<li>{issue.message}</li>
								{/each}
								{#if data.legality.issues.length > 8}
									<li>…and {data.legality.issues.length - 8} more</li>
								{/if}
							</ul>
						</Alert.Description>
					</Alert.Root>
				{/if}
			</div>
		{/if}

		<Tabs.Root value="list">
			<Tabs.List>
				<Tabs.Trigger value="list">Decklist</Tabs.Trigger>
				<Tabs.Trigger value="buy">
					Buylist
					{#if data.buylist.rows.length}
						<Badge variant="secondary" class="ml-1.5">{data.buylist.rows.length}</Badge>
					{/if}
				</Tabs.Trigger>
				<Tabs.Trigger value="text">Text</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="list" class="flex flex-col gap-5 pt-4">
				{#if data.entries.length === 0}
					<p class="text-muted-foreground py-16 text-center text-sm">
						Empty deck — search on the right to add cards.
					</p>
				{/if}

				{#each grouped as group (group.supertype)}
					<section class="flex flex-col gap-2">
						<h2 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
							{SECTION_LABELS[group.supertype]}
							· {group.entries.reduce((sum, e) => sum + e.quantity, 0)}
						</h2>

						{#each group.entries as entry (entry.card.id)}
							<div
								animate:flip={{ duration: 220 }}
								in:fly|global={{ y: 6, duration: 180 }}
								class="flex items-center gap-3 rounded-lg border p-2"
							>
								{#if entry.card.image_url}
									<img
										src={cardImage(entry.card.image_url)}
										alt=""
										loading="lazy"
										class="h-12 w-9 shrink-0 rounded object-cover"
									/>
								{:else}
									<div class="bg-muted h-12 w-9 shrink-0 rounded"></div>
								{/if}

								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">{entry.card.name}</p>
									<p class="text-muted-foreground truncate text-xs">
										{entry.card.set?.ptcgl_code ?? entry.card.set_id} · #{entry.card.local_id}
									</p>
								</div>

								<div class="flex shrink-0 items-center gap-1">
									<Button
										variant="outline"
										size="icon"
										class="size-7"
										onclick={() => setQuantity(entry.card, entry.quantity - 1)}
										aria-label="Remove one"
									>
										<Minus class="size-3" />
									</Button>
									<span class="w-6 text-center text-sm font-semibold tabular-nums">
										{entry.quantity}
									</span>
									<Button
										variant="outline"
										size="icon"
										class="size-7"
										onclick={() => setQuantity(entry.card, entry.quantity + 1)}
										aria-label="Add one"
									>
										<Plus class="size-3" />
									</Button>
								</div>
							</div>
						{/each}
					</section>
				{/each}
			</Tabs.Content>

			<Tabs.Content value="buy" class="pt-4">
				{#if data.buylist.rows.length === 0}
					<Alert.Root>
						<CircleCheck class="size-4" />
						<Alert.Title>You own every card in this deck.</Alert.Title>
					</Alert.Root>
				{:else}
					<Card.Root>
						<Card.Header>
							<Card.Title class="flex items-center gap-2">
								<ShoppingCart class="size-4" />
								{data.buylist.totalMissing} cards to buy
							</Card.Title>
							<Card.Description>
								Counted by card name — any printing you own counts.
							</Card.Description>
						</Card.Header>
						<Card.Content class="flex flex-col gap-1">
							{#each data.buylist.rows as row (row.name)}
								<div class="flex items-center justify-between gap-3 py-1.5">
									<div class="min-w-0">
										<p class="truncate text-sm">{row.name}</p>
										<p class="text-muted-foreground text-xs">
											own {row.owned} of {row.needed} · e.g. {row.suggestion.set?.ptcgl_code ??
												row.suggestion.set_id} #{row.suggestion.local_id}
										</p>
									</div>
									<Badge variant="destructive">+{row.missing}</Badge>
								</div>
								<Separator />
							{/each}
						</Card.Content>
					</Card.Root>
				{/if}
			</Tabs.Content>

			<Tabs.Content value="text" class="pt-4">
				<pre
					class="bg-muted overflow-x-auto rounded-lg p-4 font-mono text-xs whitespace-pre">{data.ptcgl}</pre>
				<Button class="mt-3" variant="outline" onclick={copyList}>
					<Copy class="size-4" /> Copy
				</Button>
			</Tabs.Content>
		</Tabs.Root>
	</div>

	<aside class="lg:sticky lg:top-24 lg:h-[calc(100svh-8rem)]">
		<Card.Root class="flex h-full flex-col">
			<Card.Header>
				<Card.Title class="text-base">Add cards</Card.Title>
			</Card.Header>
			<Card.Content class="flex min-h-0 flex-1 flex-col">
				<CardSearchPanel
					onadd={(card) => setQuantity(card, quantityOf(card.id) + 1)}
				/>
			</Card.Content>
		</Card.Root>
	</aside>
</div>
