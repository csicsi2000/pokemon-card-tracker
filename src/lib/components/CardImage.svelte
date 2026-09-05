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
	 */
	import { cardImage } from '$lib/catalogue';
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

	const src = $derived(cardImage(card, quality));
	// Reset when the component is reused for a different printing.
	$effect(() => {
		void src;
		failed = false;
	});
</script>

{#if src && !failed}
	<img
		{src}
		alt={card.name}
		crossorigin="anonymous"
		loading={eager ? 'eager' : 'lazy'}
		decoding="async"
		onerror={() => (failed = true)}
		class={cn('object-cover', className)}
	/>
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
