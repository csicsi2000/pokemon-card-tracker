<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { cn } from '$lib/utils';
	import { toggleMode, mode } from 'mode-watcher';
	import { Button } from '$lib/components/ui/button';
	import * as Sheet from '$lib/components/ui/sheet';
	import SyncStatus from './SyncStatus.svelte';
	import InstallButton from './InstallButton.svelte';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Library from '@lucide/svelte/icons/library';
	import Search from '@lucide/svelte/icons/search';
	import Layers from '@lucide/svelte/icons/layers';
	import Swords from '@lucide/svelte/icons/swords';
	import Heart from '@lucide/svelte/icons/heart';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Boxes from '@lucide/svelte/icons/boxes';
	import Package from '@lucide/svelte/icons/package';
	import Import from '@lucide/svelte/icons/import';
	import Settings from '@lucide/svelte/icons/settings';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';

	/** Sidebar order on desktop; the first four are also the mobile tabs. */
	const links = [
		{ href: '/', label: 'Home', icon: LayoutDashboard },
		{ href: '/collection', label: 'Collection', icon: Library },
		{ href: '/cards', label: 'Cards', icon: Search },
		{ href: '/decks', label: 'Decks', icon: Layers },
		{ href: '/battles', label: 'Battles', icon: Swords },
		{ href: '/wants', label: 'Wants', icon: Heart },
		{ href: '/trades', label: 'Trade binder', icon: ArrowLeftRight },
		{ href: '/lots', label: 'Lots', icon: Package },
		{ href: '/sets', label: 'Sets', icon: Boxes },
		{ href: '/formats', label: 'Formats', icon: Sparkles },
		{ href: '/import', label: 'Import / Export', icon: Import },
		{ href: '/settings', label: 'Settings', icon: Settings }
	];

	const primary = links.slice(0, 4);
	const overflow = links.slice(4);

	let moreOpen = $state(false);

	/** Compare without the deployment base path, which prefixes every route. */
	const path = $derived(page.url.pathname.slice(base.length) || '/');
	const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
	const overflowActive = $derived(overflow.some((link) => isActive(link.href)));

	// Close the sheet after a tap navigates.
	$effect(() => {
		void path;
		moreOpen = false;
	});
</script>

<!-- Desktop: fixed sidebar -->
<aside
	class="bg-sidebar text-sidebar-foreground sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r p-4 md:flex"
>
	<a href="{base}/" class="mb-6 flex items-center gap-2 px-2">
		<span class="bg-primary ring-primary/15 size-7 rounded-full ring-4"></span>
		<span class="text-lg font-semibold tracking-tight">Cardex</span>
	</a>

	<nav class="flex flex-1 flex-col gap-1">
		{#each links as link (link.href)}
			{@const Icon = link.icon}
			<a
				href="{base}{link.href}"
				class={cn(
					'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
					// Import / Export and Settings are tools rather than places; set them apart.
					link.href === '/import' && 'mt-4',
					isActive(link.href)
						? 'bg-sidebar-accent text-sidebar-accent-foreground'
						: 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
				)}
			>
				<Icon class="size-4 shrink-0 transition-transform group-hover:scale-110" />
				{link.label}
			</a>
		{/each}
	</nav>

	<InstallButton class="text-muted-foreground mb-1" />

	<div class="flex items-center justify-between">
		<SyncStatus showLabel />
		<!-- Google's consent screen links here, so the page must exist and be reachable from the app. -->
		<a
			href="{base}/privacy.html"
			class="text-muted-foreground hover:text-foreground px-2 text-xs underline-offset-2 hover:underline"
		>
			Privacy
		</a>
		<Button variant="ghost" size="icon" onclick={toggleMode} aria-label="Toggle theme">
			{#if mode.current === 'dark'}
				<Sun class="size-4" />
			{:else}
				<Moon class="size-4" />
			{/if}
		</Button>
	</div>
</aside>

<!-- Mobile: bottom tab bar, with the rest behind "More" -->
<nav
	class="bg-background/85 fixed inset-x-0 bottom-0 z-50 border-t backdrop-blur-lg md:hidden"
	style="padding-bottom: env(safe-area-inset-bottom)"
>
	<div class="grid grid-cols-5">
		{#each primary as link (link.href)}
			{@const Icon = link.icon}
			{@const active = isActive(link.href)}
			<a
				href="{base}{link.href}"
				class={cn(
					'relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
					active ? 'text-primary' : 'text-muted-foreground'
				)}
			>
				{#if active}
					<span class="bg-primary absolute top-0 h-0.5 w-8 rounded-full"></span>
				{/if}
				<Icon class={cn('size-5 transition-transform', active && 'scale-110')} />
				{link.label}
			</a>
		{/each}

		<button
			type="button"
			onclick={() => (moreOpen = true)}
			class={cn(
				'relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
				overflowActive ? 'text-primary' : 'text-muted-foreground'
			)}
		>
			{#if overflowActive}
				<span class="bg-primary absolute top-0 h-0.5 w-8 rounded-full"></span>
			{/if}
			<Ellipsis class="size-5" />
			More
		</button>
	</div>
</nav>

<Sheet.Root bind:open={moreOpen}>
	<Sheet.Content side="bottom" class="gap-0">
		<Sheet.Header>
			<Sheet.Title>More</Sheet.Title>
		</Sheet.Header>
		<div class="flex flex-col gap-1 p-4 pb-8">
			{#each overflow as link (link.href)}
				{@const Icon = link.icon}
				<a
					href="{base}{link.href}"
					class={cn(
						'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
						isActive(link.href) ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
					)}
				>
					<Icon class="size-4 shrink-0" />
					{link.label}
				</a>
			{/each}

			<InstallButton class="py-3" />

			<SyncStatus showLabel class="py-3" />

			<a
				href="{base}/privacy.html"
				class="text-muted-foreground hover:text-foreground px-3 py-2 text-xs underline-offset-2 hover:underline"
			>
				Privacy
			</a>

			<button
				type="button"
				onclick={toggleMode}
				class="hover:bg-accent/60 flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors"
			>
				{#if mode.current === 'dark'}
					<Sun class="size-4 shrink-0" /> Light mode
				{:else}
					<Moon class="size-4 shrink-0" /> Dark mode
				{/if}
			</button>
		</div>
	</Sheet.Content>
</Sheet.Root>
