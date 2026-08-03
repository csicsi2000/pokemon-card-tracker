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
	import * as Select from '$lib/components/ui/select';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { store } from '$lib/store.svelte';

	let dialogOpen = $state(false);
	let name = $state('');
	let formatId = $state('');

	const decks = $derived(
		[...store.decks]
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.map((deck) => ({
				...deck,
				cardCount: deck.cards.reduce((sum, card) => sum + card.quantity, 0),
				format: store.formats.find((format) => format.id === deck.formatId) ?? null
			}))
	);

	function create(event: SubmitEvent) {
		event.preventDefault();
		const deck = store.createDeck(name.trim() || 'New deck', formatId || null);
		dialogOpen = false;
		name = '';
		goto(`${base}/decks/${deck.id}`);
	}
</script>

<svelte:head><title>Decks · Cardex</title></svelte:head>

<PageHeader title="Decks" subtitle={`${decks.length} saved`}>
	{#snippet actions()}
		<Button size="sm" onclick={() => (dialogOpen = true)}>
			<Plus class="size-4" /> New deck
		</Button>
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-4 p-4 md:p-8">
	{#if decks.length === 0}
		<div class="flex flex-col items-center gap-3 py-20 text-center">
			<p class="text-muted-foreground text-sm">No decks yet.</p>
			<div class="flex gap-2">
				<Button onclick={() => (dialogOpen = true)}>Create one</Button>
				<Button href="{base}/import" variant="outline">Import a decklist</Button>
			</div>
		</div>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each decks as deck, index (deck.id)}
				<div
					animate:flip={{ duration: 250 }}
					in:fly|global={{ y: 10, duration: 220, delay: index * 30 }}
				>
					<Card.Root class="h-full transition-shadow hover:shadow-md">
						<Card.Header>
							<Card.Title class="flex items-start justify-between gap-2">
								<a href="{base}/decks/{deck.id}" class="hover:underline">{deck.name}</a>
								<Button
									variant="ghost"
									size="icon"
									class="text-muted-foreground hover:text-destructive size-7"
									aria-label="Delete deck"
									onclick={() => {
										if (confirm(`Delete “${deck.name}”?`)) store.deleteDeck(deck.id);
									}}
								>
									<Trash2 class="size-3.5" />
								</Button>
							</Card.Title>
							<Card.Description>
								{deck.cardCount} cards
								{#if deck.description}· {deck.description}{/if}
							</Card.Description>
						</Card.Header>
						{#if deck.format}
							<Card.Content>
								<Badge variant="secondary">{deck.format.name}</Badge>
							</Card.Content>
						{/if}
					</Card.Root>
				</div>
			{/each}
		</div>
	{/if}
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>New deck</Dialog.Title>
		</Dialog.Header>
		<form onsubmit={create} class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Label for="deck-name">Name</Label>
				<Input id="deck-name" bind:value={name} required placeholder="Charizard ex" />
			</div>

			<div class="flex flex-col gap-2">
				<Label>Format</Label>
				<Select.Root type="single" value={formatId} onValueChange={(v) => (formatId = v ?? '')}>
					<Select.Trigger>
						{store.formats.find((f) => f.id === formatId)?.name ?? 'No format'}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="">No format</Select.Item>
						{#each store.formats as format (format.id)}
							<Select.Item value={format.id}>{format.name}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<Dialog.Footer>
				<Button type="submit">Create</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
