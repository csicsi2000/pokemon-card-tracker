/**
 * The sync cycle, with every side effect injected so it runs against a fake backend in
 * tests. One operation — `sync()` — does everything: fetch the remote file if it has
 * changed, merge it with local data, save the merge locally, and upload it if the
 * remote copy is now behind. Called on load, on "Sync now", and debounced after edits.
 */
import { merge, sameData } from '$lib/data/merge';
import { migrate } from '$lib/data/migrate';
import { repair } from '$lib/data/repair';
import type { UserData } from '$lib/data/model';
import {
	SyncAuthError,
	SyncMissingError,
	type RemoteFileMeta,
	type SyncBackend,
	type SyncProvider
} from './backend';
import type { WebDavConfig } from './webdav';

export type SyncStatus =
	| 'disconnected'
	| 'connecting'
	| 'idle'
	| 'syncing'
	| 'offline'
	| 'reconnect'
	| 'error';

/** Per-device bookkeeping. Lives in its own localStorage key and is never merged. */
export type SyncState = {
	fileId: string | null;
	remoteVersion: string | number | null;
	lastSyncedAt: string | null;
	/** Google account, when the provider is Drive. */
	email: string | null;
	/** Missing on records written before WebDAV existed, which were all Drive. */
	provider?: SyncProvider;
	/** WebDAV server and login, kept only in this browser. */
	webdav?: WebDavConfig;
};

export const emptySyncState = (): SyncState => ({
	fileId: null,
	remoteVersion: null,
	lastSyncedAt: null,
	email: null
});

export type SyncDeps = {
	backend: SyncBackend;
	loadLocal: () => UserData;
	/** Persist a merged payload; the store treats it as already merged and repaired. */
	saveLocal: (data: UserData) => void;
	loadState: () => SyncState | null;
	saveState: (state: SyncState) => void;
	now: () => string;
	onStatus?: (status: SyncStatus, detail?: string) => void;
	/**
	 * Optional: render the payload as Markdown for `cardex-readable.md` next to the data
	 * file, a copy AI assistants with access to the storage can read directly. Written after every upload; a
	 * failure here never fails the sync.
	 */
	renderReadable?: (data: UserData) => string;
};

/** Distinguish "the credentials were refused" (fixable by the user) from everything else. */
export const isAuthFailure = (error: unknown) =>
	error instanceof SyncAuthError || (error as { name?: string })?.name === 'AuthError';

const isNetworkFailure = (error: unknown) =>
	error instanceof TypeError || (error as { name?: string })?.name === 'AbortError';

export class SyncEngine {
	#deps: SyncDeps;
	#inflight: Promise<void> | null = null;
	#again = false;
	#timer: ReturnType<typeof setTimeout> | null = null;
	/** Last payload known to be remote, so an unchanged file need not be downloaded twice. */
	#remote: { version: string | number; data: UserData } | null = null;

	status: SyncStatus = 'disconnected';
	detail: string | undefined;

	constructor(deps: SyncDeps) {
		this.#deps = deps;
	}

	#set(status: SyncStatus, detail?: string) {
		this.status = status;
		this.detail = detail;
		this.#deps.onStatus?.(status, detail);
	}

	get state(): SyncState {
		return this.#deps.loadState() ?? emptySyncState();
	}

	/** Run one cycle; concurrent calls coalesce into one more run after the current one. */
	sync(): Promise<void> {
		if (this.#inflight) {
			this.#again = true;
			return this.#inflight;
		}
		this.#inflight = this.#run().finally(() => {
			this.#inflight = null;
			if (this.#again) {
				this.#again = false;
				void this.sync();
			}
		});
		return this.#inflight;
	}

	/** Debounced sync, for "the user just edited something". */
	schedule(delayMs = 3000) {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			this.#timer = null;
			void this.sync();
		}, delayMs);
	}

	cancelScheduled() {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
	}

	async #run() {
		const { backend, loadLocal, saveLocal, saveState, now } = this.#deps;
		this.#set('syncing');

		try {
			const state = this.state;
			let meta: RemoteFileMeta | null = state.fileId ? await backend.getMeta(state.fileId) : null;
			if (!meta) meta = await backend.findFile();

			const local = loadLocal();

			// Nothing remote yet: this device's data becomes the file.
			if (!meta) {
				const created = await backend.createFile(JSON.stringify(local));
				this.#remote = { version: created.version, data: local };
				saveState({ ...state, fileId: created.id, remoteVersion: created.version, lastSyncedAt: now() });
				await this.#writeReadable(local);
				this.#set('idle');
				return;
			}

			// Download only when the file moved on since we last saw it.
			let remote: UserData;
			if (this.#remote && this.#remote.version === meta.version && state.fileId === meta.id) {
				remote = this.#remote.data;
			} else {
				remote = migrate(JSON.parse(await backend.download(meta.id)));
				this.#remote = { version: meta.version, data: remote };
			}

			const merged = repair(merge(local, remote), { now: now(), lastSyncedAt: state.lastSyncedAt });

			if (!sameData(merged, local)) saveLocal(merged);

			let version = meta.version;
			if (!sameData(merged, remote)) {
				// Someone may have written in the meantime; re-check before overwriting.
				const latest = await backend.getMeta(meta.id);
				if (latest && latest.version !== meta.version) {
					this.#again = true; // next run merges their write too
				} else {
					const uploaded = await backend.upload(meta.id, JSON.stringify(merged));
					version = uploaded.version;
					this.#remote = { version, data: merged };
					await this.#writeReadable(merged);
				}
			}

			saveState({ ...state, fileId: meta.id, remoteVersion: version, lastSyncedAt: now() });
			this.#set('idle');
		} catch (error) {
			if (error instanceof SyncMissingError) {
				// File vanished under us: forget it and let the next run recreate it.
				this.#remote = null;
				saveState({ ...this.state, fileId: null, remoteVersion: null });
				this.#again = true;
				this.#set('idle');
				return;
			}
			if (isAuthFailure(error)) {
				this.#set('reconnect', (error as Error).message);
				return;
			}
			if (isNetworkFailure(error)) {
				this.#set('offline');
				return;
			}
			this.#set('error', (error as Error).message);
		}
	}

	async #writeReadable(data: UserData) {
		const render = this.#deps.renderReadable;
		if (!render) return;
		try {
			await this.#deps.backend.putCompanion('readable', 'cardex-readable.md', 'text/markdown', render(data));
		} catch (error) {
			console.warn('Could not write cardex-readable.md', error);
		}
	}

	/** Forget the remote snapshot, e.g. after disconnecting. */
	reset() {
		this.cancelScheduled();
		this.#remote = null;
		this.#again = false;
		this.#set('disconnected');
	}
}
