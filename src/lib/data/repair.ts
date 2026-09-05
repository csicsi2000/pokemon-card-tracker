/**
 * Makes a payload internally consistent. Runs after every load and every merge.
 *
 * Merging two devices' edits can leave dangling references (a deck in a folder the
 * other device deleted), folder cycles (each device moved a folder under the other), or
 * cards in a lot that no longer exists. Rather than have every mutation defend against
 * these, one deterministic pass fixes them — deterministic so that both devices reach
 * the same result from the same merged input, without needing to exchange anything more.
 *
 * Repair never stamps `updatedAt`: it is a projection, not an edit, so repairing twice
 * is the same as repairing once.
 */
import { dedupeRows } from './migrate';
import type { Tombstone, UserData } from './model';

const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type RepairOptions = {
	/** ISO time, used only to prune old tombstones. */
	now: string;
	/** When this device last synced; tombstones are kept until they are older than this. */
	lastSyncedAt?: string | null;
};

/** Keep the latest tombstone per record, dropping ones old enough to have propagated. */
function pruneTombstones(tombstones: Tombstone[], options: RepairOptions): Tombstone[] {
	const latest = new Map<string, Tombstone>();
	for (const tombstone of tombstones) {
		const key = `${tombstone.kind}|${tombstone.key}`;
		const existing = latest.get(key);
		if (!existing || tombstone.deletedAt > existing.deletedAt) latest.set(key, tombstone);
	}

	const cutoff = new Date(Date.parse(options.now) - TOMBSTONE_TTL_MS).toISOString();
	return [...latest.values()].filter((tombstone) => {
		if (tombstone.deletedAt >= cutoff) return true;
		// Old, but not yet older than the last sync: another device may still need it.
		return options.lastSyncedAt ? tombstone.deletedAt >= options.lastSyncedAt : false;
	});
}

export function repair(data: UserData, options: RepairOptions): UserData {
	const lotIds = new Set(data.lots.map((lot) => lot.id));
	const formatIds = new Set(data.formats.map((format) => format.id));

	// Folders: dangling parents go to the root, then cycles are broken by detaching the
	// folder in the loop that was edited longest ago (ties by id, so both sides agree).
	const folderIds = new Set(data.folders.map((folder) => folder.id));
	const folders = data.folders.map((folder) =>
		folder.parentId && !folderIds.has(folder.parentId) ? { ...folder, parentId: null } : folder
	);
	const byId = new Map(folders.map((folder) => [folder.id, folder]));
	for (const start of [...folders].sort((a, b) => a.id.localeCompare(b.id))) {
		const trail: string[] = [];
		let current = byId.get(start.id);
		while (current?.parentId) {
			if (trail.includes(current.id)) break;
			trail.push(current.id);
			current = byId.get(current.parentId);
		}
		if (!current?.parentId || !trail.includes(current.id)) continue;

		const loop = trail.slice(trail.indexOf(current.id)).map((id) => byId.get(id)!);
		const oldest = loop.reduce((a, b) =>
			a.updatedAt < b.updatedAt || (a.updatedAt === b.updatedAt && a.id < b.id) ? a : b
		);
		byId.set(oldest.id, { ...oldest, parentId: null });
	}
	const repairedFolders = folders.map((folder) => byId.get(folder.id)!);

	return {
		version: 2,
		// Cards whose lot is gone fold into Unsorted; dedupe sums stacks that now share a key.
		collection: dedupeRows(
			data.collection
				.filter((row) => row.quantity > 0)
				.map((row) => (row.lotId && !lotIds.has(row.lotId) ? { ...row, lotId: null } : row))
		),
		lots: data.lots,
		folders: repairedFolders,
		decks: data.decks.map((deck) => {
			const folderId = deck.folderId && folderIds.has(deck.folderId) ? deck.folderId : null;
			const formatId = deck.formatId && formatIds.has(deck.formatId) ? deck.formatId : null;
			return folderId === deck.folderId && formatId === deck.formatId
				? deck
				: { ...deck, folderId, formatId };
		}),
		formats: data.formats,
		tombstones: pruneTombstones(data.tombstones, options)
	};
}
