<script lang="ts">
	import { fly } from 'svelte/transition';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import Library from '@lucide/svelte/icons/library';
	import Layers from '@lucide/svelte/icons/layers';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Import from '@lucide/svelte/icons/import';

	let { data } = $props();

	const shortcuts = [
		{ href: '/collection', icon: Library, title: 'Collection', text: 'Track what you own.' },
		{ href: '/decks', icon: Layers, title: 'Decks', text: 'Build and check legality.' },
		{ href: '/formats', icon: Sparkles, title: 'Formats', text: 'Cube pools and house rules.' },
		{ href: '/import', icon: Import, title: 'Import / export', text: 'pkmn.gg lists and AI JSON.' }
	];
</script>

<svelte:head><title>Cardex</title></svelte:head>

<PageHeader title="Overview" subtitle="Your Pokémon TCG collection at a glance" />

<div class="flex flex-col gap-6 p-4 md:p-8">
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		<StatTile label="Cards owned" value={data.stats.owned} />
		<StatTile label="Unique printings" value={data.stats.printings} />
		<StatTile label="Decks" value={data.stats.decks} />
		<StatTile
			label="Cards in catalogue"
			value={data.stats.catalogue}
			hint="synced from TCGdex"
		/>
	</div>

	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
		{#each shortcuts as shortcut, index (shortcut.href)}
			{@const Icon = shortcut.icon}
			<a href={shortcut.href} in:fly|global={{ y: 10, duration: 220, delay: index * 40 }}>
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

	{#if data.recentDecks.length}
		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-semibold">Recent decks</h2>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.recentDecks as deck (deck.id)}
					<a href="/decks/{deck.id}">
						<Card.Root class="transition-shadow hover:shadow-md">
							<Card.Header>
								<Card.Title class="text-base">{deck.name}</Card.Title>
								<Card.Description>{deck.cardCount} cards</Card.Description>
							</Card.Header>
						</Card.Root>
					</a>
				{/each}
			</div>
		</section>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Nothing here yet</Card.Title>
				<Card.Description>
					Import a pkmn.gg list, or browse the {data.stats.catalogue.toLocaleString()} card catalogue
					and start marking what you own.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex gap-2">
				<Button href="/import">Import a list</Button>
				<Button href="/cards" variant="outline">Browse cards</Button>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
