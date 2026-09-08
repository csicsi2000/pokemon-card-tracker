<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { toast } from 'svelte-sonner';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import LotDialog from '$lib/components/LotDialog.svelte';
	import FolderPicker from '$lib/components/FolderPicker.svelte';
	import AppearanceTile from '$lib/components/AppearanceTile.svelte';
	import AppearancePicker from '$lib/components/AppearancePicker.svelte';
	import DragGhost from '$lib/components/DragGhost.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import Plus from '@lucide/svelte/icons/plus';
	import Package from '@lucide/svelte/icons/package';
	import Inbox from '@lucide/svelte/icons/inbox';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';
	import { childrenOf, countDeep, folderPath, folderTrail, isDescendant } from '$lib/data/folders';
	import { createFolderDnd } from '$lib/dnd.svelte';
	import { store } from '$lib/store.svelte';
	import { cn } from '$lib/utils';
	import type { Lot, LotFolder } from '$lib/types';
	import type { AppearanceColor } from '$lib/data/appearance';

	/** The folder being viewed; '' is the top level. Driven by the URL so it can be shared. */
	const folderId = $derived(page.url.searchParams.get('folder') ?? '');
	const current = $derived(folderId ? store.lotFolder(folderId) : undefined);
	const crumbs = $derived(folderPath(store.lotFolders, folderId || null));

	const href = (id: string | null) => `${base}/lots/${id ? `?folder=${id}` : ''}`;

	let dialogOpen = $state(false);

	/** Card and printing counts per lot, in one pass over the collection. */
	const counts = $derived.by(() => {
		const totals = new Map<string | null, { cards: number; printings: Set<string> }>();
		for (const row of store.collection) {
			const bucket = totals.get(row.lotId) ?? { cards: 0, printings: new Set<string>() };
			bucket.cards += row.quantity;
			bucket.printings.add(row.cardId);
			totals.set(row.lotId, bucket);
		}
		return totals;
	});

	const countOf = (lotId: string | null) => {
		const bucket = counts.get(lotId);
		return { cards: bucket?.cards ?? 0, printings: bucket?.printings.size ?? 0 };
	};

	// -- search -----------------------------------------------------------------
	// A search looks through every folder and lot, not just the one on screen: someone typing
	// "july" wants the lot wherever it was filed. Every word must appear somewhere in the name,
	// note/description or the folder path.
	let query = $state('');
	const words = $derived(query.toLocaleLowerCase().split(/\s+/).filter(Boolean));
	const searching = $derived(words.length > 0);

	const pathOf = (id: string | null) => folderTrail(store.lotFolders, id);

	const matches = (...fields: (string | null | undefined)[]) => {
		const haystack = fields.filter(Boolean).join(' ').toLocaleLowerCase();
		return words.every((word) => haystack.includes(word));
	};

	const describeFolder = (folder: LotFolder) => ({
		...folder,
		path: pathOf(folder.parentId),
		lotCount: countDeep(store.lotFolders, store.lots, folder.id),
		// Cards in every lot filed anywhere under this folder — the number a person cares about.
		cardCount: store.lots
			.filter((lot) => isDescendant(store.lotFolders, lot.folderId, folder.id))
			.reduce((sum, lot) => sum + countOf(lot.id).cards, 0)
	});

	const folders = $derived(
		searching
			? store.lotFolders
					.filter((folder) =>
						matches(folder.name, folder.description, folder.icon, pathOf(folder.parentId))
					)
					.sort((a, b) => a.name.localeCompare(b.name))
					.map(describeFolder)
			: childrenOf(store.lotFolders, folderId || null).map(describeFolder)
	);

	// Newest acquisition first; lots without a date sort by when they were created.
	const byNewest = (a: Lot, b: Lot) =>
		(b.acquiredOn ?? b.createdAt.slice(0, 10)).localeCompare(
			a.acquiredOn ?? a.createdAt.slice(0, 10)
		);

	const lots = $derived(
		(searching
			? store.lots.filter((lot) => matches(lot.name, lot.note, lot.icon, pathOf(lot.folderId)))
			: store.lots.filter((lot) => (lot.folderId ?? '') === folderId)
		).sort(byNewest)
	);

	/**
	 * The whole card opens the folder or lot, like tapping its name. Clicks that already do
	 * something — the name link, the ⋯ menu — are left alone so they are not handled twice.
	 */
	function openCard(event: MouseEvent, url: string) {
		if ((event.target as HTMLElement).closest('a, button, [role="menu"]')) return;
		goto(url);
	}

	// -- new / rename / describe folder -----------------------------------------
	// One dialog serves every folder edit. Rename, Edit description and Customize all show the
	// whole form (changing anything is one save), but each opens on the part it was named for.
	type FolderField = 'name' | 'description' | 'appearance';
	let folderDialog = $state(false);
	let folderName = $state('');
	let folderDescription = $state('');
	let folderColor = $state<AppearanceColor | null>(null);
	let folderIcon = $state<string | null>(null);
	let renaming = $state<string | null>(null);
	let focusField = $state<FolderField>('name');

	const FOLDER_TITLES: Record<FolderField, string> = {
		name: 'Rename folder',
		description: 'Edit description',
		appearance: 'Customize folder'
	};
	const folderDialogTitle = $derived(renaming ? FOLDER_TITLES[focusField] : 'New folder');

	function openFolderDialog(edit?: LotFolder, field: FolderField = 'name') {
		renaming = edit?.id ?? null;
		folderName = edit?.name ?? '';
		folderDescription = edit?.description ?? '';
		folderColor = edit?.color ?? null;
		folderIcon = edit?.icon ?? null;
		focusField = field;
		folderDialog = true;
	}

	/** Put the cursor in the field the menu item was about, with its text selected. */
	function focusFolderField(event: Event) {
		if (focusField === 'appearance') return; // nothing to type; the dialog's default focus is fine
		event.preventDefault();
		const field = document.getElementById(
			focusField === 'name' ? 'lot-folder-name' : 'lot-folder-description'
		) as HTMLInputElement | HTMLTextAreaElement | null;
		field?.focus();
		field?.select();
	}

	function saveFolder(event: SubmitEvent) {
		event.preventDefault();
		const name = folderName.trim() || 'New folder';
		const extra = {
			description: folderDescription.trim() || null,
			color: folderColor,
			icon: folderIcon
		};
		if (renaming) store.updateLotFolder(renaming, { name, ...extra });
		else store.createLotFolder(name, folderId || null, extra);
		folderDialog = false;
	}

	// -- move -------------------------------------------------------------------
	let moving = $state<{ kind: 'lot' | 'folder'; id: string; name: string } | null>(null);
	let moveTarget = $state('');

	function openMove(kind: 'lot' | 'folder', id: string, name: string, from: string | null) {
		moving = { kind, id, name };
		moveTarget = from ?? '';
	}

	function confirmMove() {
		if (!moving) return;
		const target = moveTarget || null;
		if (moving.kind === 'lot') store.moveLot(moving.id, target);
		else store.updateLotFolder(moving.id, { parentId: target });
		moving = null;
	}

	// -- drag and drop ----------------------------------------------------------
	// Dragging a lot or a folder onto a folder card files it there; the breadcrumbs are
	// drop targets too, which is how something moves back up a level. It works while a
	// search is on as well, where the grid shows folders from anywhere in the tree.
	const dnd = createFolderDnd({
		folders: () => store.lotFolders,
		move(item, folderId) {
			if (item.kind === 'folder') store.updateLotFolder(item.id, { parentId: folderId });
			else store.moveLot(item.id, folderId);
			const where = folderId ? (store.lotFolder(folderId)?.name ?? 'Lots') : 'Lots';
			toast.success(`Moved “${item.name}” to ${where}`);
		}
	});

	/** How a card looks mid-drag: lifted if it is the one moving, dimmed if it cannot take it. */
	const dragClass = (kind: 'item' | 'folder', id: string) =>
		cn(
			dnd.isDragging(id) && 'opacity-40',
			kind === 'folder' &&
				dnd.item &&
				!dnd.isDragging(id) &&
				(dnd.isOver(id) ? 'ring-primary ring-2' : !dnd.canDrop(id) && 'opacity-50')
		);

	function deleteFolder(folder: { id: string; name: string; lotCount: number }) {
		const detail = folder.lotCount
			? ` Its ${folder.lotCount} lot${folder.lotCount === 1 ? '' : 's'} and sub-folders move up a level.`
			: '';
		if (confirm(`Delete folder “${folder.name}”?${detail}`)) store.deleteLotFolder(folder.id);
	}
</script>

<svelte:head><title>{current?.name ?? 'Lots'} · Cardex</title></svelte:head>

<PageHeader
	title={current?.name ?? 'Lots'}
	subtitle={current
		? `${lots.length} lot${lots.length === 1 ? '' : 's'}${folders.length ? ` · ${folders.length} folder${folders.length === 1 ? '' : 's'}` : ''}`
		: 'Purchases and batches — where each card came from'}
	backHref={current ? href(current.parentId) : undefined}
>
	{#snippet actions()}
		<!-- The label drops away on a phone so a long folder name keeps room in the header. -->
		<Button size="sm" variant="outline" onclick={() => openFolderDialog()} aria-label="New folder">
			<FolderPlus class="size-4" />
			<span class="hidden sm:inline">New folder</span>
		</Button>
		<Button size="sm" onclick={() => (dialogOpen = true)}>
			<Plus class="size-4" /> New lot
		</Button>
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-4 p-4 md:p-8">
	{#if crumbs.length}
		<!-- Each crumb is a drop target, so dragging onto one moves an item back up a level. -->
		<nav
			class="text-muted-foreground flex flex-wrap items-center gap-1 text-sm"
			aria-label="Folder path"
		>
			<a
				href={href(null)}
				class={cn(
					'hover:text-foreground rounded px-1',
					dnd.isOver(null) && 'bg-primary/15 text-foreground'
				)}
				{@attach dnd.zone(null)}
			>
				Lots
			</a>
			{#each crumbs as crumb (crumb.id)}
				<ChevronRight class="size-3.5" />
				{#if crumb.id === folderId}
					<span class="text-foreground font-medium">{crumb.name}</span>
				{:else}
					<a
						href={href(crumb.id)}
						class={cn(
							'hover:text-foreground rounded px-1',
							dnd.isOver(crumb.id) && 'bg-primary/15 text-foreground'
						)}
						{@attach dnd.zone(crumb.id)}
					>
						{crumb.name}
					</a>
				{/if}
			{/each}
		</nav>
	{/if}

	{#if store.lots.length || store.lotFolders.length}
		<div class="relative">
			<Search
				class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
			/>
			<Input
				type="search"
				bind:value={query}
				placeholder="Search lots and folders…"
				aria-label="Search lots and folders"
				class="pr-9 pl-9"
			/>
			{#if query}
				<button
					type="button"
					class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded p-1"
					aria-label="Clear search"
					onclick={() => (query = '')}
				>
					<X class="size-4" />
				</button>
			{/if}
		</div>
	{/if}

	{#if folders.length}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each folders as folder, index (folder.id)}
				<div
					animate:flip={{ duration: 250 }}
					in:fly|global={{ y: 10, duration: 220, delay: index * 30 }}
					class="select-none"
					{@attach dnd.grab({
						kind: 'folder',
						id: folder.id,
						name: folder.name,
						parentId: folder.parentId,
						icon: folder.icon
					})}
					{@attach dnd.zone(folder.id)}
				>
					<Card.Root
						class={cn(
							'h-full cursor-pointer transition-shadow hover:shadow-md',
							dragClass('folder', folder.id)
						)}
						onclick={(event) => openCard(event, href(folder.id))}
					>
						<Card.Header>
							<Card.Title class="flex items-start justify-between gap-2 text-base">
								<a href={href(folder.id)} class="flex min-w-0 items-center gap-2 hover:underline">
									<AppearanceTile appearance={folder}>
										{#snippet fallback()}<Folder class="size-4" />{/snippet}
									</AppearanceTile>
									<span class="truncate">{folder.name}</span>
								</a>
								<DropdownMenu.Root>
									<DropdownMenu.Trigger
										class={buttonVariants({
											variant: 'ghost',
											size: 'icon',
											class: 'text-muted-foreground size-7'
										})}
										aria-label="Folder actions"
									>
										<Ellipsis class="size-4" />
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end">
										<DropdownMenu.Item onclick={() => openFolderDialog(folder, 'name')}>
											Rename
										</DropdownMenu.Item>
										<DropdownMenu.Item onclick={() => openFolderDialog(folder, 'description')}>
											Edit description
										</DropdownMenu.Item>
										<DropdownMenu.Item onclick={() => openFolderDialog(folder, 'appearance')}>
											Customize
										</DropdownMenu.Item>
										<DropdownMenu.Item
											onclick={() => openMove('folder', folder.id, folder.name, folder.parentId)}
										>
											Move to…
										</DropdownMenu.Item>
										<DropdownMenu.Separator />
										<DropdownMenu.Item variant="destructive" onclick={() => deleteFolder(folder)}>
											Delete
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</Card.Title>
							<Card.Description>
								{folder.lotCount} lot{folder.lotCount === 1 ? '' : 's'} · {folder.cardCount} cards
								{#if searching && folder.path}
									· in {folder.path}
								{/if}
								{#if folder.description}
									<br />{folder.description}
								{/if}
							</Card.Description>
						</Card.Header>
					</Card.Root>
				</div>
			{/each}
		</div>
	{/if}

	{#if !current && !searching}
		<a href="{base}/lots/unsorted" in:fly|global={{ y: 10, duration: 220 }}>
			<Card.Root class="border-dashed transition-shadow hover:shadow-md">
				<Card.Header>
					<Card.Title class="flex items-center gap-2 text-base">
						<Inbox class="text-muted-foreground size-4" /> Unsorted
					</Card.Title>
					<Card.Description>
						{countOf(null).cards} cards · {countOf(null).printings} printings — cards not assigned
						to a lot
					</Card.Description>
				</Card.Header>
			</Card.Root>
		</a>
	{/if}

	{#if searching && lots.length === 0 && folders.length === 0}
		<div class="flex flex-col items-center gap-3 py-16 text-center">
			<Search class="text-muted-foreground size-8" />
			<p class="text-muted-foreground max-w-sm text-sm">
				No lot or folder matches “{query.trim()}”.
			</p>
			<Button variant="outline" onclick={() => (query = '')}>Clear search</Button>
		</div>
	{:else if lots.length === 0 && folders.length === 0}
		<div class="flex flex-col items-center gap-3 py-16 text-center">
			<Package class="text-muted-foreground size-8" />
			<p class="text-muted-foreground max-w-sm text-sm">
				{#if current}
					This folder is empty. Create a lot here, or move one in from another folder.
				{:else}
					A lot is a batch of cards you got together — a bulk buy, a booster box, a trade. Add
					cards into it and later check exactly what that lot contained.
				{/if}
			</p>
			<Button onclick={() => (dialogOpen = true)}>
				{current ? 'Create a lot here' : 'Create your first lot'}
			</Button>
		</div>
	{:else if lots.length}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each lots as lot, index (lot.id)}
				{@const count = countOf(lot.id)}
				<div
					animate:flip={{ duration: 250 }}
					in:fly|global={{ y: 10, duration: 220, delay: index * 30 }}
					class="select-none"
					{@attach dnd.grab({
						kind: 'item',
						id: lot.id,
						name: lot.name,
						parentId: lot.folderId,
						icon: lot.icon
					})}
				>
					<Card.Root
						class={cn(
							'h-full cursor-pointer transition-shadow hover:shadow-md',
							dragClass('item', lot.id)
						)}
						onclick={(event) => openCard(event, `${base}/lots/${lot.id}`)}
					>
						<Card.Header>
							<Card.Title class="flex items-start justify-between gap-2 text-base">
								<a href="{base}/lots/{lot.id}" class="flex min-w-0 items-center gap-2 hover:underline">
									<AppearanceTile appearance={lot}>
										{#snippet fallback()}<Package class="size-4" />{/snippet}
									</AppearanceTile>
									<span class="truncate">{lot.name}</span>
								</a>
								<div class="flex shrink-0 items-center gap-1">
									<Badge variant="secondary">{count.cards} card{count.cards === 1 ? '' : 's'}</Badge>
									<DropdownMenu.Root>
										<DropdownMenu.Trigger
											class={buttonVariants({
												variant: 'ghost',
												size: 'icon',
												class: 'text-muted-foreground size-7'
											})}
											aria-label="Lot actions"
										>
											<Ellipsis class="size-4" />
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Item
												onclick={() => openMove('lot', lot.id, lot.name, lot.folderId)}
											>
												Move to…
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</div>
							</Card.Title>
							<Card.Description>
								{lot.acquiredOn ?? 'No date'} · {count.printings} printings
								{#if searching && lot.folderId}
									· in {pathOf(lot.folderId)}
								{/if}
								{#if lot.note}
									<br />{lot.note}
								{/if}
							</Card.Description>
						</Card.Header>
					</Card.Root>
				</div>
			{/each}
		</div>
	{/if}
</div>

<LotDialog
	bind:open={dialogOpen}
	folderId={folderId || null}
	oncreate={(lot) => goto(`${base}/lots/${lot.id}`)}
/>

<Dialog.Root bind:open={folderDialog}>
	<Dialog.Content onOpenAutoFocus={focusFolderField}>
		<Dialog.Header>
			<Dialog.Title>{folderDialogTitle}</Dialog.Title>
			{#if !renaming && current}
				<Dialog.Description>Inside “{current.name}”.</Dialog.Description>
			{/if}
		</Dialog.Header>
		<form onsubmit={saveFolder} class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Label for="lot-folder-name">Name</Label>
				<Input id="lot-folder-name" bind:value={folderName} required placeholder="2026 purchases" />
			</div>
			<div class="flex flex-col gap-2">
				<Label for="lot-folder-description">Description</Label>
				<Textarea
					id="lot-folder-description"
					bind:value={folderDescription}
					rows={2}
					placeholder="What goes in here — eBay bulk buys, booster boxes, trades…"
				/>
			</div>
			<AppearancePicker bind:color={folderColor} bind:icon={folderIcon} id="lot-folder">
				{#snippet fallback()}<Folder class="size-4" />{/snippet}
			</AppearancePicker>
			<Dialog.Footer>
				<Button type="submit">{renaming ? 'Save' : 'Create'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={moving !== null} onOpenChange={(open) => !open && (moving = null)}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Move “{moving?.name}”</Dialog.Title>
			<Dialog.Description>Choose the folder it should live in.</Dialog.Description>
		</Dialog.Header>
		<FolderPicker
			bind:value={moveTarget}
			folders={store.lotFolders}
			rootLabel="Lots"
			excludeId={moving?.kind === 'folder' ? moving.id : undefined}
			class="w-full"
		/>
		<Dialog.Footer>
			<Button onclick={confirmMove}>Move</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<DragGhost {dnd} folders={store.lotFolders} rootLabel="Lots" />
