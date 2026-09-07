<script lang="ts" module>
	/**
	 * The red badge on a card a deck is short of, and the menu that clears it.
	 *
	 * A shortfall is only ever resolved two ways: the copies were already in a binder and
	 * never got recorded, or they still have to be bought. Both are one tap from here, so
	 * a deck can be reconciled without leaving the deck page. Requirements count by card
	 * *name* (any printing counts), so copies land on the printing the deck asks for —
	 * which is also the one the user is looking at.
	 *
	 * The two writes are exported so a page can offer them in bulk ("put the whole buylist
	 * on my wants") without re-deriving which finish to record.
	 */
	import { pickVariant } from '$lib/tcg/quick-add';
	import { store } from '$lib/store.svelte';
	import type { Card } from '$lib/types';

	/** The finish a shop hands you, unless this printing does not come in it. */
	export const plainFinish = (card: Card) => pickVariant(card, null, 'normal');

	/**
	 * Make sure at least `missing` copies are on the default wants list. Absolute, not
	 * cumulative: two decks short of the same card ask for the larger number, not the sum.
	 * Returns false when the list already covered it.
	 */
	export function wantMissing(card: Card, missing: number): boolean {
		const variant = plainFinish(card);
		const already = store.want({ cardId: card.id, variant })?.quantity ?? 0;
		if (already >= missing) return false;
		store.setWant({ cardId: card.id, variant, quantity: missing });
		return true;
	}

	/** Record copies that were owned all along, into one lot (`null` is Unsorted). */
	export function fileOwned(card: Card, missing: number, lotId: string | null) {
		store.addOwned([{ cardId: card.id, variant: plainFinish(card), quantity: missing, lotId }], 'add');
	}
</script>

<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { buttonVariants } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import Heart from '@lucide/svelte/icons/heart';
	import Package from '@lucide/svelte/icons/package';
	import Info from '@lucide/svelte/icons/info';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { folderTrail } from '$lib/data/folders';
	import { cn } from '$lib/utils';
	import { VARIANT_LABELS } from '$lib/types';

	let {
		card,
		missing,
		ondetails,
		compact = false,
		class: className
	}: {
		card: Card;
		/** Copies still needed — the number on the badge. */
		missing: number;
		/** Opens the card sheet, for anything the two quick actions do not cover. */
		ondetails?: () => void;
		/** Just the number, for a badge sitting on top of the art. */
		compact?: boolean;
		class?: string;
	} = $props();

	/** Grouped by folder, so two lots with the same name are told apart by their trail. */
	const lots = $derived(
		store.lots
			.map((lot) => ({ ...lot, trail: folderTrail(store.lotFolders, lot.folderId) }))
			.sort((a, b) => a.trail.localeCompare(b.trail) || a.name.localeCompare(b.name))
	);

	function markOwned(lotId: string | null) {
		try {
			fileOwned(card, missing, lotId);
			const where = lotId ? (store.lot(lotId)?.name ?? 'that lot') : 'Unsorted';
			toast.success(
				`Added ${missing}× ${card.name} (${VARIANT_LABELS[plainFinish(card)]}) to ${where}`
			);
		} catch (error) {
			toast.error((error as Error).message);
		}
	}

	function addWant() {
		try {
			if (wantMissing(card, missing)) toast.success(`Want ${missing}× ${card.name} — added to your list`);
			else toast.info(`${card.name} is already on your wants list`);
		} catch (error) {
			toast.error((error as Error).message);
		}
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class={cn(
			buttonVariants({ variant: 'destructive', size: 'sm' }),
			'shrink-0 gap-1 tabular-nums',
			// Over the art it has to read against whatever is behind it, so it goes solid.
			compact
				? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 h-6 rounded-full px-2 text-xs font-semibold shadow'
				: 'h-7 px-2 text-xs',
			className
		)}
		aria-label="{missing} missing — resolve {card.name}"
		title="{missing} missing — record copies you own, or put them on your wants list"
	>
		{#if compact}
			−{missing}
		{:else}
			<TriangleAlert class="size-3" />
			{missing} missing
		{/if}
	</DropdownMenu.Trigger>

	<!-- On the art the badge hugs the left corner, so the menu has to open rightwards;
	     in a row it sits at the right-hand end and opens the other way. -->
	<DropdownMenu.Content
		align={compact ? 'start' : 'end'}
		class="max-h-96 w-60 overflow-y-auto"
	>
		<DropdownMenu.Group>
			<DropdownMenu.GroupHeading class="truncate">
				{missing}× {card.name} short
			</DropdownMenu.GroupHeading>

			<DropdownMenu.Item onclick={addWant}>
				<Heart class="size-4" />
				Add {missing} to wants
			</DropdownMenu.Item>
		</DropdownMenu.Group>

		<DropdownMenu.Separator />

		<!-- "I have these, they were never logged" — the lot is where they physically sit. -->
		<DropdownMenu.Group>
			<DropdownMenu.GroupHeading>I own {missing} — file under</DropdownMenu.GroupHeading>
			<DropdownMenu.Item onclick={() => markOwned(null)}>
				<Package class="size-4" />
				Unsorted
			</DropdownMenu.Item>
			{#each lots as lot (lot.id)}
				<DropdownMenu.Item onclick={() => markOwned(lot.id)}>
					{#if lot.icon}
						<span class="w-4 text-center text-sm leading-none">{lot.icon}</span>
					{:else}
						<Package class="size-4" />
					{/if}
					<span class="truncate">
						{#if lot.trail}<span class="text-muted-foreground">{lot.trail} › </span>{/if}{lot.name}
					</span>
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Group>

		{#if ondetails}
			<DropdownMenu.Separator />
			<DropdownMenu.Item onclick={ondetails}>
				<Info class="size-4" />
				Card details…
			</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
