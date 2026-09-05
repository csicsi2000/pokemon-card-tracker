<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import FolderPicker from '$lib/components/FolderPicker.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Select from '$lib/components/ui/select';
	import Plus from '@lucide/svelte/icons/plus';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import Folder from '@lucide/svelte/icons/folder';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { childrenOf, deckCountDeep, folderPath } from '$lib/data/folders';
	import { store } from '$lib/store.svelte';

	/** The folder being viewed; '' is the top level. Driven by the URL so it can be shared. */
	const folderId = $derived(page.url.searchParams.get('folder') ?? '');
	const current = $derived(folderId ? store.folder(folderId) : undefined);
	const crumbs = $derived(folderPath(store.folders, folderId || null));

	const folders = $derived(
		childrenOf(store.folders, folderId || null).map((folder) => ({
			...folder,
			deckCount: deckCountDeep(store.folders, store.decks, folder.id)
		}))
	);

	const decks = $derived(
		store.decks
			.filter((deck) => (deck.folderId ?? '') === folderId)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.map((deck) => ({
				...deck,
				cardCount: deck.cards.reduce((sum, card) => sum + card.quantity, 0),
				format: store.formats.find((format) => format.id === deck.formatId) ?? null
			}))
	);

	const href = (id: string | null) => `${base}/decks/${id ? `?folder=${id}` : ''}`;

	// -- new deck ---------------------------------------------------------------
	let deckDialog = $state(false);
	let name = $state('');
	let formatId = $state('');

	function createDeck(event: SubmitEvent) {
		event.preventDefault();
		const deck = store.createDeck(name.trim() || 'New deck', formatId || null, [], folderId || null);
		deckDialog = false;
		name = '';
		goto(`${base}/decks/${deck.id}`);
	}

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
		if (renaming) store.updateFolder(renaming, { name: trimmed });
		else store.createFolder(trimmed, folderId || null);
		folderDialog = false;
	}

	// -- move -------------------------------------------------------------------
	let moving = $state<{ kind: 'deck' | 'folder'; id: string; name: string } | null>(null);
	let moveTarget = $state('');

	function openMove(kind: 'deck' | 'folder', id: string, name: string, from: string | null) {
		moving = { kind, id, name };
		moveTarget = from ?? '';
	}

	function confirmMove() {
		if (!moving) return;
		const target = moveTarget || null;
		if (moving.kind === 'deck') store.moveDeck(moving.id, target);
		else store.updateFolder(moving.id, { parentId: target });
		moving = null;
	}

	function deleteFolder(folder: { id: string; name: string; deckCount: number }) {
		const detail = folder.deckCount
			? ` Its ${folder.deckCount} deck${folder.deckCount === 1 ? '' : 's'} and sub-folders move up a level.`
			: '';
		if (confirm(`Delete folder “${folder.name}”?${detail}`)) store.deleteFolder(folder.id);
	}
</script>

<svelte:head><title>{current?.name ?? 'Decks'} · Cardex</title></svelte:head>

<PageHeader
	title={current?.name ?? 'Decks'}
	subtitle={`${decks.length} deck${decks.length === 1 ? '' : 's'}${folders.length ? ` · ${folders.length} folder${folders.length === 1 ? '' : 's'}` : ''}`}
	backHref={current ? href(current.parentId) : undefined}
>
	{#snippet actions()}
		<Button size="sm" variant="outline" onclick={() => openFolderDialog()}>
			<FolderPlus class="size-4" /> New folder
		</Button>
		<Button size="sm" onclick={() => (deckDialog = true)}>
			<Plus class="size-4" /> New deck
		</Button>
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-4 p-4 md:p-8">
	{#if crumbs.length}
		<nav class="text-muted-foreground flex flex-wrap items-center gap-1 text-sm" aria-label="Folder path">
			<a href={href(null)} class="hover:text-foreground">Decks</a>
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

	{#if folders.length === 0 && decks.length === 0}
		<div class="flex flex-col items-center gap-3 py-20 text-center">
			<p class="text-muted-foreground text-sm">
				{current ? 'This folder is empty.' : 'No decks yet.'}
			</p>
			<div class="flex gap-2">
				<Button onclick={() => (deckDialog = true)}>Create a deck</Button>
				<Button href="{base}/import" variant="outline">Import a decklist</Button>
			</div>
		</div>
	{:else}
		{#if folders.length}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each folders as folder, index (folder.id)}
					<div
						animate:flip={{ duration: 250 }}
						in:fly|global={{ y: 10, duration: 220, delay: index * 30 }}
					>
						<Card.Root class="h-full transition-shadow hover:shadow-md">
							<Card.Header>
								<Card.Title class="flex items-start justify-between gap-2">
									<a href={href(folder.id)} class="flex min-w-0 items-center gap-2 hover:underline">
										<Folder class="text-primary size-4 shrink-0" />
										<span class="truncate">{folder.name}</span>
									</a>
									<DropdownMenu.Root>
										<DropdownMenu.Trigger
											class={buttonVariants({ variant: 'ghost', size: 'icon', class: 'text-muted-foreground size-7' })}
											aria-label="Folder actions"
										>
											<Ellipsis class="size-4" />
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Item onclick={() => openFolderDialog(folder)}>Rename</DropdownMenu.Item>
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
									{folder.deckCount} deck{folder.deckCount === 1 ? '' : 's'}
								</Card.Description>
							</Card.Header>
						</Card.Root>
					</div>
				{/each}
			</div>
		{/if}

		{#if decks.length}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each decks as deck, index (deck.id)}
					<div
						animate:flip={{ duration: 250 }}
						in:fly|global={{ y: 10, duration: 220, delay: index * 30 }}
					>
						<Card.Root class="h-full transition-shadow hover:shadow-md">
							<Card.Header>
								<Card.Title class="flex items-start justify-between gap-2">
									<a href="{base}/decks/{deck.id}" class="truncate hover:underline">{deck.name}</a>
									<DropdownMenu.Root>
										<DropdownMenu.Trigger
											class={buttonVariants({ variant: 'ghost', size: 'icon', class: 'text-muted-foreground size-7' })}
											aria-label="Deck actions"
										>
											<Ellipsis class="size-4" />
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Item onclick={() => openMove('deck', deck.id, deck.name, deck.folderId)}>
												Move to…
											</DropdownMenu.Item>
											<DropdownMenu.Separator />
											<DropdownMenu.Item
												variant="destructive"
												onclick={() => {
													if (confirm(`Delete “${deck.name}”?`)) store.deleteDeck(deck.id);
												}}
											>
												Delete
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</Card.Title>
								<Card.Description>
									{deck.cardCount} cards
									{#if deck.description}· {deck.description}{/if}
								</Card.Description>
							</Card.Header>
							{#if deck.format}
								<Card.Content>
									<Badge variant="secondary">{deck.format.name}</Badge>
								</Card.Content>
							{/if}
						</Card.Root>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<Dialog.Root bind:open={deckDialog}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>New deck</Dialog.Title>
			{#if current}
				<Dialog.Description>In folder “{current.name}”.</Dialog.Description>
			{/if}
		</Dialog.Header>
		<form onsubmit={createDeck} class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Label for="deck-name">Name</Label>
				<Input id="deck-name" bind:value={name} required placeholder="Charizard ex" />
			</div>

			<div class="flex flex-col gap-2">
				<Label>Format</Label>
				<Select.Root type="single" value={formatId} onValueChange={(v) => (formatId = v ?? '')}>
					<Select.Trigger>
						{store.formats.find((f) => f.id === formatId)?.name ?? 'No format'}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="">No format</Select.Item>
						{#each store.formats as format (format.id)}
							<Select.Item value={format.id}>{format.name}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<Dialog.Footer>
				<Button type="submit">Create</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

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
				<Label for="folder-name">Name</Label>
				<Input id="folder-name" bind:value={folderName} required placeholder="Standard 2026" />
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
			excludeId={moving?.kind === 'folder' ? moving.id : undefined}
			class="w-full"
		/>
		<Dialog.Footer>
			<Button onclick={confirmMove}>Move</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
