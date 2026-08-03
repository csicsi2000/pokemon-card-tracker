<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { toast } from 'svelte-sonner';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import CardImage from './CardImage.svelte';
	import { store } from '$lib/store.svelte';
	import { VARIANT_LABELS, type Card, type CardVariant } from '$lib/types';

	let {
		card = $bindable(),
		open = $bindable(false)
	}: { card: Card | null; open: boolean } = $props();

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
	<Sheet.Content side="right" class="w-full gap-0 overflow-y-auto sm:max-w-md">
		{#if card}
			<Sheet.Header>
				<Sheet.Title>{card.name}</Sheet.Title>
				<Sheet.Description>
					{card.set.name} · #{card.localId}
					{#if card.rarity}· {card.rarity}{/if}
				</Sheet.Description>
			</Sheet.Header>

			<div class="flex flex-col gap-5 p-4">
				<CardImage
					{card}
					quality="high"
					eager
					class="mx-auto aspect-[63/88] w-56 max-w-full rounded-xl shadow-lg"
				/>

				<div class="flex flex-wrap gap-1.5">
					<Badge variant="secondary">{card.supertype}</Badge>
					{#each card.subtypes as subtype (subtype)}
						<Badge variant="outline">{subtype}</Badge>
					{/each}
					{#each card.types as type (type)}
						<Badge variant="outline">{type}</Badge>
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

				<Separator />

				<div class="flex flex-col gap-3">
					<h3 class="text-sm font-medium">In your collection</h3>
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
