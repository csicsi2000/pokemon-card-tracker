<script lang="ts">
	/**
	 * Choose a lot. `value` is a plain string so it binds cleanly to the Select:
	 * '' is Unsorted, '*' is "all lots" (only offered with `includeAll`), anything else
	 * is a lot id. Use `lotIdOf()` to turn it back into a `string | null`.
	 */
	import * as Select from '$lib/components/ui/select';
	import { store } from '$lib/store.svelte';
	import { cn } from '$lib/utils';

	let {
		value = $bindable(''),
		includeAll = false,
		allowCreate = false,
		onchange,
		class: className,
		size = 'default'
	}: {
		value?: string;
		includeAll?: boolean;
		allowCreate?: boolean;
		/** Fires after a pick (including a freshly created lot), with the new value. */
		onchange?: (value: string) => void;
		class?: string;
		size?: 'sm' | 'default';
	} = $props();

	const lots = $derived([...store.lots].sort((a, b) => a.name.localeCompare(b.name)));

	const label = $derived.by(() => {
		if (value === '*') return 'All lots';
		if (value === '') return 'Unsorted';
		return store.lot(value)?.name ?? 'Unsorted';
	});

	function onValueChange(next: string) {
		if (next === '+') {
			const name = prompt('Name for the new lot (e.g. "july.2 lot")')?.trim();
			if (!name) return;
			value = store.createLot({ name }).id;
		} else {
			value = next ?? '';
		}
		onchange?.(value);
	}
</script>

<Select.Root type="single" {value} {onValueChange}>
	<Select.Trigger class={cn('w-44', className)} {size} aria-label="Lot">{label}</Select.Trigger>
	<Select.Content class="max-h-72">
		{#if includeAll}
			<Select.Item value="*">All lots</Select.Item>
		{/if}
		<Select.Item value="">Unsorted</Select.Item>
		{#each lots as lot (lot.id)}
			<Select.Item value={lot.id}>{lot.name}</Select.Item>
		{/each}
		{#if allowCreate}
			<Select.Item value="+">+ New lot…</Select.Item>
		{/if}
	</Select.Content>
</Select.Root>
