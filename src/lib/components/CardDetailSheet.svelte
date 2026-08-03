<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from 'svelte-sonner';
	import { fly } from 'svelte/transition';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import Brush from '@lucide/svelte/icons/brush';
	import Shield from '@lucide/svelte/icons/shield';
	import Footprints from '@lucide/svelte/icons/footprints';
	import CardImage from './CardImage.svelte';
	import EnergyPip from './EnergyPip.svelte';
	import { loadCardDetail, formatPrice, type CardDetail } from '$lib/card-details';
	import { store } from '$lib/store.svelte';
	import { VARIANT_LABELS, type Card, type CardVariant } from '$lib/types';

	let {
		card = $bindable(),
		open = $bindable(false)
	}: { card: Card | null; open: boolean } = $props();

	let detail = $state<CardDetail | null>(null);
	let detailError = $state<string | null>(null);

	// Full card text and prices are fetched per card rather than bundled — see
	// src/lib/card-details.ts. Repeat opens are served from its cache.
	$effect(() => {
		const id = card?.id;
		if (!open || !id) return;

		detail = null;
		detailError = null;

		let cancelled = false;
		loadCardDetail(id)
			.then((result) => {
				if (!cancelled) detail = result;
			})
			.catch((error: Error) => {
				if (!cancelled) detailError = error.message;
			});

		return () => {
			cancelled = true;
		};
	});

	// Offer the finishes this printing exists in, plus any the user already recorded —
	// so nothing becomes uneditable if the catalogue changes under them.
	const variants = $derived.by(() => {
		if (!card) return [] as CardVariant[];
		const recorded = store.collection
			.filter((entry) => entry.cardId === card!.id)
			.map((entry) => entry.variant);
		const all = new Set<CardVariant>([...card.variants, ...recorded]);
		return all.size ? [...all] : (['normal'] as CardVariant[]);
	});

	const ownedTotal = $derived(card ? store.ownedTotal(card.id) : 0);

	function adjust(variant: CardVariant, delta: number) {
		if (!card) return;
		try {
			store.setOwned(card.id, variant, store.ownedOf(card.id, variant) + delta);
		} catch (error) {
			toast.error((error as Error).message);
		}
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="w-full gap-0 overflow-y-auto sm:max-w-lg">
		{#if card}
			<Sheet.Header class="pb-2">
				<Sheet.Title class="flex items-center gap-2">
					{card.name}
					{#if card.hp}
						<span class="text-muted-foreground text-sm font-normal">{card.hp} HP</span>
					{/if}
				</Sheet.Title>
				<Sheet.Description>
					{card.set.name} · #{card.localId}{card.set.cardCount ? `/${card.set.cardCount}` : ''}
					{#if card.rarity}· {card.rarity}{/if}
				</Sheet.Description>
			</Sheet.Header>

			<div class="flex flex-col gap-5 p-4">
				<CardImage
					{card}
					quality="high"
					eager
					class="mx-auto aspect-[63/88] w-64 max-w-full rounded-xl shadow-lg"
				/>

				<!-- Market prices, straight from TCGdex -->
				{#if detail?.prices.length}
					<div class="grid grid-cols-2 gap-2" in:fly={{ y: 6, duration: 200 }}>
						{#each detail.prices as price (price.source)}
							<div class="rounded-lg border p-2.5">
								<p class="text-muted-foreground text-xs">{price.source}</p>
								<p class="text-lg font-semibold tabular-nums">{formatPrice(price)}</p>
								{#if price.low !== null}
									<p class="text-muted-foreground text-xs">
										from {formatPrice({ ...price, price: price.low })}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				{:else if !detail && !detailError}
					<div class="grid grid-cols-2 gap-2">
						<Skeleton class="h-[74px] rounded-lg" />
						<Skeleton class="h-[74px] rounded-lg" />
					</div>
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
				{#if detail}
					<div class="flex flex-col gap-4" in:fly={{ y: 6, duration: 200 }}>
						{#each detail.abilities as ability (ability.name)}
							<div class="flex flex-col gap-1">
								<p class="flex items-center gap-2 text-sm font-semibold">
									<Badge variant="secondary" class="text-[10px]">{ability.type}</Badge>
									{ability.name}
								</p>
								<p class="text-muted-foreground text-sm leading-relaxed">{ability.effect}</p>
							</div>
						{/each}

						{#each detail.attacks as attack (attack.name)}
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

						{#if detail.effect}
							<p class="text-muted-foreground text-sm leading-relaxed">{detail.effect}</p>
						{/if}

						{#if detail.weaknesses.length || detail.retreat !== null}
							<div class="text-muted-foreground flex flex-wrap items-center gap-4 text-sm">
								{#each detail.weaknesses as weakness (weakness.type)}
									<span class="flex items-center gap-1.5">
										<Shield class="size-3.5" />
										Weakness
										<EnergyPip type={weakness.type} class="size-4 text-[9px]" />
										{weakness.value ?? ''}
									</span>
								{/each}
								{#if detail.retreat !== null}
									<span class="flex items-center gap-1.5">
										<Footprints class="size-3.5" /> Retreat {detail.retreat}
									</span>
								{/if}
							</div>
						{/if}

						{#if detail.illustrator}
							<p class="text-muted-foreground flex items-center gap-1.5 text-xs">
								<Brush class="size-3.5" /> {detail.illustrator}
							</p>
						{/if}
					</div>
				{:else if detailError}
					<p class="text-muted-foreground text-sm">
						Attacks, abilities and prices need a connection — {detailError}.
					</p>
				{:else}
					<div class="flex flex-col gap-2">
						<Skeleton class="h-4 w-2/5" />
						<Skeleton class="h-4 w-full" />
						<Skeleton class="h-4 w-4/5" />
					</div>
				{/if}

				<Separator />

				<div class="flex flex-col gap-3">
					<h3 class="flex items-center justify-between text-sm font-medium">
						In your collection
						<span class="text-muted-foreground tabular-nums">{ownedTotal} total</span>
					</h3>
					{#each variants as variant (variant)}
						{@const owned = store.ownedOf(card.id, variant)}
						<div class="flex items-center justify-between gap-3">
							<span class="text-sm">{VARIANT_LABELS[variant]}</span>
							<div class="flex items-center gap-1">
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
				</div>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
