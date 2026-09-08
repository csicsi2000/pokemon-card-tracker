<script lang="ts">
	/**
	 * The little label that follows the pointer while a card is being dragged into a
	 * folder, and names where it would land. It sits above the pointer so a thumb does not
	 * cover it, and never takes pointer events — the drag hit-tests whatever is underneath.
	 */
	import type { Folder } from '$lib/data/model';
	import type { FolderDnd } from '$lib/dnd.svelte';
	import CornerDownRight from '@lucide/svelte/icons/corner-down-right';

	let {
		dnd,
		folders,
		/** What the top level is called on this page — "Decks", "Lots". */
		rootLabel
	}: { dnd: FolderDnd; folders: Folder[]; rootLabel: string } = $props();

	const destination = $derived.by(() => {
		const folderId = dnd.target?.folderId;
		if (folderId === undefined) return null; // over nothing that accepts the drag
		if (folderId === null) return rootLabel;
		return folders.find((folder) => folder.id === folderId)?.name ?? rootLabel;
	});
</script>

{#if dnd.item}
	<div
		class="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[150%] select-none"
		style:left="{dnd.x}px"
		style:top="{dnd.y}px"
		aria-hidden="true"
	>
		<div
			class="bg-popover text-popover-foreground flex max-w-64 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm shadow-lg"
		>
			{#if dnd.item.icon}
				<span class="text-base leading-none">{dnd.item.icon}</span>
			{/if}
			<span class="min-w-0 truncate font-medium">{dnd.item.name}</span>
			{#if destination !== null}
				<CornerDownRight class="text-primary size-3.5 shrink-0" />
				<span class="text-muted-foreground min-w-0 truncate">{destination}</span>
			{/if}
		</div>
	</div>
{/if}
