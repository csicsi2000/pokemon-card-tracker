<script lang="ts">
	import { enhance } from '$app/forms';
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

	let { data } = $props();

	let dialogOpen = $state(false);
	let name = $state('');
	let formatId = $state('');
</script>

<svelte:head><title>Decks · Cardex</title></svelte:head>

<PageHeader title="Decks" subtitle={`${data.decks.length} saved`}>
	{#snippet actions()}
		<Button size="sm" onclick={() => (dialogOpen = true)}>
			<Plus class="size-4" /> New deck
		</Button>
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-4 p-4 md:p-8">
	{#if data.decks.length === 0}
		<div class="flex flex-col items-center gap-3 py-20 text-center">
			<p class="text-muted-foreground text-sm">No decks yet.</p>
			<div class="flex gap-2">
				<Button onclick={() => (dialogOpen = true)}>Create one</Button>
				<Button href="/import" variant="outline">Import a decklist</Button>
			</div>
		</div>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.decks as deck, index (deck.id)}
				<div animate:flip={{ duration: 250 }} in:fly|global={{ y: 10, duration: 220, delay: index * 30 }}>
					<Card.Root class="h-full transition-shadow hover:shadow-md">
						<Card.Header>
							<Card.Title class="flex items-start justify-between gap-2">
								<a href="/decks/{deck.id}" class="hover:underline">{deck.name}</a>
								<form
									method="POST"
									action="?/delete"
									use:enhance
									onsubmit={(event) => {
										if (!confirm(`Delete “${deck.name}”?`)) event.preventDefault();
									}}
								>
									<input type="hidden" name="id" value={deck.id} />
									<Button
										type="submit"
										variant="ghost"
										size="icon"
										class="text-muted-foreground hover:text-destructive size-7"
										aria-label="Delete deck"
									>
										<Trash2 class="size-3.5" />
									</Button>
								</form>
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
		<form method="POST" action="?/create" use:enhance class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Label for="deck-name">Name</Label>
				<Input id="deck-name" name="name" bind:value={name} required placeholder="Charizard ex" />
			</div>

			<div class="flex flex-col gap-2">
				<Label>Format</Label>
				<Select.Root type="single" value={formatId} onValueChange={(v) => (formatId = v ?? '')}>
					<Select.Trigger>
						{data.formats.find((f) => f.id === formatId)?.name ?? 'No format'}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="">No format</Select.Item>
						{#each data.formats as format (format.id)}
							<Select.Item value={format.id}>{format.name}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
				<input type="hidden" name="formatId" value={formatId} />
			</div>

			<Dialog.Footer>
				<Button type="submit">Create</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
