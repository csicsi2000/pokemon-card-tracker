/**
 * The app-facing side of sync: reactive status for the UI, the connect flows for each
 * provider (Google Drive, WebDAV), and the wiring between the store and the engine.
 * Everything here is optional — a user who never connects never touches a server.
 */
import { browser } from '$app/environment';
import { toReadableMarkdown } from '$lib/agent/readable';
import { getCatalogue } from '$lib/catalogue';
import { store } from '$lib/store.svelte';
import {
	AuthError,
	currentToken,
	ensureToken,
	fetchEmail,
	requestToken,
	revokeToken,
	syncConfigured
} from './google-auth';
import { createDriveClient } from './drive';
import {
	createWebDavClient,
	describeWebDav,
	normalizeWebDavUrl,
	webdavEnabled,
	type WebDavConfig
} from './webdav';
import { SyncAuthError, type SyncBackend, type SyncProvider } from './backend';
import { emptySyncState, SyncEngine, type SyncState, type SyncStatus } from './engine';

const STATE_KEY = 'cardex:sync:v1';

function readState(): SyncState | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STATE_KEY);
		return raw ? (JSON.parse(raw) as SyncState) : null;
	} catch {
		return null;
	}
}

function writeState(state: SyncState | null) {
	if (!browser) return;
	if (state) localStorage.setItem(STATE_KEY, JSON.stringify(state));
	else localStorage.removeItem(STATE_KEY);
}

/** Records written before WebDAV existed carry no provider; they were all Drive. */
const providerOf = (state: SyncState | null): SyncProvider | null =>
	state ? (state.provider ?? 'drive') : null;

/**
 * The engine is built once, but which server it talks to changes with the connection.
 * This forwards every call to the backend that is current at that moment.
 */
function switchableBackend(current: () => SyncBackend | null): SyncBackend {
	const get = () => {
		const backend = current();
		if (!backend) throw new Error('Sync is not connected');
		return backend;
	};
	return {
		findFile: () => get().findFile(),
		createFile: (json) => get().createFile(json),
		getMeta: (id) => get().getMeta(id),
		download: (id) => get().download(id),
		upload: (id, json) => get().upload(id, json),
		putCompanion: (tag, name, mime, body) => get().putCompanion(tag, name, mime, body)
	};
}

class SyncController {
	status = $state<SyncStatus>('disconnected');
	detail = $state<string | undefined>(undefined);
	provider = $state<SyncProvider | null>(null);
	/** Google account (Drive) or `user @ host` (WebDAV). */
	account = $state<string | null>(null);
	lastSyncedAt = $state<string | null>(null);
	/** Last WebDAV settings used on this device, so the form can be prefilled. */
	webdav = $state<WebDavConfig | null>(null);

	/** Google Drive needs a client id baked into the build. */
	readonly googleConfigured = syncConfigured();
	/**
	 * Whether Settings offers WebDAV as a new connection. A device already connected that
	 * way keeps working and can still be managed either way — this only hides the entry.
	 */
	readonly webdavOffered = webdavEnabled();

	#backend: SyncBackend | null = null;

	#engine = new SyncEngine({
		backend: switchableBackend(() => this.#backend),
		loadLocal: () => store.export(),
		saveLocal: (data) => store.replace(data),
		loadState: readState,
		saveState: (state) => {
			writeState(state);
			this.#reflect(state);
		},
		now: () => new Date().toISOString(),
		onStatus: (status, detail) => {
			this.status = status;
			this.detail = detail;
		},
		renderReadable: (data) => {
			const catalogue = getCatalogue();
			if (!catalogue) throw new Error('Catalogue not loaded yet');
			return toReadableMarkdown(data, catalogue, { title: 'Cardex collection (synced copy)' });
		}
	});

	/** True once the user has connected on this device (credentials may still need refreshing). */
	get connected() {
		return this.status !== 'disconnected';
	}

	#reflect(state: SyncState | null) {
		this.provider = providerOf(state);
		this.lastSyncedAt = state?.lastSyncedAt ?? null;
		if (state?.webdav) this.webdav = state.webdav;
		this.account =
			this.provider === 'webdav' && state?.webdav
				? describeWebDav(state.webdav)
				: (state?.email ?? null);
	}

	#useBackend(provider: SyncProvider, webdav?: WebDavConfig) {
		this.#backend =
			provider === 'webdav' && webdav
				? createWebDavClient(webdav)
				: createDriveClient(() => ensureToken());
	}

	/**
	 * On app start: if this device connected before, pick up where it left off. Drive may
	 * need a silent token; a blocked popup just leaves us in "reconnect" — one tap fixes it.
	 */
	async start() {
		if (!browser) return;
		const state = readState();
		if (!state) return;
		const provider = providerOf(state)!;
		this.#reflect(state);

		if (provider === 'webdav') {
			if (!state.webdav) return;
			this.#useBackend('webdav', state.webdav);
			await this.#engine.sync();
			return;
		}

		if (!this.googleConfigured) return;
		this.status = 'reconnect';
		this.#useBackend('drive');
		try {
			if (!currentToken()) await requestToken('');
			await this.#engine.sync();
		} catch (error) {
			this.status = 'reconnect';
			this.detail = error instanceof AuthError ? undefined : (error as Error).message;
		}
	}

	/** The Connect / Reconnect button for Google: always a user gesture, so the popup is allowed. */
	async connectGoogle() {
		if (!this.googleConfigured) return;
		const previous = readState();
		const resuming = providerOf(previous) === 'drive';
		this.status = 'connecting';
		this.detail = undefined;
		try {
			const token = await requestToken(resuming ? '' : 'consent');
			const email = (await fetchEmail(token)) ?? (resuming ? previous!.email : null);
			const state: SyncState = resuming
				? { ...previous!, email, provider: 'drive' }
				: { ...emptySyncState(), email, provider: 'drive' };
			if (!resuming) this.#engine.reset();
			writeState(state);
			this.#reflect(state);
			this.#useBackend('drive');
			await this.#engine.sync();
		} catch (error) {
			this.status = resuming ? 'reconnect' : 'disconnected';
			this.detail = (error as Error).message;
			throw error;
		}
	}

	/**
	 * Connect to a WebDAV folder. Reaches the server once before saving anything, so a
	 * typo or a missing CORS header shows up as a clear message instead of "offline".
	 */
	async connectWebDav(input: WebDavConfig) {
		const config: WebDavConfig = {
			url: normalizeWebDavUrl(input.url),
			username: input.username.trim(),
			password: input.password
		};
		if (!config.url) throw new Error('Enter the URL of a folder on your WebDAV server');

		const previous = readState();
		const resuming =
			providerOf(previous) === 'webdav' &&
			previous?.webdav?.url === config.url &&
			previous?.webdav?.username === config.username;

		this.status = 'connecting';
		this.detail = undefined;
		const backend = createWebDavClient(config);
		try {
			await backend.findFile();
		} catch (error) {
			this.status = previous ? 'reconnect' : 'disconnected';
			if (error instanceof SyncAuthError) {
				this.detail = error.message;
				throw error;
			}
			const message =
				error instanceof TypeError
					? `Could not reach ${config.url}. Check the address, and that the server allows ` +
						`cross-origin (CORS) requests from ${location.origin}.`
					: (error as Error).message;
			this.detail = message;
			throw new Error(message);
		}

		const state: SyncState = resuming
			? { ...previous!, provider: 'webdav', webdav: config, email: null }
			: { ...emptySyncState(), provider: 'webdav', webdav: config };
		if (!resuming) this.#engine.reset();
		writeState(state);
		this.#reflect(state);
		this.#backend = backend;
		await this.#engine.sync();
		// The engine's status callback has run by now; TS still sees the 'connecting' we set above.
		const outcome = this.status as SyncStatus;
		if (outcome === 'error' && this.detail) throw new Error(this.detail);
	}

	async syncNow() {
		if (!this.connected) return;
		await this.#engine.sync();
	}

	/** Called by the layout whenever local data changes. */
	onLocalChange() {
		if (this.status === 'idle' || this.status === 'syncing' || this.status === 'offline') {
			this.#engine.schedule();
		}
	}

	/** Stop syncing on this device. Local data and the remote file are both kept. */
	async disconnect() {
		const provider = this.provider;
		this.#engine.reset();
		writeState(null);
		this.#backend = null;
		this.provider = null;
		this.account = null;
		this.lastSyncedAt = null;
		this.status = 'disconnected';
		this.detail = undefined;
		// Keep server and user for the form; the password is gone from storage, so drop it too.
		if (this.webdav) this.webdav = { ...this.webdav, password: '' };
		if (provider === 'drive') await revokeToken();
	}
}

export const sync = new SyncController();
