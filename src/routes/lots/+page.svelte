<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import LotDialog from '$lib/components/LotDialog.svelte';
	import FolderPicker from '$lib/components/FolderPicker.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
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
	import { childrenOf, countDeep, folderPath, isDescendant } from '$lib/data/folders';
	import { store } from '$lib/store.svelte';

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

	const folders = $derived(
		childrenOf(store.lotFolders, folderId || null).map((folder) => ({
			...folder,
			lotCount: countDeep(store.lotFolders, store.lots, folder.id),
			// Cards in every lot filed anywhere under this folder — the number a person cares about.
			cardCount: store.lots
				.filter((lot) => isDescendant(store.lotFolders, lot.folderId, folder.id))
				.reduce((sum, lot) => sum + countOf(lot.id).cards, 0)
		}))
	);

	// Newest acquisition first; lots without a date sort by when they were created.
	const lots = $derived(
		store.lots
			.filter((lot) => (lot.folderId ?? '') === folderId)
			.sort((a, b) =>
				(b.acquiredOn ?? b.createdAt.slice(0, 10)).localeCompare(
					a.acquiredOn ?? a.createdAt.slice(0, 10)
				)
			)
	);

	// -- new / rename folder ----------------------------------------------------
	let folderDialog = $state(false);
	let folderName = $state('');
	let renaming = $state<string | null>(null);

	function openFolderDialog(rename?: { id: string; name: string }) {
		renaming = rename?.id ?? null;
		folderName = rename?.name ?? '';
		folderDialog = true;
	}

	function saveFolder(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = folderName.trim() || 'New folder';
		if (renaming) store.updateLotFolder(renaming, { name: trimmed });
		else store.createLotFolder(trimmed, folderId || null);
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
		<nav
			class="text-muted-foreground flex flex-wrap items-center gap-1 text-sm"
			aria-label="Folder path"
		>
			<a href={href(null)} class="hover:text-foreground">Lots</a>
			{#each crumbs as crumb (crumb.id)}
				<ChevronRight class="size-3.5" />
				{#if crumb.id === folderId}
					<span class="text-foreground font-medium">{crumb.name}</span>
				{:else}
					<a href={href(crumb.id)} class="hover:text-foreground">{crumb.name}</a>
				{/if}
			{/each}
		</nav>
	{/if}

	{#if folders.length}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each folders as folder, index (folder.id)}
				<div
					animate:flip={{ duration: 250 }}
					in:fly|global={{ y: 10, duration: 220, delay: index * 30 }}
				>
					<Card.Root class="h-full transition-shadow hover:shadow-md">
						<Card.Header>
							<Card.Title class="flex items-start justify-between gap-2 text-base">
								<a href={href(folder.id)} class="flex min-w-0 items-center gap-2 hover:underline">
									<Folder class="text-primary size-4 shrink-0" />
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
										<DropdownMenu.Item onclick={() => openFolderDialog(folder)}>
											Rename
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
							</Card.Description>
						</Card.Header>
					</Card.Root>
				</div>
			{/each}
		</div>
	{/if}

	{#if !current}
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

	{#if lots.length === 0 && folders.length === 0}
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
				>
					<Card.Root class="h-full transition-shadow hover:shadow-md">
						<Card.Header>
							<Card.Title class="flex items-start justify-between gap-2 text-base">
								<a href="{base}/lots/{lot.id}" class="truncate hover:underline">{lot.name}</a>
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
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{renaming ? 'Rename folder' : 'New folder'}</Dialog.Title>
			{#if !renaming && current}
				<Dialog.Description>Inside “{current.name}”.</Dialog.Description>
			{/if}
		</Dialog.Header>
		<form onsubmit={saveFolder} class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Label for="lot-folder-name">Name</Label>
				<Input id="lot-folder-name" bind:value={folderName} required placeholder="2026 purchases" />
			</div>
			<Dialog.Footer>
				<Button type="submit">{renaming ? 'Rename' : 'Create'}</Button>
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
