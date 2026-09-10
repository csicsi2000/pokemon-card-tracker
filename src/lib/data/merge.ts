/**
 * Combines two copies of the user's data — this device's and the synced file's.
 *
 * Per record, the newer `updatedAt` wins. A tombstone removes a record unless the record
 * was edited after the deletion. Collection rows migrated from v1 on two devices both
 * carry the sentinel timestamp; for those the larger quantity wins, so neither device's
 * counts silently vanish. Ties are broken by content so the result does not depend on
 * argument order: merge(a, b) equals merge(b, a), and merge(a, a) equals a.
 *
 * The result may still contain dangling references (a deck in a folder the other side
 * deleted) — callers run repair() on it.
 */
import {
	rowKey,
	SENTINEL,
	tradeKey,
	wantKey,
	type CollectionEntry,
	type Tombstone,
	type UserData
} from './model';

/** JSON with sorted keys, so equal records stringify equally whatever their key order. */
function stable(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
			a.localeCompare(b)
		);
		return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

/** Later `updatedAt` wins; equal timestamps fall back to a content comparison. */
function newer<T extends { updatedAt: string }>(a: T, b: T): T {
	if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
	return stable(a) >= stable(b) ? a : b;
}

function mergeRecords<T extends { updatedAt: string }>(
	left: T[],
	right: T[],
	keyOf: (item: T) => string,
	pick: (a: T, b: T) => T = newer
): Map<string, T> {
	const merged = new Map<string, T>();
	for (const item of left) merged.set(keyOf(item), item);
	for (const item of right) {
		const key = keyOf(item);
		const existing = merged.get(key);
		merged.set(key, existing ? pick(existing, item) : item);
	}
	return merged;
}

function pickRow(a: CollectionEntry, b: CollectionEntry): CollectionEntry {
	// Two devices that each migrated the same v1 data: nobody "edited" either row.
	if (a.updatedAt === SENTINEL && b.updatedAt === SENTINEL) {
		return a.quantity >= b.quantity ? a : b;
	}
	return newer(a, b);
}

const tombstoneKey = (tombstone: Tombstone) => `${tombstone.kind}|${tombstone.key}`;

export function merge(left: UserData, right: UserData): UserData {
	const tombstones = new Map<string, Tombstone>();
	for (const tombstone of [...left.tombstones, ...right.tombstones]) {
		const key = tombstoneKey(tombstone);
		const existing = tombstones.get(key);
		if (!existing || tombstone.deletedAt > existing.deletedAt) tombstones.set(key, tombstone);
	}

	/** Drop records deleted more recently than they were last edited. */
	const alive = <T extends { updatedAt: string }>(
		kind: Tombstone['kind'],
		records: Map<string, T>
	): T[] =>
		[...records].flatMap(([key, record]) => {
			const tombstone = tombstones.get(`${kind}|${key}`);
			return tombstone && tombstone.deletedAt > record.updatedAt ? [] : [record];
		});

	const id = <T extends { id: string }>(item: T) => item.id;

	return {
		version: 2,
		collection: alive(
			'collection',
			mergeRecords(left.collection, right.collection, rowKey, pickRow)
		),
		wants: alive('want', mergeRecords(left.wants, right.wants, wantKey)),
		wantLists: alive('wantList', mergeRecords(left.wantLists, right.wantLists, id)),
		trades: alive('trade', mergeRecords(left.trades, right.trades, tradeKey)),
		lots: alive('lot', mergeRecords(left.lots, right.lots, id)),
		lotFolders: alive('lotFolder', mergeRecords(left.lotFolders, right.lotFolders, id)),
		folders: alive('folder', mergeRecords(left.folders, right.folders, id)),
		decks: alive('deck', mergeRecords(left.decks, right.decks, id)),
		battleLogs: alive('battleLog', mergeRecords(left.battleLogs, right.battleLogs, id)),
		formats: alive('format', mergeRecords(left.formats, right.formats, id)),
		tombstones: [...tombstones.values()]
	};
}

/** True when two payloads hold the same records — used to skip pointless uploads. */
export const sameData = (a: UserData, b: UserData) => stable(canonical(a)) === stable(canonical(b));

/** Order-independent view of a payload, for comparison only. */
function canonical(data: UserData) {
	const byKey = <T>(items: T[], keyOf: (item: T) => string) =>
		[...items].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
	const id = <T extends { id: string }>(item: T) => item.id;
	return {
		collection: byKey(data.collection, rowKey),
		wants: byKey(data.wants, wantKey),
		wantLists: byKey(data.wantLists, id),
		trades: byKey(data.trades, tradeKey),
		lots: byKey(data.lots, id),
		lotFolders: byKey(data.lotFolders, id),
		folders: byKey(data.folders, id),
		decks: byKey(data.decks, id),
		battleLogs: byKey(data.battleLogs, id),
		formats: byKey(data.formats, id),
		tombstones: byKey(data.tombstones, tombstoneKey)
	};
}
