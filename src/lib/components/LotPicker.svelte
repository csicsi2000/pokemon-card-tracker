<script lang="ts">
	/**
	 * Choose a lot. `value` is a plain string so it binds cleanly to the Select:
	 * '' is Unsorted, '*' is "all lots" (only offered with `includeAll`), anything else
	 * is a lot id. Use `lotIdOf()` to turn it back into a `string | null`.
	 */
	import * as Select from '$lib/components/ui/select';
	import LotDialog from './LotDialog.svelte';
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

	/** "🔥 july.2 lot" — the emoji rides along so a picker reads like the card does. */
	const nameOf = (lot: { name: string; icon: string | null }) =>
		lot.icon ? `${lot.icon} ${lot.name}` : lot.name;

	const label = $derived.by(() => {
		if (value === '*') return 'All lots';
		if (value === '') return 'Unsorted';
		const lot = store.lot(value);
		return lot ? nameOf(lot) : 'Unsorted';
	});

	let dialogOpen = $state(false);

	function onValueChange(next: string) {
		if (next === '+') {
			dialogOpen = true;
			return;
		}
		value = next ?? '';
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
			<Select.Item value={lot.id}>{nameOf(lot)}</Select.Item>
		{/each}
		{#if allowCreate}
			<Select.Item value="+">+ New lot…</Select.Item>
		{/if}
	</Select.Content>
</Select.Root>

{#if allowCreate}
	<LotDialog
		bind:open={dialogOpen}
		oncreate={(lot) => {
			value = lot.id;
			onchange?.(value);
		}}
	/>
{/if}
