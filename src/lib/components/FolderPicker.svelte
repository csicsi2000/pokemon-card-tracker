<script lang="ts">
	/**
	 * Choose a folder from a whole tree, indented by depth. `value` is '' for the root or
	 * a folder id. `excludeId` greys out that folder and everything under it, so a folder
	 * cannot be moved into itself. The tree comes in as a prop — decks and lots have one
	 * each — and `rootLabel` names the top level ("Decks", "Lots").
	 */
	import * as Select from '$lib/components/ui/select';
	import { flattenTree, isDescendant } from '$lib/data/folders';
	import type { Folder } from '$lib/data/model';
	import { cn } from '$lib/utils';

	let {
		value = $bindable(''),
		folders,
		rootLabel = 'Top level',
		excludeId,
		onchange,
		class: className,
		size = 'default'
	}: {
		value?: string;
		folders: Folder[];
		rootLabel?: string;
		excludeId?: string;
		onchange?: (value: string) => void;
		class?: string;
		size?: 'sm' | 'default';
	} = $props();

	const rows = $derived(flattenTree(folders));
	const label = $derived(
		value ? (folders.find((folder) => folder.id === value)?.name ?? rootLabel) : rootLabel
	);

	function onValueChange(next: string) {
		value = next ?? '';
		onchange?.(value);
	}
</script>

<Select.Root type="single" {value} {onValueChange}>
	<Select.Trigger class={cn('w-48', className)} {size} aria-label="Folder">{label}</Select.Trigger>
	<Select.Content class="max-h-72">
		<Select.Item value="">{rootLabel} (top level)</Select.Item>
		{#each rows as row (row.folder.id)}
			<Select.Item
				value={row.folder.id}
				disabled={excludeId ? isDescendant(folders, row.folder.id, excludeId) : false}
			>
				<span style:padding-left="{row.depth * 0.75}rem">{row.folder.name}</span>
			</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
