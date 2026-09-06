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
	 * A load that fails gets one second chance through `healArtwork`, which re-fetches
	 * past the browser's HTTP cache (the CDN's 404s are marked cacheable for a year) and
	 * past a momentary CDN error; only if that fails too does the name fallback stay.
	 */
	import { cardImage } from '$lib/catalogue';
	import { healArtwork } from '$lib/pwa/art';
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
	/** Bumped after a successful heal so the <img> is re-created and asks again. */
	let attempt = $state(0);
	let healing: string | null = null;

	const src = $derived(cardImage(card, quality));
	// Reset when the component is reused for a different printing.
	$effect(() => {
		void src;
		failed = false;
		attempt = 0;
		healing = null;
	});

	async function onerror() {
		const url = src;
		if (!url || healing === url) {
			failed = true; // second failure for this printing: the scan is not there
			return;
		}
		healing = url;
		const healed = await healArtwork(url);
		if (src !== url) return; // the card changed under us meanwhile
		if (healed) attempt += 1;
		else failed = true;
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
