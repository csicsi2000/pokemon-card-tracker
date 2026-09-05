import { describe, expect, it } from 'vitest';
import type { UserData } from '../src/lib/data/model';
import * as mutate from '../src/lib/data/mutations';
import { SyncAuthError, type RemoteFileMeta, type SyncBackend } from '../src/lib/sync/backend';
import { SyncEngine, type SyncState } from '../src/lib/sync/engine';
import { fixedClock, makeDeck, makeUserData } from './data-helpers';

/** An in-memory Drive: one file, a version counter, optional auth failure. */
function fakeDrive() {
	let file: { id: string; version: number; body: string } | null = null;
	let failAuth = false;
	const meta = (): RemoteFileMeta => ({ id: file!.id, version: file!.version, modifiedTime: 'now' });
	const guard = () => {
		if (failAuth) throw new SyncAuthError();
	};

	const client: SyncBackend = {
		async findFile() {
			guard();
			return file ? meta() : null;
		},
		async createFile(json) {
			guard();
			file = { id: 'file-1', version: 1, body: json };
			return meta();
		},
		async getMeta(fileId) {
			guard();
			return file && file.id === fileId ? meta() : null;
		},
		async download(fileId) {
			guard();
			if (!file || file.id !== fileId) throw new Error('missing');
			return file.body;
		},
		async upload(fileId, json) {
			guard();
			if (!file || file.id !== fileId) throw new Error('missing');
			file = { ...file, version: file.version + 1, body: json };
			return meta();
		},
		async putCompanion(tag, name, mimeType, body) {
			guard();
			companions.set(tag, { name, mimeType, body });
		}
	};
	const companions = new Map<string, { name: string; mimeType: string; body: string }>();

	return {
		client,
		get file() {
			return file;
		},
		remote: () => JSON.parse(file!.body) as UserData,
		companions,
		setFailAuth(value: boolean) {
			failAuth = value;
		}
	};
}

/** A device: its own local data, sync state and engine sharing one fake Drive. */
function device(drive: SyncBackend, initial: UserData, renderReadable?: (data: UserData) => string) {
	let local = initial;
	let state: SyncState | null = null;
	const statuses: string[] = [];
	const clock = fixedClock('2026-03-01T00:00:00.000Z');
	const engine = new SyncEngine({
		backend: drive,
		loadLocal: () => local,
		saveLocal: (data) => (local = data),
		loadState: () => state,
		saveState: (next) => (state = next),
		now: () => clock.next(),
		onStatus: (status) => statuses.push(status),
		renderReadable
	});
	return {
		engine,
		statuses,
		clock,
		get local() {
			return local;
		},
		set local(value: UserData) {
			local = value;
		},
		get state() {
			return state;
		}
	};
}

describe('SyncEngine', () => {
	it('creates the file from local data on first sync', async () => {
		const drive = fakeDrive();
		const a = device(drive.client, makeUserData({ decks: [makeDeck({ id: 'd1' })] }));

		await a.engine.sync();

		expect(drive.file?.version).toBe(1);
		expect(drive.remote().decks.map((d) => d.id)).toEqual(['d1']);
		expect(a.state).toMatchObject({ fileId: 'file-1', remoteVersion: 1 });
		expect(a.statuses).toEqual(['syncing', 'idle']);
	});

	it('merges two devices both ways', async () => {
		const drive = fakeDrive();
		const a = device(drive.client, makeUserData({ decks: [makeDeck({ id: 'a-deck' })] }));
		const b = device(drive.client, makeUserData({ decks: [makeDeck({ id: 'b-deck' })] }));

		await a.engine.sync();
		await b.engine.sync(); // B pulls A's deck and pushes its own
		expect(b.local.decks.map((d) => d.id).sort()).toEqual(['a-deck', 'b-deck']);
		expect(drive.file?.version).toBe(2);

		await a.engine.sync(); // A sees version 2 and pulls B's deck
		expect(a.local.decks.map((d) => d.id).sort()).toEqual(['a-deck', 'b-deck']);
		expect(drive.file?.version).toBe(2); // nothing new to upload
	});

	it('propagates a deletion instead of resurrecting the record', async () => {
		const drive = fakeDrive();
		const shared = makeUserData({ decks: [makeDeck({ id: 'd1' }), makeDeck({ id: 'd2' })] });
		const a = device(drive.client, shared);
		const b = device(drive.client, shared);
		await a.engine.sync();
		await b.engine.sync();

		a.local = mutate.deleteDeck(a.local, a.clock, 'd1');
		await a.engine.sync();
		await b.engine.sync();

		expect(b.local.decks.map((d) => d.id)).toEqual(['d2']);
		expect(drive.remote().decks.map((d) => d.id)).toEqual(['d2']);
	});

	it('does not download again when the remote version is unchanged', async () => {
		const drive = fakeDrive();
		let downloads = 0;
		const counting: SyncBackend = {
			...drive.client,
			download: (id) => {
				downloads += 1;
				return drive.client.download(id);
			}
		};
		const a = device(counting, makeUserData());
		const b = device(drive.client, makeUserData({ decks: [makeDeck({ id: 'x' })] }));

		await b.engine.sync();
		await a.engine.sync();
		await a.engine.sync();
		await a.engine.sync();

		expect(downloads).toBe(1);
	});

	it('parks in "reconnect" when the token is rejected and keeps local data', async () => {
		const drive = fakeDrive();
		const a = device(drive.client, makeUserData({ decks: [makeDeck({ id: 'd1' })] }));
		drive.setFailAuth(true);

		await a.engine.sync();

		expect(a.engine.status).toBe('reconnect');
		expect(a.local.decks).toHaveLength(1);
		expect(drive.file).toBeNull();
	});

	it('writes the readable companion after every upload, and survives its failure', async () => {
		const drive = fakeDrive();
		const a = device(drive.client, makeUserData({ decks: [makeDeck({ id: 'd1' })] }), (data) => `# ${data.decks.length} decks`);
		await a.engine.sync();
		expect(drive.companions.get('readable')).toMatchObject({ name: 'cardex-readable.md', body: '# 1 decks' });

		const broken = device(
			{ ...drive.client, putCompanion: async () => { throw new Error('quota'); } },
			makeUserData({ decks: [makeDeck({ id: 'd2' })] }),
			() => 'x'
		);
		await broken.engine.sync();
		expect(broken.engine.status).toBe('idle');
		expect(drive.remote().decks.map((d) => d.id).sort()).toEqual(['d1', 'd2']);
	});

	it('coalesces overlapping sync calls into one extra run', async () => {
		const drive = fakeDrive();
		const a = device(drive.client, makeUserData());
		const first = a.engine.sync();
		const second = a.engine.sync();
		expect(second).toBe(first);
		await first;
		// A queued run follows; give it a tick to finish.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(a.engine.status).toBe('idle');
	});
});
