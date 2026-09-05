<script lang="ts">
	import '../app.css';
	import { ModeWatcher, mode } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner';
	import AppNav from '$lib/components/AppNav.svelte';
	import ReloadPrompt from '$lib/components/ReloadPrompt.svelte';
	import { onMount, untrack } from 'svelte';
	import { store } from '$lib/store.svelte';
	import { sync } from '$lib/sync/engine.svelte';
	import { install } from '$lib/pwa/install.svelte';

	let { children } = $props();

	// Optional sync (Google Drive or WebDAV): reconnect silently if this device connected
	// before, and push local edits a few seconds after they happen. Only the revision may
	// re-run the effect — the handler reads sync status, which must not retrigger it.
	onMount(() => {
		void sync.start();
		// Catch Chromium's deferred install prompt so the app can offer its own button.
		return install.listen();
	});
	$effect(() => {
		void store.revision;
		untrack(() => sync.onLocalChange());
	});
</script>

<svelte:head>
	<!-- The rest of the app's head is static and lives in src/app.html. This one is not:
	     it tints the browser and status-bar chrome to match the theme in use. -->
	<meta name="theme-color" content={mode.current === 'light' ? '#ffffff' : '#0c0a09'} />
</svelte:head>

<ModeWatcher />
<Toaster position="top-center" richColors />
<ReloadPrompt />

<!-- viewport-fit=cover (app.html) lets the bottom tab bar clear the home indicator; the
     side insets keep content off the notch when an installed iPhone is held sideways. -->
<div
	class="bg-background min-h-svh md:flex"
	style="padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right)"
>
	<AppNav />
	<main class="min-w-0 flex-1 pb-24 md:pb-0">
		{@render children()}
	</main>
</div>
