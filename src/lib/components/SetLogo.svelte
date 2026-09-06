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
	 * the assets.tcgdex.net rule in vite.config.ts. A failed load climbs the same retry
	 * ladder as card art (pwa/art.ts) before moving on to the next candidate URL.
	 */
	import type { Snippet } from 'svelte';
	import { setAsset } from '$lib/catalogue';
	import { HEAL_DELAYS_MS, healArtwork } from '$lib/pwa/art';
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
		tries = new Map();
	});

	const src = $derived(candidates[attempt] ?? null);

	/** Heals already spent per candidate URL; indexes the delay ladder. */
	let tries = new Map<string, number>();
	/** Bumped after a successful heal so the <img> is re-created and asks again. */
	let retry = $state(0);

	async function onerror() {
		const url = src;
		if (!url) return;
		while ((tries.get(url) ?? 0) < HEAL_DELAYS_MS.length) {
			const rung = tries.get(url) ?? 0;
			tries.set(url, rung + 1);
			const ok = await healArtwork(url, {}, rung);
			if (src !== url) return;
			if (ok) {
				retry += 1; // re-mount; if that load fails too, onerror resumes the ladder
				return;
			}
		}
		attempt += 1; // ladder exhausted for this URL: on to the next candidate
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
