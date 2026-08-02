<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { toast } from 'svelte-sonner';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import type { CardVariant, CardWithSet } from '$lib/database.types';
	import { cardImage } from '$lib/tcg/queries';
	import { setCollectionQuantity } from '$lib/collection.svelte';

	let {
		card = $bindable(),
		open = $bindable(false),
		quantities = {},
		onchange,
		onclose
	}: {
		card: CardWithSet | null;
		open: boolean;
		/** Owned counts for this card keyed by variant. */
		quantities?: Partial<Record<CardVariant, number>>;
		onchange?: (cardId: string, variant: CardVariant, quantity: number) => void;
		/** Called after closing, but only if a quantity actually changed. */
		onclose?: () => void;
	} = $props();

	let dirty = $state(false);

	$effect(() => {
		if (open) return;
		if (dirty) {
			dirty = false;
			onclose?.();
		}
	});

	const VARIANT_LABELS: Record<CardVariant, string> = {
		normal: 'Normal',
		reverse: 'Reverse holo',
		holo: 'Holo',
		firstEdition: '1st edition',
		promo: 'Promo'
	};

	// Only offer the variants this printing actually exists in — plus any the user
	// already recorded, so nothing becomes uneditable after a data change.
	const variants = $derived.by(() => {
		if (!card) return [] as CardVariant[];
		const available = Object.entries(card.variants ?? {})
			.filter(([, enabled]) => enabled)
			.map(([key]) => key as CardVariant);
		const recorded = Object.keys(quantities) as CardVariant[];
		const all = new Set<CardVariant>([...available, ...recorded]);
		return all.size ? [...all] : (['normal'] as CardVariant[]);
	});

	let pending = $state<CardVariant | null>(null);

	async function adjust(variant: CardVariant, delta: number) {
		if (!card) return;
		const next = Math.max(0, (quantities[variant] ?? 0) + delta);

		pending = variant;
		try {
			await setCollectionQuantity(card.id, variant, next);
			dirty = true;
			onchange?.(card.id, variant, next);
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			pending = null;
		}
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="w-full gap-0 overflow-y-auto sm:max-w-md">
		{#if card}
			<Sheet.Header>
				<Sheet.Title>{card.name}</Sheet.Title>
				<Sheet.Description>
					{card.set?.name ?? card.set_id} · #{card.local_id}
					{#if card.rarity}· {card.rarity}{/if}
				</Sheet.Description>
			</Sheet.Header>

			<div class="flex flex-col gap-5 p-4">
				{#if card.image_url}
					<img
						src={cardImage(card.image_url, 'high')}
						alt={card.name}
						class="mx-auto w-56 max-w-full rounded-xl shadow-lg"
					/>
				{/if}

				<div class="flex flex-wrap gap-1.5">
					<Badge variant="secondary">{card.supertype}</Badge>
					{#each card.subtypes as subtype (subtype)}
						<Badge variant="outline">{subtype}</Badge>
					{/each}
					{#each card.types as type (type)}
						<Badge variant="outline">{type}</Badge>
					{/each}
					{#if card.regulation_mark}
						<Badge variant="outline">Reg {card.regulation_mark}</Badge>
					{/if}
					{#if card.set?.legal_standard}
						<Badge>Standard</Badge>
					{:else if card.set?.legal_expanded}
						<Badge variant="secondary">Expanded</Badge>
					{/if}
				</div>

				<Separator />

				<div class="flex flex-col gap-3">
					<h3 class="text-sm font-medium">In your collection</h3>
					{#each variants as variant (variant)}
						<div class="flex items-center justify-between gap-3">
							<span class="text-sm">{VARIANT_LABELS[variant]}</span>
							<div class="flex items-center gap-1">
								<Button
									variant="outline"
									size="icon"
									class="size-8"
									disabled={pending === variant || (quantities[variant] ?? 0) === 0}
									onclick={() => adjust(variant, -1)}
									aria-label={`Remove one ${VARIANT_LABELS[variant]}`}
								>
									<Minus class="size-3.5" />
								</Button>
								<span class="w-8 text-center text-sm font-semibold tabular-nums">
									{quantities[variant] ?? 0}
								</span>
								<Button
									variant="outline"
									size="icon"
									class="size-8"
									disabled={pending === variant}
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
