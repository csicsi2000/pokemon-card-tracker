<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { fly } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CardTile from '$lib/components/CardTile.svelte';
	import CardImage from '$lib/components/CardImage.svelte';
	import CardDetailSheet from '$lib/components/CardDetailSheet.svelte';
	import QuickAddBar from '$lib/components/QuickAddBar.svelte';
	import LotPicker from '$lib/components/LotPicker.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import * as Tabs from '$lib/components/ui/tabs';
	import Copy from '@lucide/svelte/icons/copy';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import { rowKey, store } from '$lib/store.svelte';
	import { pickVariant } from '$lib/tcg/quick-add';
	import { toPtcglText } from '$lib/tcg/exporter';
	import { VARIANT_LABELS, type Card as CardType, type CardVariant } from '$lib/types';

	let { data } = $props();

	const UNSORTED = 'unsorted';
	const lotId = $derived(page.params.id === UNSORTED ? null : page.params.id!);
	const lot = $derived(lotId ? store.lot(lotId) : null);
	const exists = $derived(lotId === null || Boolean(lot));
	const title = $derived(lot?.name ?? 'Unsorted');

	let addFinish = $state<CardVariant>('normal');
	let selected = $state<CardType | null>(null);
	let sheetOpen = $state(false);
	let deleteOpen = $state(false);

	/** Rows in this lot joined to the catalogue — one per printing and finish. */
	const entries = $derived(
		store
			.lotEntries(lotId)
			.flatMap((row) => {
				const card = data.catalogue.byId.get(row.cardId);
				return card ? [{ row, card, key: rowKey(row) }] : [];
			})
			.sort(
				(a, b) =>
					a.card.name.localeCompare(b.card.name) || a.row.variant.localeCompare(b.row.variant)
			)
	);

	/** Grid view folds finishes together, like the collection page. */
	const tiles = $derived.by(() => {
		const byCard = new Map<string, { card: CardType; total: number }>();
		for (const { row, card } of entries) {
			const existing = byCard.get(card.id);
			if (existing) existing.total += row.quantity;
			else byCard.set(card.id, { card, total: row.quantity });
		}
		return [...byCard.values()];
	});

	const stats = $derived({
		cards: entries.reduce((sum, entry) => sum + entry.row.quantity, 0),
		printings: tiles.length,
		sets: new Set(entries.map((entry) => entry.card.set.id)).size
	});

	const listText = $derived(
		toPtcglText(entries.map(({ row, card }) => ({ quantity: row.quantity, card, variant: row.variant })))
	);

	function open(card: CardType) {
		selected = card;
		sheetOpen = true;
	}

	function quickAdd(card: CardType, quantity: number, variant: CardVariant | null) {
		try {
			const finish = pickVariant(card, variant, addFinish);
			store.addOwned([{ cardId: card.id, variant: finish, quantity, lotId }], 'add');
			toast.success(`Added ${quantity}× ${card.name} (${VARIANT_LABELS[finish]})`);
		} catch (error) {
			toast.error((error as Error).message);
		}
	}

	function adjust(cardId: string, variant: CardVariant, current: number, delta: number) {
		try {
			store.setOwned(cardId, variant, current + delta, lotId);
		} catch (error) {
			toast.error((error as Error).message);
		}
	}

	function move(key: string, quantity: number, target: string) {
		store.moveOwned(key, target === '' ? null : target, quantity);
		toast.success(`Moved to ${target === '' ? 'Unsorted' : store.lot(target)?.name}`);
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(listText);
			toast.success('Lot list copied');
		} catch {
			toast.error('Could not copy — the browser blocked clipboard access.');
		}
	}

	function remove(cards: 'unsorted' | 'remove') {
		if (!lotId) return;
		store.deleteLot(lotId, cards);
		deleteOpen = false;
		toast.success(cards === 'remove' ? 'Lot and its cards removed' : 'Lot removed; cards moved to Unsorted');
		goto(`${base}/lots`);
	}
</script>

<svelte:head><title>{title} · Cardex</title></svelte:head>

{#if !exists}
	<div class="flex flex-col items-center gap-3 py-24 text-center">
		<p class="text-muted-foreground text-sm">This lot does not exist in this browser.</p>
		<Button href="{base}/lots">Back to lots</Button>
	</div>
{:else}
	<PageHeader
		{title}
		subtitle={`${stats.cards} cards${lot?.acquiredOn ? ` · acquired ${lot.acquiredOn}` : ''}`}
		backHref="{base}/lots"
	>
		{#snippet actions()}
			<Button variant="outline" size="sm" onclick={copy} disabled={entries.length === 0}>
				<Copy class="size-4" /> Copy list
			</Button>
			{#if lot}
				<Button
					variant="outline"
					size="sm"
					class="text-destructive hover:text-destructive"
					onclick={() => (deleteOpen = true)}
				>
					<Trash2 class="size-4" /> Delete
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="flex flex-col gap-5 p-4 md:p-8">
		{#if lot}
			<div class="flex flex-wrap items-end gap-3">
				<div class="flex min-w-48 flex-1 flex-col gap-2">
					<Label for="lot-name">Name</Label>
					<Input
						id="lot-name"
						value={lot.name}
						class="h-9"
						onchange={(event) =>
							store.updateLot(lot.id, { name: event.currentTarget.value.trim() || lot.name })}
					/>
				</div>
				<div class="flex flex-col gap-2">
					<Label for="lot-date">Acquired on</Label>
					<Input
						id="lot-date"
						type="date"
						value={lot.acquiredOn ?? ''}
						class="h-9"
						onchange={(event) =>
							store.updateLot(lot.id, { acquiredOn: event.currentTarget.value || null })}
					/>
				</div>
				<div class="flex min-w-64 flex-[2] flex-col gap-2">
					<Label for="lot-note">Note</Label>
					<Input
						id="lot-note"
						value={lot.note ?? ''}
						class="h-9"
						placeholder="Where it came from, what it cost…"
						onchange={(event) =>
							store.updateLot(lot.id, { note: event.currentTarget.value.trim() || null })}
					/>
				</div>
			</div>
		{/if}

		<Card.Root>
			<Card.Content class="flex flex-wrap items-end gap-3 py-4">
				<div class="flex min-w-64 flex-1 flex-col gap-2">
					<Label>Add to this lot</Label>
					<QuickAddBar catalogue={data.catalogue} onadd={quickAdd} />
				</div>
				<div class="flex flex-col gap-2">
					<Label>Finish</Label>
					<Select.Root
						type="single"
						value={addFinish}
						onValueChange={(v) => (addFinish = (v as CardVariant) ?? 'normal')}
					>
						<Select.Trigger class="w-36">{VARIANT_LABELS[addFinish]}</Select.Trigger>
						<Select.Content>
							{#each Object.entries(VARIANT_LABELS) as [value, label] (value)}
								<Select.Item {value}>{label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</Card.Content>
		</Card.Root>

		<div class="grid grid-cols-3 gap-3">
			<StatTile label="Cards" value={stats.cards} />
			<StatTile label="Printings" value={stats.printings} />
			<StatTile label="Sets" value={stats.sets} />
		</div>

		{#if entries.length === 0}
			<p class="text-muted-foreground py-16 text-center text-sm">
				Nothing in this lot yet — type a set code and number above, like <span class="font-mono">MEG 21</span>.
			</p>
		{:else}
			<Tabs.Root value="grid">
				<Tabs.List>
					<Tabs.Trigger value="grid">Grid</Tabs.Trigger>
					<Tabs.Trigger value="list">List &amp; move</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="grid" class="pt-3">
					<div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
						{#each tiles as tile, index (tile.card.id)}
							<div in:fly|global={{ y: 8, duration: 200, delay: Math.min(index, 20) * 12 }}>
								<CardTile card={tile.card} owned={tile.total} onclick={() => open(tile.card)} />
							</div>
						{/each}
					</div>
				</Tabs.Content>

				<Tabs.Content value="list" class="flex flex-col gap-1.5 pt-3">
					{#each entries as entry (entry.key)}
						<div class="hover:bg-accent/50 flex items-center gap-3 rounded-lg p-1.5 transition-colors">
							<button type="button" onclick={() => open(entry.card)} class="shrink-0">
								<CardImage card={entry.card} class="h-11 w-8 rounded" />
							</button>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium">{entry.card.name}</p>
								<p class="text-muted-foreground truncate text-xs">
									{entry.card.set.ptcglCode ?? entry.card.set.id} · #{entry.card.localId} ·
									{VARIANT_LABELS[entry.row.variant]}
								</p>
							</div>
							<div class="flex items-center gap-1">
								<Button
									variant="outline"
									size="icon"
									class="size-7"
									aria-label="Remove one"
									onclick={() => adjust(entry.card.id, entry.row.variant, entry.row.quantity, -1)}
								>
									<Minus class="size-3" />
								</Button>
								<span class="w-6 text-center text-sm font-semibold tabular-nums">
									{entry.row.quantity}
								</span>
								<Button
									variant="outline"
									size="icon"
									class="size-7"
									aria-label="Add one"
									onclick={() => adjust(entry.card.id, entry.row.variant, entry.row.quantity, 1)}
								>
									<Plus class="size-3" />
								</Button>
							</div>
							<LotPicker
								value={lotId ?? ''}
								allowCreate
								size="sm"
								class="w-36"
								onchange={(target) => move(entry.key, entry.row.quantity, target)}
							/>
						</div>
					{/each}
				</Tabs.Content>
			</Tabs.Root>
		{/if}
	</div>

	<CardDetailSheet bind:card={selected} bind:open={sheetOpen} {lotId} />

	<Dialog.Root bind:open={deleteOpen}>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>Delete “{title}”?</Dialog.Title>
				<Dialog.Description>
					The lot holds {stats.cards} card{stats.cards === 1 ? '' : 's'}. Keep them in your
					collection as Unsorted, or remove them too?
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer class="gap-2">
				<Button variant="outline" onclick={() => remove('unsorted')}>Move cards to Unsorted</Button>
				<Button variant="destructive" onclick={() => remove('remove')}>Delete cards too</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}
