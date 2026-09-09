<script lang="ts">
	/**
	 * A basic energy card that has no scan of its own.
	 *
	 * TCGdex publishes no artwork for 161 basic energy printings — every Scarlet & Violet
	 * one included — so those tiles used to be the card's name in a grey box: the one kind
	 * of card that is recognisable from its face alone, shown as text. This shows the real
	 * card instead, borrowed from the type's current printing (see `energyArt`).
	 *
	 * If that picture cannot load — offline before it was ever cached, or one of the two
	 * types never printed as a basic energy — it draws the card instead: the type's colour
	 * and a big pip, sized in percentages so the same markup reads at a 32px list
	 * thumbnail and at the detail sheet's 300px. Those pips are lucide icons standing in
	 * for the printed symbols, near enough to tell Fire from Water at a glance. Their
	 * colours come from the same `typeColor` table as the attack-cost pips, so an energy
	 * tile and an attack cost agree, and that table already pairs each colour with a
	 * readable foreground.
	 */
	import Circle from '@lucide/svelte/icons/circle';
	import Cog from '@lucide/svelte/icons/cog';
	import Droplet from '@lucide/svelte/icons/droplet';
	import Eye from '@lucide/svelte/icons/eye';
	import Flame from '@lucide/svelte/icons/flame';
	import HandFist from '@lucide/svelte/icons/hand-fist';
	import Leaf from '@lucide/svelte/icons/leaf';
	import Moon from '@lucide/svelte/icons/moon';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Star from '@lucide/svelte/icons/star';
	import Tornado from '@lucide/svelte/icons/tornado';
	import Zap from '@lucide/svelte/icons/zap';
	import { typeColor } from '$lib/card-details';
	import { energyArt, type EnergyType } from '$lib/tcg/energy';
	import { cn } from '$lib/utils';

	let {
		type,
		label,
		eager = false,
		class: className
	}: {
		type: EnergyType;
		/** What a screen reader should hear; the card's own name when there is one. */
		label?: string;
		eager?: boolean;
		class?: string;
	} = $props();

	const ICONS: Record<EnergyType, typeof Circle> = {
		Grass: Leaf,
		Fire: Flame,
		Water: Droplet,
		Lightning: Zap,
		Psychic: Eye,
		Fighting: HandFist,
		Darkness: Moon,
		Metal: Cog,
		Fairy: Sparkles,
		Dragon: Tornado,
		Colorless: Star
	};

	const Icon = $derived(ICONS[type] ?? Circle);
	const src = $derived(energyArt(type));
	const alt = $derived(label ?? `${type} Energy`);

	let failed = $state(false);
	// Reset when the component is reused for a different type.
	$effect(() => {
		void src;
		failed = false;
	});
</script>

{#if src && !failed}
	<!-- crossorigin so the worker sees a real status and caches the scan; see the
	     images.pokemontcg.io rule in vite.config.ts. -->
	<img
		{src}
		{alt}
		crossorigin="anonymous"
		loading={eager ? 'eager' : 'lazy'}
		decoding="async"
		onerror={() => (failed = true)}
		class={cn('object-cover', className)}
	/>
{:else}
	<div
		role="img"
		aria-label={alt}
		class={cn(
			'from-muted to-muted/50 ring-border/50 grid place-items-center bg-gradient-to-b ring-1 ring-inset',
			className
		)}
	>
		<div
			class={cn(
				'grid aspect-square w-[58%] place-items-center rounded-full text-white shadow-sm',
				typeColor(type)
			)}
		>
			<Icon class="size-[56%]" strokeWidth={2.25} aria-hidden="true" />
		</div>
	</div>
{/if}
