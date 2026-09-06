<script lang="ts">
	/**
	 * A set's logo, falling back to its name (or to the `fallback` snippet). Like card
	 * art, TCGdex publishes set metadata before the logo asset exists for freshly
	 * released sets.
	 *
	 * Logos are full-colour artwork on transparency, so they are never recoloured: a
	 * faint light glow in dark mode keeps the few dark-outlined ones legible. When the
	 * catalogue has no logo URL but the set's art is published, the conventional
	 * `<imageBase>/logo` path is tried before giving up on an image.
	 *
	 * The image takes its height from the box it sits in and derives its width from the
	 * aspect ratio. Percentage max-height alone is not enough: mobile Safari ignores it
	 * on a flex item while the image is still loading, and the logo then paints at its
	 * natural size over whatever is below.
	 *
	 * `crossorigin` keeps the service worker able to see a real status for these; see
	 * the assets.tcgdex.net rule in vite.config.ts.
	 */
	import type { Snippet } from 'svelte';
	import { setAsset } from '$lib/catalogue';
	import { healArtwork } from '$lib/pwa/art';
	import { cn } from '$lib/utils';
	import type { CardSet } from '$lib/types';

	let {
		set,
		class: className,
		fallback
	}: { set: CardSet; class?: string; fallback?: Snippet } = $props();

	const candidates = $derived(
		[
			setAsset(set.logoUrl),
			set.imageBase && set.artworkPublished ? `${set.imageBase}/logo.webp` : null
		].filter((url): url is string => Boolean(url))
	);

	let attempt = $state(0);
	$effect(() => {
		void candidates;
		attempt = 0;
		retry = 0;
		healed = new Set();
	});

	const src = $derived(candidates[attempt] ?? null);

	/** Candidates already re-fetched past the HTTP cache once (see pwa/art.ts). */
	let healed = new Set<string>();
	/** Bumped after a successful heal so the <img> is re-created and asks again. */
	let retry = $state(0);

	async function onerror() {
		const url = src;
		if (!url || healed.has(url)) {
			attempt += 1; // second failure for this URL: on to the next candidate
			return;
		}
		healed.add(url);
		const ok = await healArtwork(url);
		if (src !== url) return;
		if (ok) retry += 1;
		else attempt += 1;
	}
</script>

{#if src}
	{#key retry}
	<img
		{src}
		alt={set.name}
		crossorigin="anonymous"
		loading="lazy"
		{onerror}
		class={cn(
			'h-full w-auto max-w-full object-contain dark:drop-shadow-[0_0_3px_rgba(255,255,255,0.55)]',
			className
		)}
	/>
	{/key}
{:else if fallback}
	{@render fallback()}
{:else}
	<span class="text-center text-sm leading-tight font-semibold">{set.name}</span>
{/if}
