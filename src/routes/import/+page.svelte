<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { fly, slide } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import * as Tabs from '$lib/components/ui/tabs';
	import Copy from '@lucide/svelte/icons/copy';
	import Download from '@lucide/svelte/icons/download';
	import Upload from '@lucide/svelte/icons/upload';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import CardImage from '$lib/components/CardImage.svelte';
	import { store } from '$lib/store.svelte';
	import { parseDecklist } from '$lib/tcg/parser';
	import { resolveEntries, type ResolvedEntry } from '$lib/tcg/resolver';
	import { toPtcglText, toAiEntries, AI_PREAMBLE, type ExportLine } from '$lib/tcg/exporter';
	import { VARIANT_LABELS, type CardVariant, type UserData } from '$lib/types';

	let { data } = $props();

	const SAMPLE = `Pokémon: 2
1 Charizard null 1
2 Charmander PR-SW 92

Total Cards: 3`;

	// -- import -------------------------------------------------------------

	let text = $state('');
	let target = $state<'collection' | 'deck'>('collection');
	let deckName = $state('');
	let variant = $state<CardVariant>('normal');
	let mode = $state<'add' | 'replace'>('add');
	/** Printing overrides picked in review, keyed by the parsed line number. */
	let overrides = $state<Record<number, string>>({});

	const parsed = $derived(text.trim() ? parseDecklist(text) : null);
	const resolved = $derived(parsed ? resolveEntries(data.catalogue, parsed.entries) : []);

	const rows = $derived(
		resolved.map((row) => {
			const override = overrides[row.entry.lineNumber];
			const card = override ? (data.catalogue.byId.get(override) ?? row.card) : row.card;
			return { ...row, card, overridden: Boolean(override) };
		})
	);

	const unresolvedCount = $derived(rows.filter((row) => !row.card).length);
	const importable = $derived(rows.filter((row) => row.card));

	function matchLabel(row: ResolvedEntry & { overridden: boolean }) {
		if (row.overridden) return { text: 'chosen', variant: 'secondary' as const };
		switch (row.match) {
			case 'exact':
				return { text: 'exact', variant: 'outline' as const };
			case 'override':
				return { text: 'set alias', variant: 'outline' as const };
			case 'energy-alias':
				return { text: 'energy', variant: 'secondary' as const };
			case 'name':
				return { text: 'by name', variant: 'secondary' as const };
			default:
				return { text: 'not found', variant: 'destructive' as const };
		}
	}

	function runImport() {
		if (importable.length === 0) return;

		if (target === 'collection') {
			store.addOwned(
				importable.map((row) => ({
					cardId: row.card!.id,
					// Fall back to a finish this printing actually exists in.
					variant: row.card!.variants.includes(variant)
						? variant
						: (row.card!.variants[0] ?? 'normal'),
					quantity: row.entry.quantity
				})),
				mode
			);
			toast.success(`Added ${importable.length} rows to your collection.`);
			goto(`${base}/collection`);
			return;
		}

		// Merge duplicate printings so a deck never lists the same card twice.
		const merged = new Map<string, number>();
		for (const row of importable) {
			merged.set(row.card!.id, (merged.get(row.card!.id) ?? 0) + row.entry.quantity);
		}

		const deck = store.createDeck(
			deckName.trim() || 'Imported deck',
			null,
			[...merged].map(([cardId, quantity]) => ({ cardId, quantity }))
		);
		toast.success(`Created "${deck.name}".`);
		goto(`${base}/decks/${deck.id}`);
	}

	// -- export -------------------------------------------------------------

	const collectionLines = $derived.by((): ExportLine[] =>
		store.collection
			.flatMap((entry) => {
				const card = data.catalogue.byId.get(entry.cardId);
				return card ? [{ quantity: entry.quantity, card, variant: entry.variant }] : [];
			})
			.sort((a, b) => a.card.name.localeCompare(b.card.name))
	);

	const collectionText = $derived(toPtcglText(collectionLines));
	const collectionJson = $derived(
		`${AI_PREAMBLE}\n${JSON.stringify({ collection: toAiEntries(collectionLines) }, null, 2)}`
	);

	async function copy(value: string, label: string) {
		try {
			await navigator.clipboard.writeText(value);
			toast.success(`${label} copied`);
		} catch {
			toast.error('Could not copy — the browser blocked clipboard access.');
		}
	}

	// -- backup -------------------------------------------------------------

	function download(filename: string, value: string, type = 'application/json') {
		const url = URL.createObjectURL(new Blob([value], { type }));
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		URL.revokeObjectURL(url);
	}

	function backup() {
		const today = new Date().toISOString().slice(0, 10);
		download(`cardex-backup-${today}.json`, JSON.stringify(store.export(), null, 2));
		toast.success('Backup downloaded');
	}

	async function restore(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		input.value = '';

		try {
			const payload = JSON.parse(await file.text()) as UserData;
			const summary = `${payload.collection?.length ?? 0} collection rows, ${payload.decks?.length ?? 0} decks, ${payload.formats?.length ?? 0} formats`;
			if (!confirm(`Replace everything in this browser with ${summary}?`)) return;

			store.import(payload);
			toast.success('Backup restored');
		} catch (error) {
			toast.error(`Could not read that file: ${(error as Error).message}`);
		}
	}
</script>

<svelte:head><title>Import / Export · Cardex</title></svelte:head>

<PageHeader title="Import / Export" subtitle="pkmn.gg lists, AI hand-off, and backups" />

<div class="p-4 md:p-8">
	<Tabs.Root value="import" class="max-w-4xl">
		<Tabs.List>
			<Tabs.Trigger value="import">Import</Tabs.Trigger>
			<Tabs.Trigger value="export">Export</Tabs.Trigger>
			<Tabs.Trigger value="backup">Backup</Tabs.Trigger>
		</Tabs.List>

		<!-- Import -->
		<Tabs.Content value="import" class="flex flex-col gap-4 pt-4">
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">Paste a decklist</Card.Title>
					<Card.Description>
						pkmn.gg, PTCGL and Limitless all use the same text format. Nothing is saved until you
						press Import.
					</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-col gap-4">
					<Textarea
						bind:value={text}
						rows={10}
						class="font-mono text-sm"
						placeholder={SAMPLE}
						aria-label="Decklist text"
					/>

					<div class="flex flex-wrap gap-2">
						<Button variant="outline" size="sm" onclick={() => (text = SAMPLE)}>
							Use the example
						</Button>
						{#if text}
							<Button
								variant="ghost"
								size="sm"
								onclick={() => {
									text = '';
									overrides = {};
								}}
							>
								Clear
							</Button>
						{/if}
					</div>

					<div class="flex flex-wrap items-end gap-3">
						<div class="flex flex-col gap-2">
							<Label>Import into</Label>
							<Select.Root
								type="single"
								value={target}
								onValueChange={(v) => (target = (v as 'collection' | 'deck') ?? 'collection')}
							>
								<Select.Trigger class="w-40">
									{target === 'collection' ? 'My collection' : 'A new deck'}
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="collection">My collection</Select.Item>
									<Select.Item value="deck">A new deck</Select.Item>
								</Select.Content>
							</Select.Root>
						</div>

						{#if target === 'collection'}
							<div class="flex flex-col gap-2" transition:slide={{ duration: 150, axis: 'x' }}>
								<Label>Finish</Label>
								<Select.Root
									type="single"
									value={variant}
									onValueChange={(v) => (variant = (v as CardVariant) ?? 'normal')}
								>
									<Select.Trigger class="w-36">{VARIANT_LABELS[variant]}</Select.Trigger>
									<Select.Content>
										{#each Object.entries(VARIANT_LABELS) as [value, label] (value)}
											<Select.Item {value}>{label}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</div>

							<div class="flex flex-col gap-2">
								<Label>If already owned</Label>
								<Select.Root
									type="single"
									value={mode}
									onValueChange={(v) => (mode = (v as 'add' | 'replace') ?? 'add')}
								>
									<Select.Trigger class="w-40">
										{mode === 'add' ? 'Add to the count' : 'Replace the count'}
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="add">Add to the count</Select.Item>
										<Select.Item value="replace">Replace the count</Select.Item>
									</Select.Content>
								</Select.Root>
							</div>
						{:else}
							<div class="flex flex-col gap-2">
								<Label for="new-deck-name">Deck name</Label>
								<Input id="new-deck-name" bind:value={deckName} placeholder="Imported deck" />
							</div>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>

			{#if parsed}
				<div in:fly={{ y: 8, duration: 200 }}>
					<Card.Root>
						<Card.Header>
							<Card.Title class="text-base">
								Review — {parsed.total} cards on {parsed.entries.length} lines
							</Card.Title>
							<Card.Description>
								Check the matches before importing. Anything guessed by name can be switched to a
								different printing.
							</Card.Description>
						</Card.Header>

						<Card.Content class="flex flex-col gap-3">
							{#if parsed.warnings.length}
								<div
									class="border-destructive/40 bg-destructive/5 flex flex-col gap-1 rounded-lg border p-3"
								>
									{#each parsed.warnings as warning (warning)}
										<p class="flex items-start gap-2 text-sm">
											<TriangleAlert class="text-destructive mt-0.5 size-3.5 shrink-0" />
											{warning}
										</p>
									{/each}
								</div>
							{/if}

							{#if unresolvedCount}
								<p class="text-muted-foreground text-sm">
									{unresolvedCount} line{unresolvedCount === 1 ? '' : 's'} could not be matched and
									will be skipped.
								</p>
							{/if}

							<div class="flex flex-col divide-y">
								{#each rows as row (row.entry.lineNumber)}
									{@const label = matchLabel(row)}
									<div class="flex items-center gap-3 py-2">
										{#if row.card}
											<CardImage card={row.card} class="h-11 w-8 shrink-0 rounded" />
										{:else}
											<div class="bg-muted h-11 w-8 shrink-0 rounded"></div>
										{/if}

										<span class="w-8 shrink-0 text-sm font-semibold tabular-nums">
											{row.entry.quantity}×
										</span>

										<div class="min-w-0 flex-1">
											{#if row.card}
												<p class="truncate text-sm font-medium">{row.card.name}</p>
												<p class="text-muted-foreground truncate text-xs">
													{row.card.set.name} · #{row.card.localId}
												</p>
											{:else}
												<p class="truncate text-sm font-medium">{row.entry.name}</p>
												<p class="text-muted-foreground truncate text-xs">
													{row.note ?? 'No match'} · line {row.entry.lineNumber}
												</p>
											{/if}
										</div>

										{#if row.alternatives.length > 1}
											<Select.Root
												type="single"
												value={row.card?.id ?? ''}
												onValueChange={(value) => {
													if (value) overrides[row.entry.lineNumber] = value;
												}}
											>
												<Select.Trigger class="h-8 w-44 text-xs">
													{row.card
														? `${row.card.set.ptcglCode ?? row.card.set.id} · #${row.card.localId}`
														: 'Pick printing'}
												</Select.Trigger>
												<Select.Content class="max-h-72">
													{#each row.alternatives as option (option.id)}
														<Select.Item value={option.id}>
															{option.set.ptcglCode ?? option.set.id} · #{option.localId} ·
															{option.set.name}
														</Select.Item>
													{/each}
												</Select.Content>
											</Select.Root>
										{/if}

										<Badge variant={label.variant} class="shrink-0">{label.text}</Badge>
									</div>
								{/each}
							</div>
						</Card.Content>

						<Card.Footer>
							<Button disabled={importable.length === 0} onclick={runImport}>
								Import {importable.length} card{importable.length === 1 ? '' : 's'}
								{target === 'collection' ? 'into collection' : 'as a deck'}
							</Button>
						</Card.Footer>
					</Card.Root>
				</div>
			{/if}
		</Tabs.Content>

		<!-- Export -->
		<Tabs.Content value="export" class="flex flex-col gap-4 pt-4">
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">Collection as a decklist</Card.Title>
					<Card.Description>
						PTCGL text — the same format this page imports, so it round-trips.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<Textarea readonly value={collectionText} rows={8} class="font-mono text-xs" />
				</Card.Content>
				<Card.Footer class="gap-2">
					<Button variant="outline" onclick={() => copy(collectionText, 'Collection')}>
						<Copy class="size-4" /> Copy
					</Button>
					<Button
						variant="outline"
						onclick={() => download('collection.txt', collectionText, 'text/plain')}
					>
						<Download class="size-4" /> Download
					</Button>
				</Card.Footer>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">Collection for AI</Card.Title>
					<Card.Description>
						JSON plus a preamble telling the model to answer in PTCGL format, so its decklists paste
						straight back into the Import tab. This is the hand-off for "build five decks from what I
						own that are balanced against each other".
					</Card.Description>
				</Card.Header>
				<Card.Footer class="flex-wrap gap-2">
					<Button onclick={() => copy(collectionJson, 'AI export')}>
						<Copy class="size-4" /> Copy for AI
					</Button>
					<Button
						variant="outline"
						onclick={() => download('collection-for-ai.json', collectionJson)}
					>
						<Download class="size-4" /> Download
					</Button>
					<span class="text-muted-foreground self-center text-xs">
						{collectionLines.length} printings
					</span>
				</Card.Footer>
			</Card.Root>
		</Tabs.Content>

		<!-- Backup -->
		<Tabs.Content value="backup" class="flex flex-col gap-4 pt-4">
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">Back up your data</Card.Title>
					<Card.Description>
						Everything lives in this browser's storage. Clearing site data, switching browser, or
						using a private window loses it — keep a backup file somewhere safe.
					</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-wrap gap-6">
					<div>
						<p class="text-2xl font-semibold tabular-nums">{store.collection.length}</p>
						<p class="text-muted-foreground text-xs">collection rows</p>
					</div>
					<div>
						<p class="text-2xl font-semibold tabular-nums">{store.decks.length}</p>
						<p class="text-muted-foreground text-xs">decks</p>
					</div>
					<div>
						<p class="text-2xl font-semibold tabular-nums">{store.formats.length}</p>
						<p class="text-muted-foreground text-xs">formats</p>
					</div>
				</Card.Content>
				<Card.Footer class="flex-wrap gap-2">
					<Button onclick={backup}>
						<Download class="size-4" /> Download backup
					</Button>
					<Button variant="outline" onclick={() => document.getElementById('restore')?.click()}>
						<Upload class="size-4" /> Restore from file
					</Button>
					<input
						id="restore"
						type="file"
						accept="application/json"
						class="hidden"
						onchange={restore}
					/>
				</Card.Footer>
			</Card.Root>
		</Tabs.Content>
	</Tabs.Root>
</div>
