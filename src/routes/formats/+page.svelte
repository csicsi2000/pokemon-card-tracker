<script lang="ts">
	import { enhance } from '$app/forms';
	import { fly } from 'svelte/transition';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let { data } = $props();

	let dialogOpen = $state(false);
	let name = $state('');
	let preset = $state('cube');

	const poolLabel = (rules: (typeof data.formats)[number]['rules'], poolSize: number) => {
		switch (rules.pool.type) {
			case 'explicit':
				return `${poolSize} cards in pool`;
			case 'sets':
				return `${rules.pool.setIds.length} sets`;
			case 'standard':
				return 'Standard-legal sets';
			case 'expanded':
				return 'Expanded-legal sets';
			default:
				return 'Every card';
		}
	};
</script>

<svelte:head><title>Formats · Cardex</title></svelte:head>

<PageHeader title="Formats" subtitle="Cube pools, banlists and house rules">
	{#snippet actions()}
		<Button size="sm" onclick={() => (dialogOpen = true)}>
			<Plus class="size-4" /> New format
		</Button>
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-4 p-4 md:p-8">
	{#if data.formats.length === 0}
		<div class="flex flex-col items-center gap-3 py-20 text-center">
			<p class="text-muted-foreground max-w-md text-sm">
				A format decides which cards are playable and how many copies are allowed. Make a Cube
				with a hand-picked pool, or a house format with its own banlist.
			</p>
			<Button onclick={() => (dialogOpen = true)}>Create your first format</Button>
		</div>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.formats as format, index (format.id)}
				<div in:fly|global={{ y: 10, duration: 220, delay: index * 30 }}>
					<Card.Root class="h-full transition-shadow hover:shadow-md">
						<Card.Header>
							<Card.Title class="flex items-start justify-between gap-2">
								<a href="/formats/{format.id}" class="hover:underline">{format.name}</a>
								<form
									method="POST"
									action="?/delete"
									use:enhance
									onsubmit={(event) => {
										if (!confirm(`Delete “${format.name}”?`)) event.preventDefault();
									}}
								>
									<input type="hidden" name="id" value={format.id} />
									<Button
										type="submit"
										variant="ghost"
										size="icon"
										class="text-muted-foreground hover:text-destructive size-7"
										aria-label="Delete format"
									>
										<Trash2 class="size-3.5" />
									</Button>
								</form>
							</Card.Title>
							<Card.Description>{format.description}</Card.Description>
						</Card.Header>
						<Card.Content class="flex flex-wrap gap-1.5">
							<Badge variant="secondary">{poolLabel(format.rules, format.poolSize)}</Badge>
							<Badge variant="outline">
								{format.rules.deckSize.min === format.rules.deckSize.max
									? `${format.rules.deckSize.min} cards`
									: `${format.rules.deckSize.min}–${format.rules.deckSize.max} cards`}
							</Badge>
							<Badge variant="outline">
								{format.rules.singleton ? 'Singleton' : `Max ${format.rules.maxCopiesPerName}`}
							</Badge>
							{#if format.rules.bannedNames.length}
								<Badge variant="outline">{format.rules.bannedNames.length} banned</Badge>
							{/if}
						</Card.Content>
					</Card.Root>
				</div>
			{/each}
		</div>
	{/if}
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>New format</Dialog.Title>
			<Dialog.Description>Start from a preset — you can tune the rules after.</Dialog.Description>
		</Dialog.Header>

		<form method="POST" action="?/create" use:enhance class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Label for="format-name">Name</Label>
				<Input id="format-name" name="name" bind:value={name} required placeholder="My Cube 2026" />
			</div>

			<div class="flex flex-col gap-2">
				<Label>Preset</Label>
				<div class="flex flex-col gap-2">
					{#each data.presets as option (option.id)}
						<label
							class="hover:bg-accent flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
							class:border-primary={preset === option.id}
						>
							<input
								type="radio"
								name="preset"
								value={option.id}
								bind:group={preset}
								class="mt-1"
							/>
							<span>
								<span class="block text-sm font-medium">{option.name}</span>
								<span class="text-muted-foreground block text-xs">{option.description}</span>
							</span>
						</label>
					{/each}
				</div>
			</div>

			<Dialog.Footer>
				<Button type="submit">Create</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
