<script lang="ts">
	import { enhance } from '$app/forms';
	import { fly, slide } from 'svelte/transition';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import * as Tabs from '$lib/components/ui/tabs';
	import { cardImage } from '$lib/tcg/queries';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Copy from '@lucide/svelte/icons/copy';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import { toast } from 'svelte-sonner';
	import type { ReviewRow } from './+page.server';

	let { data, form } = $props();

	const SAMPLE = `Pokémon: 2
1 Charizard null 1
2 Charmander PR-SW 92

Total Cards: 3`;

	let text = $state('');
	let target = $state<'collection' | 'deck'>('collection');
	let deckName = $state('');
	let deckId = $state('');
	let mode = $state<'add' | 'replace'>('add');
	let submitting = $state(false);

	// Printing chosen per row; starts at the resolver's pick and can be overridden.
	let chosen = $state<Record<number, string>>({});
	let skipped = $state<Record<number, boolean>>({});

	const rows = $derived((form && 'rows' in form ? form.rows : []) as ReviewRow[]);
	const unresolvedCount = $derived(rows.filter((row) => !row.card).length);
	const guessCount = $derived(
		rows.filter((row) => row.card && row.match !== 'exact' && row.match !== 'override').length
	);

	$effect(() => {
		if (rows.length === 0) return;
		chosen = Object.fromEntries(rows.map((row, i) => [i, row.card?.id ?? '']));
		skipped = {};
	});

	const importable = $derived(
		rows.filter((row, i) => chosen[i] && !skipped[i]).reduce((sum, row) => sum + row.quantity, 0)
	);

	const matchLabel: Record<ReviewRow['match'], string> = {
		exact: 'Exact',
		override: 'Exact',
		name: 'By name',
		'energy-alias': 'Energy',
		unresolved: 'Not found'
	};

	async function copyText(value: string, what: string) {
		await navigator.clipboard.writeText(value);
		toast.success(`${what} copied`);
	}
</script>

<svelte:head><title>Import · Cardex</title></svelte:head>

<PageHeader title="Import & export" subtitle="pkmn.gg / PTCGL decklists, and JSON for AI" />

<div class="mx-auto flex max-w-4xl flex-col gap-6 p-4 md:p-8">
	<Tabs.Root value="import">
		<Tabs.List>
			<Tabs.Trigger value="import">Import</Tabs.Trigger>
			<Tabs.Trigger value="export">Export for AI</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="import" class="flex flex-col gap-6 pt-4">
			<Card.Root>
				<Card.Header>
					<Card.Title>Paste a list</Card.Title>
					<Card.Description>
						pkmn.gg, PTCGL and Limitless all use the same text format.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<form
						method="POST"
						action="?/preview"
						use:enhance={() => {
							submitting = true;
							return async ({ update }) => {
								await update({ reset: false });
								submitting = false;
							};
						}}
						class="flex flex-col gap-3"
					>
						<Textarea
							name="text"
							bind:value={text}
							rows={10}
							spellcheck={false}
							placeholder={SAMPLE}
							class="font-mono text-sm"
						/>
						<div class="flex flex-wrap gap-2">
							<Button type="submit" disabled={submitting}>Preview</Button>
							<Button type="button" variant="ghost" onclick={() => (text = SAMPLE)}>
								Use the sample
							</Button>
						</div>
					</form>
				</Card.Content>
			</Card.Root>

			{#if form && 'message' in form && form.message}
				<div transition:slide>
					<Alert.Root variant="destructive">
						<CircleAlert class="size-4" />
						<Alert.Description>{form.message}</Alert.Description>
					</Alert.Root>
				</div>
			{/if}

			{#if form && 'warnings' in form && form.warnings?.length}
				<Alert.Root>
					<TriangleAlert class="size-4" />
					<Alert.Title>Check these lines</Alert.Title>
					<Alert.Description>
						<ul class="list-disc pl-4">
							{#each form.warnings as warning (warning)}<li>{warning}</li>{/each}
						</ul>
					</Alert.Description>
				</Alert.Root>
			{/if}

			{#if rows.length}
				<div in:fly={{ y: 10, duration: 250 }}>
				<Card.Root>
					<Card.Header>
						<Card.Title>Review {rows.length} lines</Card.Title>
						<Card.Description>
							{importable} cards will be imported.
							{#if unresolvedCount}· {unresolvedCount} not found{/if}
							{#if guessCount}· {guessCount} matched by name{/if}
						</Card.Description>
					</Card.Header>

					<Card.Content class="flex flex-col gap-2">
						{#each rows as row, i (i)}
							<div
								class="flex items-center gap-3 rounded-lg border p-2 transition-opacity"
								class:opacity-40={skipped[i] || !row.card}
							>
								{#if row.card?.image_url}
									<img
										src={cardImage(row.card.image_url)}
										alt=""
										class="h-14 w-10 shrink-0 rounded object-cover"
										loading="lazy"
									/>
								{:else}
									<div class="bg-muted h-14 w-10 shrink-0 rounded"></div>
								{/if}

								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">
										{row.quantity}× {row.card?.name ?? row.rawName}
									</p>
									<p class="text-muted-foreground truncate text-xs">
										{#if row.card}
											{row.card.set?.name ?? row.card.set_id} · #{row.card.local_id}
										{:else}
											wrote “{row.rawName} {row.setCode ?? 'null'} {row.number ?? ''}”
										{/if}
									</p>
									{#if row.note}
										<p class="text-muted-foreground truncate text-xs italic">{row.note}</p>
									{/if}
								</div>

								<Badge
									variant={row.match === 'exact' || row.match === 'override'
										? 'secondary'
										: row.card
											? 'outline'
											: 'destructive'}
								>
									{matchLabel[row.match]}
								</Badge>

								{#if row.alternatives.length > 1}
									<Select.Root
										type="single"
										value={chosen[i]}
										onValueChange={(value) => (chosen = { ...chosen, [i]: value ?? '' })}
									>
										<Select.Trigger class="w-44 shrink-0 text-xs">
											{row.alternatives.find((a) => a.id === chosen[i])?.label ?? 'Pick a printing'}
										</Select.Trigger>
										<Select.Content class="max-h-72">
											{#each row.alternatives as alternative (alternative.id)}
												<Select.Item value={alternative.id}>{alternative.label}</Select.Item>
											{/each}
										</Select.Content>
									</Select.Root>
								{/if}

								{#if row.card}
									<Button
										variant="ghost"
										size="sm"
										onclick={() => (skipped = { ...skipped, [i]: !skipped[i] })}
									>
										{skipped[i] ? 'Include' : 'Skip'}
									</Button>
								{/if}
							</div>
						{/each}
					</Card.Content>

					<Card.Footer>
						<form method="POST" action="?/commit" class="flex w-full flex-col gap-4">
							{#each rows as row, i (i)}
								{#if chosen[i] && !skipped[i]}
									<input
										type="hidden"
										name="row"
										value={JSON.stringify({ cardId: chosen[i], quantity: row.quantity })}
									/>
								{/if}
							{/each}

							<div class="flex flex-wrap items-end gap-3">
								<div class="flex flex-col gap-2">
									<Label>Import into</Label>
									<Select.Root
										type="single"
										value={target}
										onValueChange={(value) => (target = (value ?? 'collection') as typeof target)}
									>
										<Select.Trigger class="w-44">
											{target === 'collection' ? 'My collection' : 'A deck'}
										</Select.Trigger>
										<Select.Content>
											<Select.Item value="collection">My collection</Select.Item>
											<Select.Item value="deck">A deck</Select.Item>
										</Select.Content>
									</Select.Root>
									<input type="hidden" name="target" value={target} />
								</div>

								{#if target === 'deck'}
									<div class="flex flex-col gap-2" transition:slide={{ axis: 'x' }}>
										<Label>Deck</Label>
										<Select.Root
											type="single"
											value={deckId}
											onValueChange={(value) => (deckId = value ?? '')}
										>
											<Select.Trigger class="w-44">
												{data.decks.find((d) => d.id === deckId)?.name ?? 'New deck'}
											</Select.Trigger>
											<Select.Content>
												<Select.Item value="">New deck</Select.Item>
												{#each data.decks as deck (deck.id)}
													<Select.Item value={deck.id}>{deck.name}</Select.Item>
												{/each}
											</Select.Content>
										</Select.Root>
										<input type="hidden" name="deckId" value={deckId} />
									</div>

									{#if !deckId}
										<div class="flex flex-col gap-2">
											<Label for="deckName">Name</Label>
											<Input
												id="deckName"
												name="deckName"
												bind:value={deckName}
												placeholder="Imported deck"
												class="w-52"
											/>
										</div>
									{/if}
								{/if}

								<div class="flex flex-col gap-2">
									<Label>If it already exists</Label>
									<Select.Root
										type="single"
										value={mode}
										onValueChange={(value) => (mode = (value ?? 'add') as typeof mode)}
									>
										<Select.Trigger class="w-40">
											{mode === 'add' ? 'Add to what I have' : 'Replace'}
										</Select.Trigger>
										<Select.Content>
											<Select.Item value="add">Add to what I have</Select.Item>
											<Select.Item value="replace">Replace</Select.Item>
										</Select.Content>
									</Select.Root>
									<input type="hidden" name="mode" value={mode} />
								</div>

								<Button type="submit" disabled={importable === 0}>
									Import {importable} cards
								</Button>
							</div>
						</form>
					</Card.Footer>
				</Card.Root>
				</div>
			{/if}
		</Tabs.Content>

		<Tabs.Content value="export" class="flex flex-col gap-4 pt-4">
			<Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						<Sparkles class="size-4" /> Hand your data to an AI
					</Card.Title>
					<Card.Description>
						Copy a JSON snapshot with a short preamble, paste it into Claude, and ask for
						decks. Claude replies in PTCGL format — paste that back into the Import tab.
					</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-wrap gap-2">
					<Button
						variant="outline"
						onclick={async () =>
							copyText(await (await fetch('/api/export/collection')).text(), 'Collection')}
					>
						<Copy class="size-4" /> Collection
					</Button>
					<Button
						variant="outline"
						onclick={async () => copyText(await (await fetch('/api/export/decks')).text(), 'Decks')}
					>
						<Copy class="size-4" /> All decks
					</Button>
					<Button variant="ghost" href="/api/export/collection" target="_blank">
						View raw JSON
					</Button>
				</Card.Content>
			</Card.Root>

			<Alert.Root>
				<Sparkles class="size-4" />
				<Alert.Title>Prompts worth trying</Alert.Title>
				<Alert.Description>
					<ul class="list-disc pl-4">
						<li>“Build five decks from this collection that are balanced against each other.”</li>
						<li>“Which cards should I buy to make this Cube playable for four people?”</li>
						<li>“Rate this deck's consistency and suggest two swaps I already own.”</li>
					</ul>
				</Alert.Description>
			</Alert.Root>
		</Tabs.Content>
	</Tabs.Root>
</div>
