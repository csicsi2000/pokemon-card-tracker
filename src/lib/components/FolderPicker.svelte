<script lang="ts">
	/**
	 * Choose a deck folder from the whole tree, indented by depth. `value` is '' for the
	 * root or a folder id. `excludeId` greys out that folder and everything under it, so a
	 * folder cannot be moved into itself.
	 */
	import * as Select from '$lib/components/ui/select';
	import { flattenTree, isDescendant } from '$lib/data/folders';
	import { store } from '$lib/store.svelte';
	import { cn } from '$lib/utils';

	let {
		value = $bindable(''),
		excludeId,
		onchange,
		class: className,
		size = 'default'
	}: {
		value?: string;
		excludeId?: string;
		onchange?: (value: string) => void;
		class?: string;
		size?: 'sm' | 'default';
	} = $props();

	const rows = $derived(flattenTree(store.folders));
	const label = $derived(value ? (store.folder(value)?.name ?? 'Decks') : 'Decks');

	function onValueChange(next: string) {
		value = next ?? '';
		onchange?.(value);
	}
</script>

<Select.Root type="single" {value} {onValueChange}>
	<Select.Trigger class={cn('w-48', className)} {size} aria-label="Folder">{label}</Select.Trigger>
	<Select.Content class="max-h-72">
		<Select.Item value="">Decks (top level)</Select.Item>
		{#each rows as row (row.folder.id)}
			<Select.Item
				value={row.folder.id}
				disabled={excludeId ? isDescendant(store.folders, row.folder.id, excludeId) : false}
			>
				<span style:padding-left="{row.depth * 0.75}rem">{row.folder.name}</span>
			</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
