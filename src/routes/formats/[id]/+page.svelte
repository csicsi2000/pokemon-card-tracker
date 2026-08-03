<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CardSearchPanel from '$lib/components/CardSearchPanel.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import * as Tabs from '$lib/components/ui/tabs';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import Copy from '@lucide/svelte/icons/copy';
	import CardImage from '$lib/components/CardImage.svelte';
	import { store } from '$lib/store.svelte';
	import { parseRules, type FormatRules } from '$lib/tcg/format-rules';
	import { buildBuylist } from '$lib/tcg/buylist';
	import { toAiEntries, AI_PREAMBLE } from '$lib/tcg/exporter';
	import type { Card as CardType } from '$lib/types';

	let { data } = $props();

	const formatId = $derived(page.params.id!);
	const format = $derived(store.format(formatId));
	const rules = $derived(parseRules(format?.rules));

	const poolCards = $derived.by(() => {
		if (!format) return [] as { card: CardType; quantity: number }[];
		return format.pool
			.flatMap((row) => {
				const card = data.catalogue.byId.get(row.cardId);
				return card ? [{ card, quantity: row.quantity }] : [];
			})
			.sort((a, b) => a.card.name.localeCompare(b.card.name));
	});

	const poolSize = $derived(poolCards.reduce((sum, row) => sum + row.quantity, 0));

	/** For an explicit pool (a Cube), the buylist is "what's missing to own the pool". */
	const buylist = $derived(
		buildBuylist(
			poolCards,
			store.collection.flatMap((entry) => {
				const card = data.catalogue.byId.get(entry.cardId);
				return card ? [{ name: card.name, quantity: entry.quantity }] : [];
			})
		)
	);

	const decksUsing = $derived(store.decks.filter((deck) => deck.formatId === formatId));

	/** Rules are stored as one JSON blob, so every edit writes the whole object. */
	function patchRules(changes: Partial<FormatRules>) {
		store.updateFormat(formatId, { rules: { ...rules, ...changes } });
	}

	function addToPool(card: CardType) {
		const existing = format?.pool.find((row) => row.cardId === card.id);
		store.setPoolQuantity(formatId, card.id, (existing?.quantity ?? 0) + 1);
	}

	function importCollectionIntoPool() {
		if (!format) return;
		// One pool slot per printing you own, capped at the copy limit for the format.
		const limit = rules.singleton ? 1 : rules.maxCopiesPerName;
		const byCard = new Map<string, number>();
		for (const entry of store.collection) {
			byCard.set(entry.cardId, (byCard.get(entry.cardId) ?? 0) + entry.quantity);
		}

		const added = store.addToPool(
			formatId,
			[...byCard].map(([cardId, quantity]) => ({ cardId, quantity: Math.min(quantity, limit) }))
		);
		toast.success(`Added ${added} printing${added === 1 ? '' : 's'} from your collection.`);
	}

	async function copyPoolForAi() {
		const payload = `${AI_PREAMBLE}\n${JSON.stringify(
			{ format: format?.name, rules, pool: toAiEntries(poolCards) },
			null,
			2
		)}`;
		try {
			await navigator.clipboard.writeText(payload);
			toast.success('Format copied');
		} catch {
			toast.error('Could not copy — the browser blocked clipboard access.');
		}
	}

	let bannedText = $state('');
	let bannedInitialised = false;
	$effect(() => {
		// Seed the textarea once, then let the user type freely.
		if (!bannedInitialised && format) {
			bannedText = rules.bannedNames.join('\n');
			bannedInitialised = true;
		}
	});

	const poolTypes = [
		{ value: 'all', label: 'Every card ever printed' },
		{ value: 'standard', label: 'Standard-legal sets' },
		{ value: 'expanded', label: 'Expanded-legal sets' },
		{ value: 'sets', label: 'Chosen sets' },
		{ value: 'explicit', label: 'Explicit pool (Cube)' }
	];
</script>

<svelte:head><title>{format?.name ?? 'Format'} · Cardex</title></svelte:head>

{#if !format}
	<div class="flex flex-col items-center gap-3 py-24 text-center">
		<p class="text-muted-foreground text-sm">This format does not exist in this browser.</p>
		<Button href="{base}/formats">Back to formats</Button>
	</div>
{:else}
	<PageHeader
		title={format.name}
		subtitle={rules.pool.type === 'explicit' ? `${poolSize} cards in pool` : 'Custom format'}
		backHref="{base}/formats"
	>
		{#snippet actions()}
			<Button variant="outline" size="sm" onclick={copyPoolForAi}>
				<Copy class="size-4" /> Copy for AI
			</Button>
		{/snippet}
	</PageHeader>

	<div class="grid gap-6 p-4 md:p-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
		<div class="flex min-w-0 flex-col gap-4">
			<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<StatTile label="Pool size" value={poolSize} />
				<StatTile label="Unique names" value={new Set(poolCards.map((r) => r.card.name)).size} />
				<StatTile label="Still to buy" value={buylist.totalMissing} />
				<StatTile label="Decks" value={decksUsing.length} />
			</div>

			<Tabs.Root value={rules.pool.type === 'explicit' ? 'pool' : 'rules'}>
				<Tabs.List>
					<Tabs.Trigger value="rules">Rules</Tabs.Trigger>
					<Tabs.Trigger value="pool">
						Pool
						{#if poolCards.length}<Badge variant="secondary" class="ml-1.5">{poolCards.length}</Badge
							>{/if}
					</Tabs.Trigger>
					<Tabs.Trigger value="buylist">
						Buylist
						{#if buylist.totalMissing}<Badge variant="secondary" class="ml-1.5"
								>{buylist.totalMissing}</Badge
							>{/if}
					</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="rules" class="flex flex-col gap-5 pt-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="flex flex-col gap-2">
							<Label for="format-name">Name</Label>
							<Input
								id="format-name"
								value={format.name}
								onchange={(e) => store.updateFormat(formatId, { name: e.currentTarget.value })}
							/>
						</div>
						<div class="flex flex-col gap-2">
							<Label>Card pool</Label>
							<Select.Root
								type="single"
								value={rules.pool.type}
								onValueChange={(value) =>
									patchRules({ pool: { ...rules.pool, type: value as FormatRules['pool']['type'] } })}
							>
								<Select.Trigger>
									{poolTypes.find((t) => t.value === rules.pool.type)?.label}
								</Select.Trigger>
								<Select.Content>
									{#each poolTypes as option (option.value)}
										<Select.Item value={option.value}>{option.label}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
					</div>

					<div class="flex flex-col gap-2">
						<Label for="format-description">Description</Label>
						<Textarea
							id="format-description"
							value={format.description ?? ''}
							rows={2}
							onchange={(e) =>
								store.updateFormat(formatId, { description: e.currentTarget.value || null })}
						/>
					</div>

					<div class="grid gap-4 sm:grid-cols-3">
						<div class="flex flex-col gap-2">
							<Label for="deck-min">Minimum deck size</Label>
							<Input
								id="deck-min"
								type="number"
								min="1"
								value={rules.deckSize.min}
								onchange={(e) =>
									patchRules({
										deckSize: { ...rules.deckSize, min: Number(e.currentTarget.value) || 1 }
									})}
							/>
						</div>
						<div class="flex flex-col gap-2">
							<Label for="deck-max">Maximum deck size</Label>
							<Input
								id="deck-max"
								type="number"
								min="1"
								value={rules.deckSize.max}
								onchange={(e) =>
									patchRules({
										deckSize: { ...rules.deckSize, max: Number(e.currentTarget.value) || 1 }
									})}
							/>
						</div>
						<div class="flex flex-col gap-2">
							<Label for="max-copies">Copies per name</Label>
							<Input
								id="max-copies"
								type="number"
								min="1"
								disabled={rules.singleton}
								value={rules.maxCopiesPerName}
								onchange={(e) =>
									patchRules({ maxCopiesPerName: Number(e.currentTarget.value) || 1 })}
							/>
						</div>
					</div>

					<div class="flex flex-col gap-3">
						<label class="flex items-center justify-between gap-4 text-sm">
							<span>
								Singleton
								<span class="text-muted-foreground block text-xs">
									At most one copy of each name, whatever the copy limit says.
								</span>
							</span>
							<Switch
								checked={rules.singleton}
								onCheckedChange={(checked) => patchRules({ singleton: checked })}
							/>
						</label>

						<label class="flex items-center justify-between gap-4 text-sm">
							<span>
								Basic energy exempt
								<span class="text-muted-foreground block text-xs">
									Unlimited basic energy, as in every official format.
								</span>
							</span>
							<Switch
								checked={rules.basicEnergyExempt}
								onCheckedChange={(checked) => patchRules({ basicEnergyExempt: checked })}
							/>
						</label>
					</div>

					<div class="flex flex-col gap-2">
						<Label for="banned">Banned cards</Label>
						<p class="text-muted-foreground text-xs">
							One card name per line. Bans apply to every printing of that name.
						</p>
						<Textarea
							id="banned"
							bind:value={bannedText}
							rows={5}
							placeholder={'Lysandre&#39;s Trump Card\nForest of Giant Plants'}
							onchange={() =>
								patchRules({
									bannedNames: bannedText
										.split('\n')
										.map((line) => line.trim())
										.filter(Boolean)
								})}
						/>
					</div>
				</Tabs.Content>

				<Tabs.Content value="pool" class="flex flex-col gap-3 pt-4">
					{#if rules.pool.type !== 'explicit'}
						<p class="text-muted-foreground text-sm">
							This format's pool is rule-based, so it has no hand-picked list. Switch the pool to
							“Explicit pool (Cube)” on the Rules tab to curate cards here.
						</p>
					{/if}

					<div class="flex flex-wrap gap-2">
						<Button variant="outline" size="sm" onclick={importCollectionIntoPool}>
							Add everything I own
						</Button>
						{#if poolCards.length}
							<Button
								variant="outline"
								size="sm"
								onclick={() => {
									if (confirm('Remove every card from this pool?'))
										store.updateFormat(formatId, { pool: [] });
								}}
							>
								Clear pool
							</Button>
						{/if}
					</div>

					{#if poolCards.length === 0}
						<p class="text-muted-foreground py-10 text-center text-sm">
							Pool is empty — search on the right, or pull in your collection.
						</p>
					{:else}
						<div class="flex flex-col gap-1.5">
							{#each poolCards as row (row.card.id)}
								<div
									animate:flip={{ duration: 200 }}
									in:fly|global={{ y: 6, duration: 160 }}
									class="hover:bg-accent/50 flex items-center gap-3 rounded-lg p-1.5 transition-colors"
								>
									<CardImage card={row.card} class="h-11 w-8 shrink-0 rounded" />
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium">{row.card.name}</p>
										<p class="text-muted-foreground truncate text-xs">
											{row.card.set.ptcglCode ?? row.card.set.id} · #{row.card.localId}
										</p>
									</div>
									<Input
										type="number"
										min="1"
										value={row.quantity}
										class="h-8 w-16"
										aria-label={`Copies of ${row.card.name}`}
										onchange={(e) =>
											store.setPoolQuantity(
												formatId,
												row.card.id,
												Number(e.currentTarget.value) || 0
											)}
									/>
									<Button
										variant="ghost"
										size="icon"
										class="text-muted-foreground hover:text-destructive size-8"
										aria-label={`Remove ${row.card.name}`}
										onclick={() => store.setPoolQuantity(formatId, row.card.id, 0)}
									>
										<Trash2 class="size-3.5" />
									</Button>
								</div>
							{/each}
						</div>
					{/if}
				</Tabs.Content>

				<Tabs.Content value="buylist" class="pt-4">
					{#if buylist.rows.length === 0}
						<p class="text-muted-foreground py-10 text-center text-sm">
							{poolCards.length === 0
								? 'Build a pool first.'
								: 'You already own every card in this pool.'}
						</p>
					{:else}
						<div class="flex flex-col gap-2">
							<p class="text-muted-foreground text-sm">
								{buylist.totalMissing} card{buylist.totalMissing === 1 ? '' : 's'} to buy ·
								{Math.round(buylist.coverage * 100)}% of the pool already owned
							</p>
							{#each buylist.rows as row (row.name)}
								<div class="flex items-center gap-3 rounded-lg border p-2">
									<ShoppingCart class="text-muted-foreground size-4 shrink-0" />
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium">{row.name}</p>
										<p class="text-muted-foreground text-xs">
											need {row.needed} · own {row.owned} · e.g.
											{row.suggestion.set.ptcglCode ?? row.suggestion.set.id} #{row.suggestion
												.localId}
										</p>
									</div>
									<Badge variant="secondary">{row.missing}×</Badge>
								</div>
							{/each}
						</div>
					{/if}
				</Tabs.Content>
			</Tabs.Root>
		</div>

		<aside class="lg:sticky lg:top-24 lg:h-[calc(100svh-8rem)]">
			<Card.Root class="flex h-full flex-col">
				<Card.Header>
					<Card.Title class="text-base">Add to pool</Card.Title>
				</Card.Header>
				<Card.Content class="flex min-h-0 flex-1 flex-col">
					<CardSearchPanel catalogue={data.catalogue} onadd={addToPool} />
				</Card.Content>
			</Card.Root>
		</aside>
	</div>
{/if}
