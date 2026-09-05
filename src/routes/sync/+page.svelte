<script lang="ts">
	import { toast } from 'svelte-sonner';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import Cloud from '@lucide/svelte/icons/cloud';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import LogOut from '@lucide/svelte/icons/log-out';
	import { store } from '$lib/store.svelte';
	import { sync } from '$lib/sync/engine.svelte';
	import { popupUnsupported } from '$lib/sync/google-auth';

	const busy = $derived(sync.status === 'connecting' || sync.status === 'syncing');
	const standaloneIos = popupUnsupported();

	const statusLabel = $derived.by(() => {
		switch (sync.status) {
			case 'idle':
				return { text: 'Up to date', variant: 'default' as const };
			case 'syncing':
				return { text: 'Syncing…', variant: 'secondary' as const };
			case 'connecting':
				return { text: 'Connecting…', variant: 'secondary' as const };
			case 'offline':
				return { text: 'Offline — will retry', variant: 'outline' as const };
			case 'reconnect':
				return { text: 'Sign-in expired', variant: 'outline' as const };
			case 'error':
				return { text: 'Error', variant: 'destructive' as const };
			default:
				return { text: 'Not connected', variant: 'outline' as const };
		}
	});

	const hasLocalData = $derived(
		store.collection.length + store.decks.length + store.lots.length + store.formats.length > 0
	);

	async function connect() {
		try {
			await sync.connect();
			toast.success('Connected to Google Drive');
		} catch (error) {
			toast.error(`Could not connect: ${(error as Error).message}`);
		}
	}

	async function syncNow() {
		await sync.syncNow();
		if (sync.status === 'idle') toast.success('Synced');
		else if (sync.status === 'reconnect') toast.warning('Please reconnect to Google first.');
		else if (sync.detail) toast.error(sync.detail);
	}

	async function disconnect() {
		if (!confirm('Stop syncing on this device? Your cards stay here and the Drive file is kept.')) return;
		await sync.disconnect();
		toast.success('Disconnected');
	}

	const format = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never');
</script>

<svelte:head><title>Sync · Cardex</title></svelte:head>

<PageHeader title="Google Drive sync" subtitle="Optional — keep the same collection on every device" />

<div class="flex max-w-3xl flex-col gap-4 p-4 md:p-8">
	{#if !sync.configured}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Sync is not set up for this build</Card.Title>
				<Card.Description>
					Cardex works entirely in your browser. To sync through your own Google Drive, the
					build needs a Google OAuth client id — free, no card required. It takes about five
					minutes once:
				</Card.Description>
			</Card.Header>
			<Card.Content class="text-sm">
				<ol class="text-muted-foreground list-decimal space-y-1.5 pl-5">
					<li>Open <span class="font-mono">console.cloud.google.com</span> and create a project.</li>
					<li>APIs &amp; Services → Library → enable the <b>Google Drive API</b>.</li>
					<li>
						OAuth consent screen → External, add your own Google account as a test user. Scopes:
						<span class="font-mono">drive.file</span> and <span class="font-mono">userinfo.email</span>.
					</li>
					<li>
						Credentials → Create OAuth client ID → Web application. Authorized JavaScript origins:
						your site's origin (and <span class="font-mono">http://localhost:5173</span> for dev).
					</li>
					<li>
						Put the client id in <span class="font-mono">.env</span> as
						<span class="font-mono">PUBLIC_GOOGLE_CLIENT_ID=…</span>, or as the GitHub Actions variable
						<span class="font-mono">GOOGLE_CLIENT_ID</span>, and rebuild.
					</li>
				</ol>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2 text-base">
					<Cloud class="size-4" />
					{sync.status === 'connecting'
						? 'Waiting for Google sign-in…'
						: sync.connected
							? 'Connected'
							: 'Connect your Google account'}
					<Badge variant={statusLabel.variant} class="ml-auto">{statusLabel.text}</Badge>
				</Card.Title>
				<Card.Description>
					{#if sync.connected}
						{#if sync.email}Signed in as <b>{sync.email}</b> · {/if}last synced {format(sync.lastSyncedAt)}.
						Your data is saved to <span class="font-mono">Cardex/cardex-data.json</span> in your My
						Drive, and merged with whatever other devices have saved there.
					{:else}
						Cardex stores a copy of your collection, lots, decks and formats as one file in your
						own Google Drive. Nothing goes anywhere else — there is no Cardex server. Open Cardex
						on another device, connect the same account, and the two are merged.
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3 text-sm">
				{#if sync.detail && (sync.status === 'error' || sync.status === 'reconnect')}
					<p class="text-destructive">{sync.detail}</p>
				{/if}
				{#if standaloneIos}
					<p class="text-muted-foreground">
						Google sign-in cannot finish inside a home-screen app on iOS. Open Cardex in Safari
						to connect; syncing then works here too.
					</p>
				{/if}
				{#if !sync.connected && hasLocalData}
					<p class="text-muted-foreground">
						What is in this browser and what is already on Drive (if anything) will be merged —
						nothing is thrown away.
					</p>
				{/if}
				<p class="text-muted-foreground">
					Google sign-ins last about an hour. When one runs out the cloud icon turns amber and a
					tap on <b>Reconnect</b> picks up where it left off; edits made in between are kept locally
					and synced next.
				</p>
			</Card.Content>
			<Card.Footer class="flex-wrap gap-2">
				{#if !sync.connected}
					<Button onclick={connect} disabled={busy || standaloneIos}>
						<Cloud class="size-4" /> Connect Google Drive
					</Button>
				{:else}
					{#if sync.status === 'reconnect' || sync.status === 'error'}
						<Button onclick={connect} disabled={busy}>
							<Cloud class="size-4" /> Reconnect
						</Button>
					{/if}
					<Button variant="outline" onclick={syncNow} disabled={busy}>
						<RefreshCw class="size-4 {busy ? 'animate-spin' : ''}" /> Sync now
					</Button>
					<Button variant="ghost" onclick={disconnect} disabled={busy}>
						<LogOut class="size-4" /> Disconnect
					</Button>
				{/if}
			</Card.Footer>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">How conflicts are handled</Card.Title>
				<Card.Description>
					Every card row, lot, deck, folder and format carries the time it was last changed. When two
					devices disagree, the newer change wins for that record only, and deletions are remembered
					so a deleted deck does not come back. Two devices that both edit the same lot at the same
					moment can double-count that one edit — rare, and easy to fix by hand.
				</Card.Description>
			</Card.Header>
		</Card.Root>
	{/if}
</div>
