<script lang="ts">
	let {
		label,
		value,
		hint
	}: { label: string; value: number | string; hint?: string } = $props();

	const display = $derived(typeof value === 'number' ? value.toLocaleString() : value);
</script>

<div class="bg-card rounded-xl border p-4">
	<p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
	<p class="mt-1 text-2xl font-semibold tabular-nums">{display}</p>
	{#if hint}<p class="text-muted-foreground mt-0.5 text-xs">{hint}</p>{/if}
</div>
