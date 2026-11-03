<script lang="ts">
	/**
	 * Card art, falling back to a drawn energy card (basic energy has no scans on TCGdex)
	 * and, failing that, to the card's name.
	 *
	 * TCGdex sometimes lists a card before its scan is published (brand-new sets),
	 * so a URL existing is no guarantee the image does — hence the error handler
	 * rather than just checking for a null URL.
	 *
	 * `crossorigin` is load-bearing, not decoration: without it the browser fetches
	 * no-cors and the service worker cannot tell a missing scan from a real one, so it
	 * caches the 404 and this card stays blank for weeks after the art appears. See the
	 * assets.tcgdex.net rule in vite.config.ts.
	 *
	 * A load that fails is retried through `healArtwork`, which re-fetches past the
	 * browser's HTTP cache (the CDN's 404s are marked cacheable for a year) with growing
	 * pauses between attempts, so a phone whose network is still waking up gets more
	 * than two seconds to come back. Only when the whole ladder fails does a fallback
	 * show — and even then the tile asks once more when the browser reports it is online
	 * again or the page is brought back into view, instead of staying blank until the
	 * next navigation while the detail sheet, asking for a different size of the same
	 * scan, loads it without trouble.
	 *
	 * A real scan always wins; the drawn energy card is only what an energy tile shows
	 * in place of the name box, which for most basic energy is immediately — those
	 * printings have no `image` at all, so there is nothing to ask for.
	 *
	 * With data saver on, a tile shows only art this device has cached and the open card
	 * makes do with the small scan (see `artForDataSaver`), and a failed load is not
	 * retried — each rung of the ladder is another download.
	 */
	import EnergyCardArt from './EnergyCardArt.svelte';
	import { cardImage } from '$lib/catalogue';
	import {
		HEAL_DELAYS_MS,
		artForDataSaver,
		healArtwork,
		isArtCached,
		onRetryChance
	} from '$lib/pwa/art';
	import { dataSaver } from '$lib/pwa/data-saver.svelte';
	import { energyType } from '$lib/tcg/energy';
	import { cn } from '$lib/utils';
	import type { Card } from '$lib/types';

	let {
		card,
		quality = 'low',
		class: className,
		eager = false
	}: {
		card: Card;
		quality?: 'low' | 'high';
		class?: string;
		eager?: boolean;
	} = $props();

	let failed = $state(false);
	/** Bumped whenever the <img> should be re-created and ask again. */
	let attempt = $state(0);
	/** Heals already spent on the current `src`; indexes the delay ladder. */
	let tries = 0;

	const saving = $derived(dataSaver.active);
	/** What data saver settled on; `undefined` while the cache is still being asked. */
	let saverSrc = $state<string | null | undefined>(undefined);
	$effect(() => {
		if (!saving) return;
		const urls = { low: cardImage(card, 'low'), high: cardImage(card, 'high') };
		let current = true;
		saverSrc = undefined;
		void artForDataSaver(urls, quality, (url) => isArtCached(url, globalThis.caches)).then(
			(url) => {
				if (current) saverSrc = url;
			}
		);
		return () => {
			current = false;
		};
	});

	const src = $derived(saving ? saverSrc : cardImage(card, quality));
	/** Non-null for an energy card whose type we can name — then we can draw it ourselves. */
	const energy = $derived(energyType(card));
	// Reset when the component is reused for a different printing.
	$effect(() => {
		void src;
		failed = false;
		attempt = 0;
		tries = 0;
	});

	// A tile that gave up listens for a reason to hope: back online, or looked at again.
	$effect(() => {
		if (!failed || saving) return;
		return onRetryChance(() => {
			tries = 0;
			failed = false;
			attempt += 1;
		});
	});

	async function onerror() {
		const url = src;
		if (!url || saving) {
			failed = true;
			return;
		}
		while (tries < HEAL_DELAYS_MS.length) {
			const rung = tries++;
			const healed = await healArtwork(url, {}, rung);
			if (src !== url) return; // the card changed under us meanwhile
			if (healed) {
				attempt += 1; // re-mount; if that load fails too, onerror resumes the ladder
				return;
			}
		}
		failed = true;
	}
</script>

{#if src === undefined}
	<!-- Data saver is checking the cache; a blank tile rather than a flash of the name. -->
	<div class={cn('bg-muted', className)}></div>
{:else if src && !failed}
	{#key attempt}
		<img
			{src}
			alt={card.name}
			crossorigin="anonymous"
			loading={eager ? 'eager' : 'lazy'}
			decoding="async"
			{onerror}
			class={cn('object-cover', className)}
		/>
	{/key}
{:else if energy}
	<EnergyCardArt type={energy} label={card.name} {eager} class={className} />

{:else}
	<div
		class={cn(
			'bg-muted text-muted-foreground grid place-items-center p-1 text-center text-[10px] leading-tight',
			className
		)}
	>
		<span class="line-clamp-3">{card.name}</span>
	</div>
{/if}
