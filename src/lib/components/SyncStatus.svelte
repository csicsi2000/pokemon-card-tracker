<script lang="ts">
	/** A cloud icon that says how sync is doing; clicking it opens the Sync page. */
	import { base } from '$app/paths';
	import { cn } from '$lib/utils';
	import { sync } from '$lib/sync/engine.svelte';
	import Cloud from '@lucide/svelte/icons/cloud';
	import CloudOff from '@lucide/svelte/icons/cloud-off';
	import CloudAlert from '@lucide/svelte/icons/cloud-alert';
	import CloudCheck from '@lucide/svelte/icons/cloud-check';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';

	let { class: className, showLabel = false }: { class?: string; showLabel?: boolean } = $props();

	const view = $derived.by(() => {
		switch (sync.status) {
			case 'idle':
				return { icon: CloudCheck, label: 'Synced', tone: 'text-emerald-600 dark:text-emerald-400' };
			case 'syncing':
			case 'connecting':
				return { icon: RefreshCw, label: 'Syncing…', tone: 'text-muted-foreground animate-spin' };
			case 'offline':
				return { icon: CloudOff, label: 'Offline', tone: 'text-muted-foreground' };
			case 'reconnect':
				return { icon: CloudAlert, label: 'Reconnect', tone: 'text-amber-600 dark:text-amber-400' };
			case 'error':
				return { icon: CloudAlert, label: 'Sync error', tone: 'text-destructive' };
			default:
				return { icon: Cloud, label: 'Sync', tone: 'text-muted-foreground' };
		}
	});
	const Icon = $derived(view.icon);
</script>

<a
	href="{base}/sync"
	class={cn(
		'hover:bg-accent/60 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
		className
	)}
	title={sync.detail ?? view.label}
	aria-label={view.label}
>
	<Icon class={cn('size-4 shrink-0', view.tone)} />
	{#if showLabel}
		<span class="text-muted-foreground">{view.label}</span>
	{/if}
</a>
