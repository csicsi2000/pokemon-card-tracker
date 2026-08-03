<script lang="ts">
	/**
	 * A set's logo, falling back to its name. Like card art, TCGdex publishes set
	 * metadata before the logo asset exists for freshly released sets.
	 */
	import { setAsset } from '$lib/catalogue';
	import { cn } from '$lib/utils';
	import type { CardSet } from '$lib/types';

	let { set, class: className }: { set: CardSet; class?: string } = $props();

	let failed = $state(false);

	const src = $derived(setAsset(set.logoUrl));
	$effect(() => {
		void src;
		failed = false;
	});
</script>

{#if src && !failed}
	<img
		{src}
		alt={set.name}
		loading="lazy"
		onerror={() => (failed = true)}
		class={cn('max-h-full max-w-full object-contain', className)}
	/>
{:else}
	<span class="text-center text-sm leading-tight font-semibold">{set.name}</span>
{/if}
