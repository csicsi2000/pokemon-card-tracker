<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';

	let {
		title,
		subtitle,
		backHref,
		titleAction,
		actions
	}: {
		title: string;
		subtitle?: string;
		backHref?: string;
		/** A control that belongs to the thing named in the title rather than to the page —
		 *  a star, say. It sits on the title line, out of the crowded actions row. */
		titleAction?: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<header
	class="bg-background/80 sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b px-4 py-3 backdrop-blur-lg md:px-8 md:py-5"
>
	{#if backHref}
		<a
			href={backHref}
			class="text-muted-foreground hover:bg-accent hover:text-foreground -ml-2 grid size-8 shrink-0 place-items-center rounded-lg transition-colors"
			aria-label="Back"
		>
			<ChevronLeft class="size-5" />
		</a>
	{/if}
	<div class="min-w-0 flex-1">
		<div class="flex min-w-0 items-center gap-1">
			<h1 class="truncate text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
			{#if titleAction}<div class="shrink-0">{@render titleAction()}</div>{/if}
		</div>
		{#if subtitle}
			<p class="text-muted-foreground truncate text-sm">{subtitle}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>
	{/if}
</header>
