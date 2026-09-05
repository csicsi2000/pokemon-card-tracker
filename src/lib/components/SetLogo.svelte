<script lang="ts">
	/**
	 * A set's logo, falling back to its name. Like card art, TCGdex publishes set
	 * metadata before the logo asset exists for freshly released sets.
	 *
	 * Logos are full-colour artwork on transparency, so they are never recoloured: a
	 * faint light glow in dark mode keeps the few dark-outlined ones legible. When the
	 * catalogue has no logo URL but the set's art is published, the conventional
	 * `<imageBase>/logo` path is tried before giving up on an image.
	 */
	import { setAsset } from '$lib/catalogue';
	import { cn } from '$lib/utils';
	import type { CardSet } from '$lib/types';

	let { set, class: className }: { set: CardSet; class?: string } = $props();

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
	});

	const src = $derived(candidates[attempt] ?? null);
</script>

{#if src}
	<img
		{src}
		alt={set.name}
		loading="lazy"
		onerror={() => (attempt += 1)}
		class={cn(
			'max-h-full max-w-full object-contain dark:drop-shadow-[0_0_3px_rgba(255,255,255,0.55)]',
			className
		)}
	/>
{:else}
	<span class="text-center text-sm leading-tight font-semibold">{set.name}</span>
{/if}
