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
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { store } from '$lib/store.svelte';
	import { parseRules, RULE_PRESETS, type FormatRules } from '$lib/tcg/format-rules';
	import { cn } from '$lib/utils';

	let dialogOpen = $state(false);
	let name = $state('');
	let presetId = $state('cube');

	const preset = $derived(RULE_PRESETS.find((option) => option.id === presetId) ?? RULE_PRESETS[0]);

	const formats = $derived(
		store.formats.map((format) => ({
			...format,
			parsed: parseRules(format.rules),
			deckCount: store.decks.filter((deck) => deck.formatId === format.id).length
		}))
	);

	function poolLabel(rules: FormatRules, poolSize: number) {
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
				return 'All cards';
		}
	}

	function create(event: SubmitEvent) {
		event.preventDefault();
		const format = store.createFormat(name.trim() || preset.name, preset.description, preset.rules);
		dialogOpen = false;
		name = '';
		goto(`${base}/formats/${format.id}`);
	}
</script>

<svelte:head><title>Formats · Cardex</title></svelte:head>

<PageHeader title="Formats" subtitle="Custom rules, banlists and Cube pools">
	{#snippet actions()}
		<Button size="sm" onclick={() => (dialogOpen = true)}>
			<Plus class="size-4" /> New format
		</Button>
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-4 p-4 md:p-8">
	{#if formats.length === 0}
		<div class="flex flex-col items-center gap-3 py-20 text-center">
			<p class="text-muted-foreground max-w-md text-sm">
				A format decides what a legal deck looks like — deck size, copy limits, banned cards, and
				which cards are in the pool at all. Start with a Cube to build a curated singleton pool.
			</p>
			<Button onclick={() => (dialogOpen = true)}>Create a format</Button>
		</div>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each formats as format, index (format.id)}
				<div
					animate:flip={{ duration: 250 }}
					in:fly|global={{ y: 10, duration: 220, delay: index * 30 }}
				>
					<Card.Root class="h-full transition-shadow hover:shadow-md">
						<Card.Header>
							<Card.Title class="flex items-start justify-between gap-2">
								<a href="{base}/formats/{format.id}" class="hover:underline">{format.name}</a>
								<Button
									variant="ghost"
									size="icon"
									class="text-muted-foreground hover:text-destructive size-7"
									aria-label="Delete format"
									onclick={() => {
										if (confirm(`Delete “${format.name}”?`)) store.deleteFormat(format.id);
									}}
								>
									<Trash2 class="size-3.5" />
								</Button>
							</Card.Title>
							{#if format.description}
								<Card.Description>{format.description}</Card.Description>
							{/if}
						</Card.Header>
						<Card.Content class="flex flex-wrap gap-1.5">
							<Badge variant="secondary">
								{format.parsed.deckSize.min === format.parsed.deckSize.max
									? `${format.parsed.deckSize.min} cards`
									: `${format.parsed.deckSize.min}–${format.parsed.deckSize.max} cards`}
							</Badge>
							<Badge variant="outline">
								{format.parsed.singleton
									? 'Singleton'
									: `${format.parsed.maxCopiesPerName} per name`}
							</Badge>
							<Badge variant="outline">{poolLabel(format.parsed, format.pool.length)}</Badge>
							{#if format.parsed.bannedNames.length}
								<Badge variant="outline">{format.parsed.bannedNames.length} banned</Badge>
							{/if}
							{#if format.deckCount}
								<Badge variant="outline">
									{format.deckCount} deck{format.deckCount === 1 ? '' : 's'}
								</Badge>
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
			<Dialog.Description>Pick a starting point — everything stays editable.</Dialog.Description>
		</Dialog.Header>

		<form onsubmit={create} class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Label for="format-name">Name</Label>
				<Input id="format-name" bind:value={name} placeholder={preset.name} />
			</div>

			<div class="flex flex-col gap-2">
				<Label>Preset</Label>
				<div class="grid gap-2">
					{#each RULE_PRESETS as option (option.id)}
						<button
							type="button"
							onclick={() => (presetId = option.id)}
							class={cn(
								'rounded-lg border p-3 text-left transition-colors',
								presetId === option.id ? 'border-primary bg-accent' : 'hover:bg-accent/50'
							)}
						>
							<p class="text-sm font-medium">{option.name}</p>
							<p class="text-muted-foreground text-xs">{option.description}</p>
						</button>
					{/each}
				</div>
			</div>

			<Dialog.Footer>
				<Button type="submit">Create</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
