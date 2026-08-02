<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { Button } from '$lib/components/ui/button';

	let offlineReady = $state(false);
	let needRefresh = $state(false);
	let updateServiceWorker: ((reload?: boolean) => Promise<void>) | undefined;

	// The virtual module only exists in a real build, so load it at runtime.
	onMount(async () => {
		const { registerSW } = await import('virtual:pwa-register');
		updateServiceWorker = registerSW({
			immediate: true,
			onOfflineReady: () => (offlineReady = true),
			onNeedRefresh: () => (needRefresh = true)
		});
	});

	function dismiss() {
		offlineReady = false;
		needRefresh = false;
	}
</script>

{#if offlineReady || needRefresh}
	<div
		transition:fly={{ y: 20, duration: 250 }}
		class="bg-card fixed inset-x-4 bottom-24 z-50 flex items-center gap-3 rounded-xl border p-3 shadow-lg md:inset-x-auto md:right-6 md:bottom-6 md:w-80"
	>
		<p class="flex-1 text-sm">
			{needRefresh ? 'A new version is ready.' : 'Ready to work offline.'}
		</p>
		{#if needRefresh}
			<Button size="sm" onclick={() => updateServiceWorker?.(true)}>Reload</Button>
		{/if}
		<Button size="sm" variant="ghost" onclick={dismiss}>Dismiss</Button>
	</div>
{/if}
