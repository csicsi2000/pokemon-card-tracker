<script lang="ts">
	/**
	 * A cloud icon that says how sync is doing; clicking it opens the Settings page — except
	 * when Google wants a fresh sign-in, where the click itself is the sign-in. Google shows
	 * its "make sure you trust this app" screen to every unreviewed personal app, so the
	 * hourly renewal can never be silent; the least it can be is one tap from anywhere,
	 * with the popup already open by the time you would otherwise be reading Settings.
	 */
	import { base } from '$app/paths';
	import { toast } from 'svelte-sonner';
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

	/** Only Google's popup needs the click; WebDAV re-entry lives on the Settings page. */
	const reconnectHere = $derived(sync.status === 'reconnect' && sync.provider === 'drive');

	async function reconnect() {
		try {
			await sync.connectGoogle();
			toast.success('Reconnected to Google Drive');
		} catch (error) {
			toast.error((error as Error).message);
		}
	}

	const classes = $derived(
		cn(
			'hover:bg-accent/60 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
			className
		)
	);
</script>

{#if reconnectHere}
	<button
		type="button"
		onclick={reconnect}
		class={cn(classes, 'w-full text-left')}
		title="Sign in to Google again — one tap, then Continue in the popup"
		aria-label="Reconnect to Google Drive"
	>
		<Icon class={cn('size-4 shrink-0', view.tone)} />
		{#if showLabel}
			<span class="text-muted-foreground">{view.label}</span>
		{/if}
	</button>
{:else}
	<a href="{base}/settings" class={classes} title={sync.detail ?? view.label} aria-label={view.label}>
		<Icon class={cn('size-4 shrink-0', view.tone)} />
		{#if showLabel}
			<span class="text-muted-foreground">{view.label}</span>
		{/if}
	</a>
{/if}
