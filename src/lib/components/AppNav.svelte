<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils';
	import { toggleMode, mode } from 'mode-watcher';
	import { Button } from '$lib/components/ui/button';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Library from '@lucide/svelte/icons/library';
	import Search from '@lucide/svelte/icons/search';
	import Layers from '@lucide/svelte/icons/layers';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Import from '@lucide/svelte/icons/import';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import LogOut from '@lucide/svelte/icons/log-out';

	const links = [
		{ href: '/', label: 'Home', icon: LayoutDashboard },
		{ href: '/collection', label: 'Collection', icon: Library },
		{ href: '/cards', label: 'Cards', icon: Search },
		{ href: '/decks', label: 'Decks', icon: Layers },
		{ href: '/formats', label: 'Formats', icon: Sparkles }
	];

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<!-- Desktop: fixed sidebar -->
<aside
	class="bg-sidebar text-sidebar-foreground sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r p-4 md:flex"
>
	<a href="/" class="mb-6 flex items-center gap-2 px-2">
		<span class="bg-primary size-7 rounded-full ring-4 ring-primary/15"></span>
		<span class="text-lg font-semibold tracking-tight">Cardex</span>
	</a>

	<nav class="flex flex-1 flex-col gap-1">
		{#each links as link (link.href)}
			{@const Icon = link.icon}
			<a
				href={link.href}
				class={cn(
					'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
					isActive(link.href)
						? 'bg-sidebar-accent text-sidebar-accent-foreground'
						: 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
				)}
			>
				<Icon class="size-4 shrink-0 transition-transform group-hover:scale-110" />
				{link.label}
			</a>
		{/each}

		<a
			href="/import"
			class="text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground mt-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
		>
			<Import class="size-4 shrink-0" />
			Import / Export
		</a>
	</nav>

	<div class="flex items-center gap-1">
		<Button variant="ghost" size="icon" onclick={toggleMode} aria-label="Toggle theme">
			{#if mode.current === 'dark'}
				<Sun class="size-4" />
			{:else}
				<Moon class="size-4" />
			{/if}
		</Button>
		<form method="POST" action="/login?/logout">
			<Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
				<LogOut class="size-4" />
			</Button>
		</form>
	</div>
</aside>

<!-- Mobile: bottom tab bar -->
<nav
	class="bg-background/85 fixed inset-x-0 bottom-0 z-50 border-t backdrop-blur-lg md:hidden"
	style="padding-bottom: env(safe-area-inset-bottom)"
>
	<div class="grid grid-cols-5">
		{#each links as link (link.href)}
			{@const Icon = link.icon}
			{@const active = isActive(link.href)}
			<a
				href={link.href}
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
	</div>
</nav>
