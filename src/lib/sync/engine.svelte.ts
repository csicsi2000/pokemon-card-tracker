/**
 * The app-facing side of sync: reactive status for the UI, the Google sign-in flow, and
 * the wiring between the store and the engine. Everything here is optional — a build
 * without a client id, or a user who never connects, never touches Google.
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
import { SyncEngine, type SyncState, type SyncStatus } from './engine';

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

class SyncController {
	status = $state<SyncStatus>('disconnected');
	detail = $state<string | undefined>(undefined);
	email = $state<string | null>(null);
	lastSyncedAt = $state<string | null>(null);

	readonly configured = syncConfigured();

	#engine = new SyncEngine({
		drive: createDriveClient(() => ensureToken()),
		loadLocal: () => store.export(),
		saveLocal: (data) => store.replace(data),
		loadState: readState,
		saveState: (state) => {
			writeState(state);
			this.lastSyncedAt = state.lastSyncedAt;
			this.email = state.email;
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

	/** True once the user has connected on this device (token may still need refreshing). */
	get connected() {
		return this.status !== 'disconnected';
	}

	/**
	 * On app start: if this device connected before, try to get a token without a
	 * prompt and sync. A blocked popup just leaves us in "reconnect" — one tap fixes it.
	 */
	async start() {
		if (!browser || !this.configured) return;
		const state = readState();
		if (!state) return;
		this.email = state.email;
		this.lastSyncedAt = state.lastSyncedAt;
		this.status = 'reconnect';

		try {
			if (!currentToken()) await requestToken('');
			await this.#engine.sync();
		} catch (error) {
			this.status = 'reconnect';
			this.detail = error instanceof AuthError ? undefined : (error as Error).message;
		}
	}

	/** The Connect / Reconnect button: always a user gesture, so the popup is allowed. */
	async connect() {
		if (!this.configured) return;
		this.status = 'connecting';
		this.detail = undefined;
		try {
			const token = await requestToken(readState() ? '' : 'consent');
			const email = (await fetchEmail(token)) ?? this.email;
			writeState({ ...this.#engine.state, email });
			this.email = email;
			await this.#engine.sync();
		} catch (error) {
			this.status = readState() ? 'reconnect' : 'disconnected';
			this.detail = (error as Error).message;
			throw error;
		}
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

	/** Stop syncing on this device. Local data and the Drive file are both kept. */
	async disconnect() {
		this.#engine.reset();
		writeState(null);
		this.email = null;
		this.lastSyncedAt = null;
		this.status = 'disconnected';
		await revokeToken();
	}
}

export const sync = new SyncController();
