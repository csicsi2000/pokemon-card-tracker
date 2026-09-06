<script lang="ts">
	/**
	 * Card art with a name fallback.
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
	 * than two seconds to come back. Only when the whole ladder fails does the name
	 * fallback show — and even then the tile asks once more when the browser reports it
	 * is online again or the page is brought back into view, instead of staying blank
	 * until the next navigation while the detail sheet, asking for a different size of
	 * the same scan, loads it without trouble.
	 */
	import { cardImage } from '$lib/catalogue';
	import { HEAL_DELAYS_MS, healArtwork, onRetryChance } from '$lib/pwa/art';
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

	const src = $derived(cardImage(card, quality));
	// Reset when the component is reused for a different printing.
	$effect(() => {
		void src;
		failed = false;
		attempt = 0;
		tries = 0;
	});

	// A tile that gave up listens for a reason to hope: back online, or looked at again.
	$effect(() => {
		if (!failed) return;
		return onRetryChance(() => {
			tries = 0;
			failed = false;
			attempt += 1;
		});
	});

	async function onerror() {
		const url = src;
		if (!url) {
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

{#if src && !failed}
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
