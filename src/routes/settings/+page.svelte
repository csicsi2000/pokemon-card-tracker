<script lang="ts">
	import { toast } from 'svelte-sonner';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import Cloud from '@lucide/svelte/icons/cloud';
	import PanelRight from '@lucide/svelte/icons/panel-right';
	import SquareSquare from '@lucide/svelte/icons/square-square';
	import Server from '@lucide/svelte/icons/server';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import LogOut from '@lucide/svelte/icons/log-out';
	import { prefs, CARD_VIEW_LABELS, type CardView } from '$lib/prefs.svelte';
	import { store } from '$lib/store.svelte';
	import { sync } from '$lib/sync/engine.svelte';
	import { popupUnsupported } from '$lib/sync/google-auth';

	/** The two shells CardDetailSheet can use, in the order they are offered. */
	const cardViews: { value: CardView; icon: typeof PanelRight; hint: string }[] = [
		{
			value: 'side',
			icon: PanelRight,
			hint: 'Slides in from the right, beside the list you opened it from.'
		},
		{
			value: 'center',
			icon: SquareSquare,
			hint: 'Opens in the middle of the screen with the art shown large beside the details.'
		}
	];

	const busy = $derived(sync.status === 'connecting' || sync.status === 'syncing');
	const standaloneIos = popupUnsupported();
	const origin = typeof location === 'undefined' ? 'this site' : location.origin;

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
				return {
					text: sync.provider === 'webdav' ? 'Login rejected' : 'Sign-in expired',
					variant: 'outline' as const
				};
			case 'error':
				return { text: 'Error', variant: 'destructive' as const };
			default:
				return { text: 'Not connected', variant: 'outline' as const };
		}
	});

	const hasLocalData = $derived(
		store.collection.length +
			store.wants.length +
			store.decks.length +
			store.lots.length +
			store.formats.length >
		0
	);

	// WebDAV form, prefilled with the last settings used on this device.
	let davUrl = $state(sync.webdav?.url ?? '');
	let davUser = $state(sync.webdav?.username ?? '');
	let davPassword = $state(sync.webdav?.password ?? '');
	let showDavForm = $state(false);
	/** Which Connect button was pressed last, so its card shows the outcome. */
	let attempt = $state<'google' | 'webdav' | null>(null);
	const needsAttention = $derived(sync.status === 'reconnect' || sync.status === 'error');

	async function connectGoogle() {
		attempt = 'google';
		try {
			await sync.connectGoogle();
			toast.success('Connected to Google Drive');
		} catch (error) {
			toast.error(`Could not connect: ${(error as Error).message}`);
		}
	}

	async function connectWebDav(event: SubmitEvent) {
		event.preventDefault();
		attempt = 'webdav';
		try {
			await sync.connectWebDav({ url: davUrl, username: davUser, password: davPassword });
			showDavForm = false;
			toast.success('Connected to your WebDAV server');
		} catch (error) {
			toast.error(`Could not connect: ${(error as Error).message}`);
		}
	}

	async function syncNow() {
		await sync.syncNow();
		if (sync.status === 'idle') toast.success('Synced');
		else if (sync.status === 'reconnect') {
			toast.warning(
				sync.provider === 'webdav' ? 'Check the WebDAV login.' : 'Please reconnect to Google first.'
			);
		} else if (sync.detail) toast.error(sync.detail);
	}

	async function disconnect() {
		const where = sync.provider === 'webdav' ? 'the file on your server' : 'the Drive file';
		if (!confirm(`Stop syncing on this device? Your cards stay here and ${where} is kept.`)) return;
		await sync.disconnect();
		davPassword = '';
		toast.success('Disconnected');
	}

	const format = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never');
</script>

<svelte:head><title>Settings · Cardex</title></svelte:head>

<PageHeader title="Settings" subtitle="How Cardex looks on this device, and where it syncs" />

<div class="flex max-w-3xl flex-col gap-4 p-4 md:p-8">
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Card view</Card.Title>
			<Card.Description>
				How a card opens when you tap it. Both do exactly the same things — the counters, wants
				heart and lot picker are identical. This is remembered on this device only, so a phone
				and a laptop can differ.
			</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-3 sm:grid-cols-2">
			{#each cardViews as option (option.value)}
				{@const Icon = option.icon}
				{@const active = prefs.cardView === option.value}
				<button
					type="button"
					aria-pressed={active}
					onclick={() => (prefs.cardView = option.value)}
					class="hover:bg-accent/50 focus-visible:ring-ring flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none {active
						? 'border-primary ring-primary/30 ring-2'
						: ''}"
				>
					<span class="flex items-center gap-2 text-sm font-medium">
						<Icon class="size-4" />
						{CARD_VIEW_LABELS[option.value]}
					</span>
					<span class="text-muted-foreground text-xs">{option.hint}</span>
				</button>
			{/each}
		</Card.Content>
	</Card.Root>

	{#if sync.connected}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2 text-base">
					{#if sync.provider === 'webdav'}
						<Server class="size-4" /> WebDAV
					{:else}
						<Cloud class="size-4" /> Google Drive
					{/if}
					<Badge variant={statusLabel.variant} class="ml-auto">{statusLabel.text}</Badge>
				</Card.Title>
				<Card.Description>
					{#if sync.account}Connected as <b>{sync.account}</b> ·{/if} last synced {format(sync.lastSyncedAt)}.
					{#if sync.provider === 'webdav'}
						Your data is saved as <span class="font-mono">cardex-data.json</span> in
						<span class="font-mono break-all">{sync.webdav?.url}</span>, and merged with whatever
						other devices have saved there.
					{:else}
						Your data is saved to <span class="font-mono">Cardex/cardex-data.json</span> in your My
						Drive, and merged with whatever other devices have saved there.
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3 text-sm">
				{#if sync.detail && needsAttention}
					<p class="text-destructive">{sync.detail}</p>
				{/if}
				{#if sync.provider === 'drive'}
					<p class="text-muted-foreground">
						Google sign-ins last about an hour. When one runs out the cloud icon turns amber and a
						tap on <b>Reconnect</b> picks up where it left off; edits made in between are kept
						locally and synced next.
					</p>
				{/if}
				{#if sync.provider === 'webdav' && (showDavForm || sync.status === 'reconnect')}
					<form class="flex flex-col gap-3" onsubmit={connectWebDav}>
						{@render davFields()}
						<div class="flex gap-2">
							<Button type="submit" disabled={busy}><Server class="size-4" /> Save and reconnect</Button>
							<Button type="button" variant="ghost" onclick={() => (showDavForm = false)}>Cancel</Button>
						</div>
					</form>
				{/if}
			</Card.Content>
			<Card.Footer class="flex-wrap gap-2">
				{#if sync.provider === 'drive' && needsAttention}
					<Button onclick={connectGoogle} disabled={busy}><Cloud class="size-4" /> Reconnect</Button>
				{/if}
				<Button variant="outline" onclick={syncNow} disabled={busy}>
					<RefreshCw class="size-4 {busy ? 'animate-spin' : ''}" /> Sync now
				</Button>
				{#if sync.provider === 'webdav' && !showDavForm}
					<Button variant="outline" onclick={() => (showDavForm = true)} disabled={busy}>
						Change login
					</Button>
				{/if}
				<Button variant="ghost" onclick={disconnect} disabled={busy}>
					<LogOut class="size-4" /> Disconnect
				</Button>
			</Card.Footer>
		</Card.Root>
	{:else}
		<p class="text-muted-foreground text-sm">
			Cardex stores a copy of your collection, wants, lots, decks and formats as one file in storage
			<i>you</i> control. Nothing goes anywhere else — there is no Cardex server. Open Cardex on
			another device, connect the same place, and the two are merged.
			{#if hasLocalData}
				What is in this browser and what is already there (if anything) will be merged — nothing
				is thrown away.
			{/if}
		</p>

		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2 text-base">
					<Cloud class="size-4" /> Google Drive
					{#if sync.status === 'connecting' && attempt === 'google'}
						<Badge variant="secondary" class="ml-auto">Waiting for Google sign-in…</Badge>
					{/if}
				</Card.Title>
				<Card.Description>
					{#if sync.googleConfigured}
						One file, <span class="font-mono">Cardex/cardex-data.json</span>, visible in your My
						Drive. Free, no card required.
					{:else}
						Not available in this build: it needs a Google OAuth client id, which the person
						hosting Cardex adds once (free, about five minutes).
					{/if}
				</Card.Description>
			</Card.Header>
			{#if sync.googleConfigured}
				<Card.Content class="text-sm">
					{#if sync.detail && attempt === 'google'}
						<p class="text-destructive">{sync.detail}</p>
					{/if}
					{#if standaloneIos}
						<p class="text-muted-foreground">
							Google sign-in cannot finish inside a home-screen app on iOS. Open Cardex in Safari
							to connect; syncing then works here too.
						</p>
					{/if}
				</Card.Content>
				<Card.Footer>
					<Button onclick={connectGoogle} disabled={busy || standaloneIos}>
						<Cloud class="size-4" /> Connect Google Drive
					</Button>
				</Card.Footer>
			{:else}
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
							<span class="font-mono">PUBLIC_GOOGLE_CLIENT_ID=…</span>, or as the GitHub Actions
							variable <span class="font-mono">GOOGLE_CLIENT_ID</span>, and rebuild.
						</li>
					</ol>
				</Card.Content>
			{/if}
		</Card.Root>

		{#if sync.webdavOffered}
			<Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2 text-base">
						<Server class="size-4" /> WebDAV server
					</Card.Title>
					<Card.Description>
						Any folder on a WebDAV server you run or rent: Nextcloud, ownCloud, a Synology or QNAP
						NAS, Hetzner Storage Box, <span class="font-mono">rclone serve webdav</span>, and the
						like. Cardex writes <span class="font-mono">cardex-data.json</span> and a readable
						<span class="font-mono">cardex-readable.md</span> into it.
					</Card.Description>
				</Card.Header>
				<form onsubmit={connectWebDav}>
					<Card.Content class="flex flex-col gap-3 text-sm">
						{#if sync.detail && attempt === 'webdav'}
							<p class="text-destructive">{sync.detail}</p>
						{/if}
						{@render davFields()}
						<p class="text-muted-foreground">
							The login is stored in this browser only and sent straight to your server. Prefer an
							app password if your server offers them. Because Cardex runs in the browser, the
							server must allow cross-origin (CORS) requests from
							<span class="font-mono break-all">{origin}</span>: methods HEAD, GET, PUT and MKCOL,
							header Authorization, and ideally expose ETag — see the README for a recipe.
						</p>
					</Card.Content>
					<Card.Footer>
						<Button type="submit" disabled={busy || !davUrl.trim()}>
							{#if busy && attempt === 'webdav'}
								<RefreshCw class="size-4 animate-spin" />
							{:else}
								<Server class="size-4" />
							{/if}
							Connect WebDAV
						</Button>
					</Card.Footer>
				</form>
			</Card.Root>
		{/if}
	{/if}

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
</div>

{#snippet davFields()}
	<div class="grid gap-1.5">
		<Label for="dav-url">Folder URL</Label>
		<Input
			id="dav-url"
			type="url"
			bind:value={davUrl}
			placeholder="https://cloud.example.com/remote.php/dav/files/you/Cardex/"
			autocomplete="url"
			spellcheck={false}
		/>
	</div>
	<div class="grid gap-3 sm:grid-cols-2">
		<div class="grid gap-1.5">
			<Label for="dav-user">Username</Label>
			<Input id="dav-user" bind:value={davUser} autocomplete="username" spellcheck={false} />
		</div>
		<div class="grid gap-1.5">
			<Label for="dav-password">Password</Label>
			<Input id="dav-password" type="password" bind:value={davPassword} autocomplete="current-password" />
		</div>
	</div>
{/snippet}
