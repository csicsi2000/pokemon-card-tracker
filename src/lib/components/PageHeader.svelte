<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle,
		actions
	}: { title: string; subtitle?: string; actions?: Snippet } = $props();
</script>

<header
	class="bg-background/80 sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b px-4 py-3 backdrop-blur-lg md:px-8 md:py-5"
>
	<div class="min-w-0 flex-1">
		<h1 class="truncate text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
		{#if subtitle}
			<p class="text-muted-foreground truncate text-sm">{subtitle}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>
	{/if}
</header>
