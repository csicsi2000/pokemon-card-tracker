<script lang="ts">
	/** One energy symbol, as used in attack costs and type badges. */
	import { typeColor } from '$lib/card-details';
	import { cn } from '$lib/utils';

	let { type, class: className }: { type: string; class?: string } = $props();
</script>

<span
	title={type}
	class={cn(
		'inline-grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white',
		typeColor(type),
		className
	)}
>
	{type.slice(0, 1)}
</span>
