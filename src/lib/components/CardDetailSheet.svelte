<script lang="ts">
	/**
	 * Everything about one printing, plus the counters that record copies of it.
	 *
	 * Two shells, same contents: a sheet that slides in from the right, or a centred
	 * dialog with the art shown large beside the details. Which one is used is a
	 * per-device preference (Settings → Card view, see prefs.svelte.ts); the snippets
	 * below are shared so the two can never drift apart.
	 */
	import { base } from '$app/paths';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from 'svelte-sonner';
	import { fly } from 'svelte/transition';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import Heart from '@lucide/svelte/icons/heart';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import Brush from '@lucide/svelte/icons/brush';
	import Package from '@lucide/svelte/icons/package';
	import Shield from '@lucide/svelte/icons/shield';
	import Footprints from '@lucide/svelte/icons/footprints';
	import X from '@lucide/svelte/icons/x';
	import CardImage from './CardImage.svelte';
	import EnergyPip from './EnergyPip.svelte';
	import LotPicker from './LotPicker.svelte';
	import { loadCardText, loadPrices, formatPrice, type CardText, type MarketPrice } from '$lib/card-details';
	import { prefs } from '$lib/prefs.svelte';
	import { rowKey, store } from '$lib/store.svelte';
	import { cn } from '$lib/utils';
	import { sortVariants, VARIANT_LABELS, type Card, type CardVariant } from '$lib/types';

	let {
		card = $bindable(),
		open = $bindable(false),
		lotId = null
	}: {
		card: Card | null;
		open: boolean;
		/** The lot the +/- buttons act on by default — the lot page passes its own. */
		lotId?: string | null;
	} = $props();

	/** Lot the counters edit; '' is Unsorted (see LotPicker). Reset when the sheet opens. */
	let targetLot = $state('');
	$effect(() => {
		if (open) targetLot = lotId ?? '';
	});
	const targetLotId = $derived(targetLot === '' ? null : targetLot);

	/**
	 * Where the copies sit: one line per lot and finish — the same rows the collection
	 * stores, which is what a move has to act on. Doubles as the breakdown under the
	 * counters and as the source list for "move to another lot".
	 */
	const lotRows = $derived.by(() => {
		if (!card) return [];
		return store.collection
			.filter((row) => row.cardId === card!.id)
			.map((row) => ({
				key: rowKey(row),
				lotId: row.lotId,
				lot: row.lotId ?? '',
				variant: row.variant,
				quantity: row.quantity,
				name: row.lotId ? (store.lot(row.lotId)?.name ?? 'Unknown lot') : 'Unsorted',
				icon: row.lotId ? (store.lot(row.lotId)?.icon ?? null) : null
			}))
			.sort((a, b) => a.name.localeCompare(b.name) || a.variant.localeCompare(b.variant));
	});

	/** Per-row "how many to move", keyed by row key. Unset means every copy. */
	let moveCount = $state<Record<string, number>>({});

	// A fresh printing (or a reopened sheet) starts from "move them all" again.
	$effect(() => {
		void card?.id;
		void open;
		moveCount = {};
	});

	function moveTo(row: (typeof lotRows)[number], target: string) {
		const toLotId = target === '' ? null : target;
		if (toLotId === row.lotId) return;

		// An emptied or half-typed box means "all of them" rather than a broken quantity.
		const typed = moveCount[row.key];
		const wanted = Number.isFinite(typed) ? Math.floor(typed) : row.quantity;
		const quantity = Math.min(Math.max(wanted, 1), row.quantity);
		try {
			store.moveOwned(row.key, toLotId, quantity);
			const name = toLotId ? (store.lot(toLotId)?.name ?? 'that lot') : 'Unsorted';
			toast.success(`Moved ${quantity}× ${card?.name} (${VARIANT_LABELS[row.variant]}) to ${name}`);
			// The counters follow the cards, so the next +/- lands where they went, and the
			// boxes go back to "all of them" — a partial move left the old number too high.
			targetLot = target;
			moveCount = {};
		} catch (error) {
			toast.error((error as Error).message);
		}
	}

	let text = $state<CardText | null>(null);
	let prices = $state<MarketPrice[] | null>(null);
	let priceError = $state<string | null>(null);

	// Rules text ships with the app, one file per set; prices are live. Loading them
	// separately means an offline card still shows its attacks — see card-details.ts.
	$effect(() => {
		if (!open || !card) return;
		const { id, set, localId } = card;

		text = null;
		prices = null;
		priceError = null;

		let cancelled = false;

		loadCardText(set.id, localId).then((result) => {
			if (!cancelled) text = result;
		});

		loadPrices(id)
			.then((result) => {
				if (!cancelled) prices = result;
			})
			.catch((error: Error) => {
				if (!cancelled) priceError = error.message;
			});

		return () => {
			cancelled = true;
		};
	});

	const hasText = $derived(
		Boolean(text && (text.abilities.length || text.attacks.length || text.effect))
	);

	// Offer the finishes this printing exists in, plus any the user already recorded —
	// so nothing becomes uneditable if the catalogue changes under them.
	const variants = $derived.by(() => {
		if (!card) return [] as CardVariant[];
		const recorded = store.collection
			.filter((entry) => entry.cardId === card!.id)
			.map((entry) => entry.variant);
		const all = new Set<CardVariant>([...card.variants, ...recorded]);
		return all.size ? sortVariants([...all]) : (['normal'] as CardVariant[]);
	});

	const ownedTotal = $derived(card ? store.ownedTotal(card.id) : 0);
	const wantedTotal = $derived(card ? store.wantedTotal(card.id) : 0);
	const tradedTotal = $derived(card ? store.tradedTotal(card.id) : 0);

	/**
	 * The arrows are the same kind of shortcut for the trade binder: one spare copy of
	 * this finish offered, or the entry taken out again. How many is for the binder page.
	 */
	function toggleTrade(variant: CardVariant) {
		if (!card) return;
		try {
			if (store.trade({ cardId: card.id, variant })) store.removeTrade({ cardId: card.id, variant });
			else store.setTrade({ cardId: card.id, variant, quantity: 1 });
		} catch (error) {
			toast.error((error as Error).message);
		}
	}

	/**
	 * The heart is a shortcut: one copy of this finish on, or off, the default wants
	 * list. Which list, and how many, is what the Wants page is for.
	 */
	function toggleWant(variant: CardVariant) {
		if (!card) return;
		try {
			if (store.want({ cardId: card.id, variant })) store.removeWant({ cardId: card.id, variant });
			else store.setWant({ cardId: card.id, variant, quantity: 1 });
		} catch (error) {
			toast.error((error as Error).message);
		}
	}

	function adjust(variant: CardVariant, delta: number) {
		if (!card) return;
		try {
			const current = store.ownedOf(card.id, variant, targetLotId);
			store.setOwned(card.id, variant, current + delta, targetLotId);
		} catch (error) {
			toast.error((error as Error).message);
		}
	}
</script>

{#snippet titleText(card: Card)}
	{card.name}
	{#if card.hp}
		<span class="text-muted-foreground text-sm font-normal">{card.hp} HP</span>
	{/if}
{/snippet}

{#snippet subtitleText(card: Card)}
	{card.set.name} · #{card.localId}{card.set.cardCount ? `/${card.set.cardCount}` : ''}
	{#if card.rarity}· {card.rarity}{/if}
{/snippet}

{#snippet details(card: Card)}
	<!-- Live market prices; the only part that needs a connection -->
	{#if prices === null && !priceError}
		<div class="grid grid-cols-2 gap-2">
			<Skeleton class="h-[74px] rounded-lg" />
			<Skeleton class="h-[74px] rounded-lg" />
		</div>
	{:else if prices?.length}
		<div class="grid grid-cols-2 gap-2" in:fly={{ y: 6, duration: 200 }}>
			{#each prices as price (price.source)}
				<div class="rounded-lg border p-2.5">
					<p class="text-muted-foreground text-xs">{price.source}</p>
					<p class="text-lg font-semibold tabular-nums">{formatPrice(price)}</p>
					{#if price.low !== null}
						<p class="text-muted-foreground text-xs">
							from {formatPrice(price, price.low)}
						</p>
					{/if}
				</div>
			{/each}
		</div>
	{:else if priceError}
		<p class="text-muted-foreground text-xs">Prices need a connection — {priceError}.</p>
	{/if}

	<div class="flex flex-wrap gap-1.5">
		<Badge variant="secondary">{card.supertype}</Badge>
		{#each card.subtypes as subtype (subtype)}
			<Badge variant="outline">{subtype}</Badge>
		{/each}
		{#each card.types as type (type)}
			<Badge variant="outline" class="gap-1 pl-1">
				<EnergyPip {type} class="size-4 text-[9px]" />
				{type}
			</Badge>
		{/each}
		{#if card.regulationMark}
			<Badge variant="outline">Reg {card.regulationMark}</Badge>
		{/if}
		{#if card.set.legalStandard}
			<Badge>Standard</Badge>
		{:else if card.set.legalExpanded}
			<Badge variant="secondary">Expanded</Badge>
		{/if}
	</div>

	{#if card.evolvesFrom}
		<p class="text-muted-foreground text-sm">Evolves from <b>{card.evolvesFrom}</b></p>
	{/if}

	<!-- Abilities and attacks -->
	{#if text}
		<div class="flex flex-col gap-4" in:fly={{ y: 6, duration: 200 }}>
			{#each text.abilities as ability (ability.name)}
				<div class="flex flex-col gap-1">
					<p class="flex items-center gap-2 text-sm font-semibold">
						<Badge variant="secondary" class="text-[10px]">{ability.type}</Badge>
						{ability.name}
					</p>
					<p class="text-muted-foreground text-sm leading-relaxed">{ability.effect}</p>
				</div>
			{/each}

			{#each text.attacks as attack (attack.name)}
				<div class="flex flex-col gap-1">
					<div class="flex items-center gap-2">
						<span class="flex gap-0.5">
							{#each attack.cost as type, i (`${type}-${i}`)}
								<EnergyPip {type} />
							{/each}
						</span>
						<p class="flex-1 text-sm font-semibold">{attack.name}</p>
						{#if attack.damage}
							<span class="text-base font-bold tabular-nums">{attack.damage}</span>
						{/if}
					</div>
					{#if attack.effect}
						<p class="text-muted-foreground text-sm leading-relaxed">{attack.effect}</p>
					{/if}
				</div>
			{/each}

			{#if text.effect}
				<p class="text-muted-foreground text-sm leading-relaxed">{text.effect}</p>
			{/if}

			{#if text.weaknesses.length || text.retreat !== null}
				<div class="text-muted-foreground flex flex-wrap items-center gap-4 text-sm">
					{#each text.weaknesses as weakness (weakness.type)}
						<span class="flex items-center gap-1.5">
							<Shield class="size-3.5" />
							Weakness
							<EnergyPip type={weakness.type} class="size-4 text-[9px]" />
							{weakness.value ?? ''}
						</span>
					{/each}
					{#if text.retreat !== null}
						<span class="flex items-center gap-1.5">
							<Footprints class="size-3.5" /> Retreat {text.retreat}
						</span>
					{/if}
				</div>
			{/if}

			{#if text.illustrator}
				<p class="text-muted-foreground flex items-center gap-1.5 text-xs">
					<Brush class="size-3.5" /> {text.illustrator}
				</p>
			{/if}

			{#if !hasText}
				<p class="text-muted-foreground text-sm">No rules text recorded for this printing.</p>
			{/if}
		</div>
	{:else}
		<div class="flex flex-col gap-2">
			<Skeleton class="h-4 w-2/5" />
			<Skeleton class="h-4 w-full" />
			<Skeleton class="h-4 w-4/5" />
		</div>
	{/if}
{/snippet}

{#snippet collection(card: Card)}
	<div class="flex flex-col gap-3">
		<h3 class="flex items-center justify-between text-sm font-medium">
			In your collection
			<span class="text-muted-foreground tabular-nums">{ownedTotal} total</span>
		</h3>
		<div class="flex items-center justify-between gap-3">
			<span class="text-muted-foreground text-xs">Counting into</span>
			<LotPicker bind:value={targetLot} allowCreate size="sm" class="w-40" />
		</div>
		{#each variants as variant (variant)}
			{@const owned = store.ownedOf(card.id, variant, targetLotId)}
			{@const wanted = store.want({ cardId: card.id, variant })?.quantity ?? 0}
			{@const offered = store.trade({ cardId: card.id, variant })?.quantity ?? 0}
			<div class="flex items-center justify-between gap-3">
				<span class="text-sm">{VARIANT_LABELS[variant]}</span>
				<div class="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						class={cn('size-8', wanted > 0 && 'text-primary')}
						onclick={() => toggleWant(variant)}
						title={wanted > 0 ? `On your wants list (${wanted})` : 'Add to your wants list'}
						aria-label={`${wanted > 0 ? 'Remove' : 'Add'} ${VARIANT_LABELS[variant]} ${wanted > 0 ? 'from' : 'to'} wants`}
					>
						<Heart class={cn('size-3.5', wanted > 0 && 'fill-current')} />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						class={cn('mr-1 size-8', offered > 0 && 'text-primary')}
						onclick={() => toggleTrade(variant)}
						title={offered > 0 ? `In your trade binder (${offered})` : 'Offer a spare copy for trade'}
						aria-label={`${offered > 0 ? 'Remove' : 'Add'} ${VARIANT_LABELS[variant]} ${offered > 0 ? 'from' : 'to'} the trade binder`}
					>
						<ArrowLeftRight class={cn('size-3.5', offered > 0 && 'stroke-[2.5]')} />
					</Button>
					<Button
						variant="outline"
						size="icon"
						class="size-8"
						disabled={owned === 0}
						onclick={() => adjust(variant, -1)}
						aria-label={`Remove one ${VARIANT_LABELS[variant]}`}
					>
						<Minus class="size-3.5" />
					</Button>
					<span class="w-8 text-center text-sm font-semibold tabular-nums">{owned}</span>
					<Button
						variant="outline"
						size="icon"
						class="size-8"
						onclick={() => adjust(variant, 1)}
						aria-label={`Add one ${VARIANT_LABELS[variant]}`}
					>
						<Plus class="size-3.5" />
					</Button>
				</div>
			</div>
		{/each}

		{#if wantedTotal > 0 || tradedTotal > 0}
			<div class="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
				{#if wantedTotal > 0}
					<a href="{base}/wants" class="hover:text-foreground underline-offset-2 hover:underline">
						{wantedTotal} on your wants list
					</a>
				{/if}
				{#if tradedTotal > 0}
					<a href="{base}/trades" class="hover:text-foreground underline-offset-2 hover:underline">
						{tradedTotal} in your trade binder
					</a>
				{/if}
			</div>
		{/if}

		<!-- Where the copies sit, and the one control that shifts them: pick another lot
		     on a line and that many copies move there (store.moveOwned). -->
		{#if lotRows.length > 0}
			<Separator />

			<div class="flex flex-col gap-2">
				<h3 class="text-sm font-medium">
					Across your lots
					<span class="text-muted-foreground text-xs font-normal">
						— pick another lot to move copies there
					</span>
				</h3>

				{#each lotRows as row, index (row.key)}
					<!-- The picker drops to its own line on a phone rather than squeezing the lot
					     name, so a rule keeps the two-line rows apart. -->
					<div class={cn('flex flex-wrap items-center gap-2', index > 0 && 'border-t pt-2')}>
						<button
							type="button"
							class="min-w-0 flex-1 text-left"
							title="Count into {row.name}"
							aria-label="Count into {row.name}"
							onclick={() => (targetLot = row.lot)}
						>
							<p class="flex items-center gap-1.5">
								{#if row.icon}
									<span class="shrink-0 text-sm leading-none">{row.icon}</span>
								{:else}
									<Package class="text-muted-foreground size-3.5 shrink-0" />
								{/if}
								<span
									class={cn(
										'truncate text-sm underline-offset-2 hover:underline',
										row.lotId === targetLotId && 'font-medium'
									)}
								>
									{row.name}
								</span>
							</p>
							<p class="text-muted-foreground truncate text-xs">{VARIANT_LABELS[row.variant]}</p>
						</button>

						<!-- How many of this line's copies to take. All of them unless told otherwise. -->
						{#if row.quantity > 1}
							<Input
								type="number"
								min="1"
								max={row.quantity}
								value={moveCount[row.key] ?? row.quantity}
								class="h-8 w-14 px-2 text-center tabular-nums"
								aria-label="Copies of {VARIANT_LABELS[row.variant]} to move out of {row.name}"
								oninput={(event) =>
									(moveCount[row.key] = Math.min(
										Math.max(Math.floor(event.currentTarget.valueAsNumber), 1),
										row.quantity
									))}
							/>
						{:else}
							<span class="w-14 text-center text-sm font-semibold tabular-nums">1</span>
						{/if}

						<LotPicker
							value={row.lot}
							allowCreate
							size="sm"
							class="w-full shrink-0 sm:w-32"
							onchange={(target) => moveTo(row, target)}
						/>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

{#if prefs.cardView === 'center'}
	<Dialog.Root bind:open>
		<!-- One panel, capped to the viewport: the art column stays put and only the
		     details scroll on a wide screen; below md the whole thing stacks and scrolls. -->
		<Dialog.Content
			class="max-h-[92svh] gap-0 overflow-hidden p-0 sm:max-w-3xl"
			showCloseButton={false}
		>
			{#if card}
				<div
					class="grid max-h-[92svh] overflow-y-auto md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:overflow-hidden"
				>
					<div class="bg-muted/40 flex items-start justify-center border-b p-5 md:border-r md:border-b-0 md:p-6">
						<CardImage
							{card}
							quality="high"
							eager
							class="aspect-[63/88] w-56 max-w-full rounded-xl shadow-lg md:w-full"
						/>
					</div>

					<div class="flex min-h-0 flex-col md:overflow-hidden">
						<!-- Name and set stay put while the rest scrolls. Close lives in here rather
						     than in the panel corner, which the sticky header would cover. -->
						<Dialog.Header
							class="bg-popover sticky top-0 z-10 gap-1 border-b p-5 pr-14 md:p-6 md:pb-4"
						>
							<Dialog.Title class="flex items-center gap-2">
								{@render titleText(card)}
							</Dialog.Title>
							<Dialog.Description>{@render subtitleText(card)}</Dialog.Description>
							<Dialog.Close>
								{#snippet child({ props })}
									<Button variant="ghost" size="icon-sm" class="absolute top-4 right-4" {...props}>
										<X />
										<span class="sr-only">Close</span>
									</Button>
								{/snippet}
							</Dialog.Close>
						</Dialog.Header>

						<div class="flex flex-col gap-5 p-5 md:overflow-y-auto md:p-6">
							{@render details(card)}

							<Separator />

							{@render collection(card)}
						</div>
					</div>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Sheet.Root bind:open>
		<Sheet.Content side="right" class="w-full gap-0 overflow-y-auto sm:max-w-lg">
			{#if card}
				<Sheet.Header class="pb-2">
					<Sheet.Title class="flex items-center gap-2">
						{@render titleText(card)}
					</Sheet.Title>
					<Sheet.Description>{@render subtitleText(card)}</Sheet.Description>
				</Sheet.Header>

				<div class="flex flex-col gap-5 p-4">
					<CardImage
						{card}
						quality="high"
						eager
						class="mx-auto aspect-[63/88] w-64 max-w-full rounded-xl shadow-lg"
					/>

					{@render details(card)}

					<Separator />

					{@render collection(card)}
				</div>
			{/if}
		</Sheet.Content>
	</Sheet.Root>
{/if}
