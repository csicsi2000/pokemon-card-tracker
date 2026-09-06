<script lang="ts">
	import { fly } from 'svelte/transition';
	import { base } from '$app/paths';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import Library from '@lucide/svelte/icons/library';
	import Layers from '@lucide/svelte/icons/layers';
	import Heart from '@lucide/svelte/icons/heart';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Boxes from '@lucide/svelte/icons/boxes';
	import Package from '@lucide/svelte/icons/package';
	import Import from '@lucide/svelte/icons/import';
	import { folderPath } from '$lib/data/folders';
	import { store } from '$lib/store.svelte';

	let { data } = $props();

	const stats = $derived({
		owned: store.collection.reduce((sum, entry) => sum + entry.quantity, 0),
		printings: new Set(store.collection.map((entry) => entry.cardId)).size,
		decks: store.decks.length,
		catalogue: data.catalogue.cards.length
	});

	const recentDecks = $derived(
		[...store.decks]
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, 6)
			.map((deck) => ({
				...deck,
				cardCount: deck.cards.reduce((sum, card) => sum + card.quantity, 0),
				path: folderPath(store.folders, deck.folderId)
					.map((folder) => folder.name)
					.join(' › ')
			}))
	);

	const recentLots = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const row of store.collection) {
			if (row.lotId) counts.set(row.lotId, (counts.get(row.lotId) ?? 0) + row.quantity);
		}
		return [...store.lots]
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, 6)
			.map((lot) => ({ ...lot, cardCount: counts.get(lot.id) ?? 0 }));
	});

	const shortcuts = [
		{ href: '/collection', icon: Library, title: 'Collection', text: 'Track what you own.' },
		{ href: '/wants', icon: Heart, title: 'Wants', text: 'Cards you are hunting for.' },
		{ href: '/trades', icon: ArrowLeftRight, title: 'Trade binder', text: 'Spares you would trade away.' },
		{ href: '/lots', icon: Package, title: 'Lots', text: 'What came in each purchase.' },
		{ href: '/sets', icon: Boxes, title: 'Sets', text: 'Browse art and completion.' },
		{ href: '/decks', icon: Layers, title: 'Decks', text: 'Build and check legality.' },
		{ href: '/formats', icon: Sparkles, title: 'Formats', text: 'Cube pools and house rules.' },
		{ href: '/import', icon: Import, title: 'Import / export', text: 'pkmn.gg lists and AI JSON.' }
	];
</script>

<svelte:head><title>Cardex</title></svelte:head>

<PageHeader title="Overview" subtitle="Your Pokémon TCG collection at a glance" />

<div class="flex flex-col gap-6 p-4 md:p-8">
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		<StatTile label="Cards owned" value={stats.owned} />
		<StatTile label="Unique printings" value={stats.printings} />
		<StatTile label="Decks" value={stats.decks} />
		<StatTile
			label="Cards in catalogue"
			value={stats.catalogue}
			hint={`TCGdex, ${data.catalogue.generatedAt}`}
		/>
	</div>

	<!-- Two columns even on a phone: eight full-width cards would push the recent decks
	     and lots below the fold. -->
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		{#each shortcuts as shortcut, index (shortcut.href)}
			{@const Icon = shortcut.icon}
			<a href="{base}{shortcut.href}" in:fly|global={{ y: 10, duration: 220, delay: index * 40 }}>
				<Card.Root class="h-full transition-all hover:-translate-y-0.5 hover:shadow-md">
					<Card.Header>
						<Icon class="text-primary size-5" />
						<Card.Title class="text-base">{shortcut.title}</Card.Title>
						<Card.Description>{shortcut.text}</Card.Description>
					</Card.Header>
				</Card.Root>
			</a>
		{/each}
	</div>

	{#if recentDecks.length}
		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-semibold">Recent decks</h2>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each recentDecks as deck (deck.id)}
					<a href="{base}/decks/{deck.id}">
						<Card.Root class="transition-shadow hover:shadow-md">
							<Card.Header>
								<Card.Title class="text-base">{deck.name}</Card.Title>
								<Card.Description>
									{deck.cardCount} cards{#if deck.path}
										· {deck.path}{/if}
								</Card.Description>
							</Card.Header>
						</Card.Root>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if recentLots.length}
		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-semibold">Recent lots</h2>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each recentLots as lot (lot.id)}
					<a href="{base}/lots/{lot.id}">
						<Card.Root class="transition-shadow hover:shadow-md">
							<Card.Header>
								<Card.Title class="text-base">{lot.name}</Card.Title>
								<Card.Description>
									{lot.cardCount} cards{#if lot.acquiredOn}
										· {lot.acquiredOn}{/if}
								</Card.Description>
							</Card.Header>
						</Card.Root>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if !recentDecks.length && !recentLots.length}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Nothing here yet</Card.Title>
				<Card.Description>
					Type a set code and number on the Collection page (like <span class="font-mono">MEG 21</span>),
					import a pkmn.gg list, or browse the {stats.catalogue.toLocaleString()} card catalogue.
					Everything is stored in this browser.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex gap-2">
				<Button href="{base}/collection">Add cards</Button>
				<Button href="{base}/import" variant="outline">Import a list</Button>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
