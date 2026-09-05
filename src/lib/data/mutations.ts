/**
 * Every write to user data, as a pure function `(data, clock, ...) => data`.
 *
 * Two rules make sync work, and every reducer here follows them:
 *   1. a touched record gets a fresh `updatedAt` from the clock;
 *   2. removing a record — or re-keying it, which is a removal plus an insert — leaves a
 *      tombstone, or the other device would resurrect it on the next merge.
 *
 * The Svelte store is a thin wrapper that calls one of these and persists the result.
 */
import type { CardVariant } from '$lib/types';
import type { Clock } from './clock';
import { isDescendant } from './folders';
import { dedupeRows } from './migrate';
import {
	emptyData,
	newId,
	rowKey,
	type CollectionEntry,
	type Deck,
	type DeckFolder,
	type Format,
	type FormatPoolCard,
	type Lot,
	type Tombstone,
	type UserData
} from './model';

type Kind = Tombstone['kind'];

const bury = (data: UserData, kind: Kind, key: string, deletedAt: string): Tombstone[] => [
	...data.tombstones.filter((t) => !(t.kind === kind && t.key === key)),
	{ kind, key, deletedAt }
];

const clampQuantity = (quantity: number) => Math.max(0, Math.floor(quantity));

// -- collection -------------------------------------------------------------

export type RowInput = {
	cardId: string;
	variant: CardVariant;
	quantity: number;
	lotId: string | null;
};

/** Absolute quantity for one row; 0 removes it. */
export function setOwned(
	data: UserData,
	clock: Clock,
	cardId: string,
	variant: CardVariant,
	quantity: number,
	lotId: string | null = null
): UserData {
	const next = clampQuantity(quantity);
	const key = rowKey({ cardId, variant, lotId });
	const rest = data.collection.filter((row) => rowKey(row) !== key);
	const now = clock.next();

	if (next === 0) {
		const existed = rest.length !== data.collection.length;
		return existed
			? { ...data, collection: rest, tombstones: bury(data, 'collection', key, now) }
			: data;
	}

	return {
		...data,
		collection: [...rest, { cardId, variant, quantity: next, lotId, updatedAt: now }],
		// A row coming back after deletion must outrank its old tombstone.
		tombstones: data.tombstones.filter((t) => !(t.kind === 'collection' && t.key === key))
	};
}

/** Bulk add or replace; used by imports and quick-add. */
export function addOwned(
	data: UserData,
	clock: Clock,
	entries: RowInput[],
	mode: 'add' | 'replace'
): UserData {
	const merged = new Map(data.collection.map((row) => [rowKey(row), { ...row }]));
	const now = clock.next();
	let tombstones = data.tombstones;

	for (const entry of entries) {
		const key = rowKey(entry);
		const existing = merged.get(key);
		const quantity = clampQuantity(
			existing && mode === 'add' ? existing.quantity + entry.quantity : entry.quantity
		);

		if (quantity === 0) {
			if (existing) {
				merged.delete(key);
				tombstones = bury({ ...data, tombstones }, 'collection', key, now);
			}
			continue;
		}

		merged.set(key, { ...entry, quantity, updatedAt: now });
		tombstones = tombstones.filter((t) => !(t.kind === 'collection' && t.key === key));
	}

	return { ...data, collection: [...merged.values()], tombstones };
}

/** Move `quantity` copies of a row into another lot (or Unsorted). */
export function moveOwned(
	data: UserData,
	clock: Clock,
	fromKey: string,
	toLotId: string | null,
	quantity: number
): UserData {
	const source = data.collection.find((row) => rowKey(row) === fromKey);
	const moving = Math.min(clampQuantity(quantity), source?.quantity ?? 0);
	if (!source || moving === 0 || source.lotId === toLotId) return data;

	const afterRemoval = setOwned(
		data,
		clock,
		source.cardId,
		source.variant,
		source.quantity - moving,
		source.lotId
	);
	return addOwned(
		afterRemoval,
		clock,
		[{ cardId: source.cardId, variant: source.variant, quantity: moving, lotId: toLotId }],
		'add'
	);
}

// -- lots -------------------------------------------------------------------

export function createLot(
	data: UserData,
	clock: Clock,
	input: { name: string; note?: string | null; acquiredOn?: string | null }
): { data: UserData; lot: Lot } {
	const now = clock.next();
	const lot: Lot = {
		id: newId(),
		name: input.name,
		note: input.note ?? null,
		acquiredOn: input.acquiredOn ?? null,
		createdAt: now,
		updatedAt: now
	};
	return { data: { ...data, lots: [...data.lots, lot] }, lot };
}

export function updateLot(
	data: UserData,
	clock: Clock,
	id: string,
	changes: Partial<Omit<Lot, 'id' | 'createdAt' | 'updatedAt'>>
): UserData {
	return {
		...data,
		lots: data.lots.map((lot) =>
			lot.id === id ? { ...lot, ...changes, updatedAt: clock.next() } : lot
		)
	};
}

/**
 * Remove a lot. With `cards: 'unsorted'` its rows are left in place and fold into
 * Unsorted during repair() — deliberately, so a device that merges this deletion later
 * folds them the same way. With `cards: 'remove'` the rows go too.
 */
export function deleteLot(
	data: UserData,
	clock: Clock,
	id: string,
	cards: 'unsorted' | 'remove'
): UserData {
	if (!data.lots.some((lot) => lot.id === id)) return data;
	const now = clock.next();
	let next: UserData = {
		...data,
		lots: data.lots.filter((lot) => lot.id !== id),
		tombstones: bury(data, 'lot', id, now)
	};

	if (cards === 'remove') {
		const doomed = next.collection.filter((row) => row.lotId === id);
		let tombstones = next.tombstones;
		for (const row of doomed) tombstones = bury({ ...next, tombstones }, 'collection', rowKey(row), now);
		next = { ...next, collection: next.collection.filter((row) => row.lotId !== id), tombstones };
	}

	return next;
}

// -- folders ----------------------------------------------------------------

export function createFolder(
	data: UserData,
	clock: Clock,
	name: string,
	parentId: string | null
): { data: UserData; folder: DeckFolder } {
	const now = clock.next();
	const folder: DeckFolder = { id: newId(), name, parentId, createdAt: now, updatedAt: now };
	return { data: { ...data, folders: [...data.folders, folder] }, folder };
}

/** Rename or move a folder. Moving a folder into itself or a descendant is ignored. */
export function updateFolder(
	data: UserData,
	clock: Clock,
	id: string,
	changes: Partial<Pick<DeckFolder, 'name' | 'parentId'>>
): UserData {
	if (changes.parentId !== undefined && changes.parentId !== null) {
		if (isDescendant(data.folders, changes.parentId, id)) return data;
	}
	return {
		...data,
		folders: data.folders.map((folder) =>
			folder.id === id ? { ...folder, ...changes, updatedAt: clock.next() } : folder
		)
	};
}

/** Delete a folder; its sub-folders and decks move up to its parent. */
export function deleteFolder(data: UserData, clock: Clock, id: string): UserData {
	const folder = data.folders.find((item) => item.id === id);
	if (!folder) return data;
	const now = clock.next();

	return {
		...data,
		folders: data.folders
			.filter((item) => item.id !== id)
			.map((item) =>
				item.parentId === id ? { ...item, parentId: folder.parentId, updatedAt: now } : item
			),
		decks: data.decks.map((deck) =>
			deck.folderId === id ? { ...deck, folderId: folder.parentId, updatedAt: now } : deck
		),
		tombstones: bury(data, 'folder', id, now)
	};
}

// -- decks ------------------------------------------------------------------

export function createDeck(
	data: UserData,
	clock: Clock,
	input: {
		name: string;
		formatId?: string | null;
		folderId?: string | null;
		cards?: Deck['cards'];
	}
): { data: UserData; deck: Deck } {
	const now = clock.next();
	const deck: Deck = {
		id: newId(),
		name: input.name,
		description: null,
		formatId: input.formatId ?? null,
		folderId: input.folderId ?? null,
		cards: input.cards ?? [],
		createdAt: now,
		updatedAt: now
	};
	return { data: { ...data, decks: [deck, ...data.decks] }, deck };
}

export function updateDeck(
	data: UserData,
	clock: Clock,
	id: string,
	changes: Partial<Omit<Deck, 'id' | 'createdAt' | 'updatedAt'>>
): UserData {
	return {
		...data,
		decks: data.decks.map((deck) =>
			deck.id === id ? { ...deck, ...changes, updatedAt: clock.next() } : deck
		)
	};
}

export function deleteDeck(data: UserData, clock: Clock, id: string): UserData {
	if (!data.decks.some((deck) => deck.id === id)) return data;
	return {
		...data,
		decks: data.decks.filter((deck) => deck.id !== id),
		tombstones: bury(data, 'deck', id, clock.next())
	};
}

export function setDeckQuantity(
	data: UserData,
	clock: Clock,
	deckId: string,
	cardId: string,
	quantity: number
): UserData {
	const deck = data.decks.find((item) => item.id === deckId);
	if (!deck) return data;
	const next = clampQuantity(quantity);
	const rest = deck.cards.filter((card) => card.cardId !== cardId);
	return updateDeck(data, clock, deckId, {
		cards: next > 0 ? [...rest, { cardId, quantity: next }] : rest
	});
}

// -- formats ----------------------------------------------------------------

export function createFormat(
	data: UserData,
	clock: Clock,
	input: { name: string; description: string | null; rules: unknown }
): { data: UserData; format: Format } {
	const now = clock.next();
	const format: Format = {
		id: newId(),
		name: input.name,
		description: input.description,
		rules: input.rules,
		pool: [],
		createdAt: now,
		updatedAt: now
	};
	return { data: { ...data, formats: [...data.formats, format] }, format };
}

export function updateFormat(
	data: UserData,
	clock: Clock,
	id: string,
	changes: Partial<Omit<Format, 'id' | 'createdAt' | 'updatedAt'>>
): UserData {
	return {
		...data,
		formats: data.formats.map((format) =>
			format.id === id ? { ...format, ...changes, updatedAt: clock.next() } : format
		)
	};
}

/** Decks keep working; they just lose their format — and are stamped so that syncs. */
export function deleteFormat(data: UserData, clock: Clock, id: string): UserData {
	if (!data.formats.some((format) => format.id === id)) return data;
	const now = clock.next();
	return {
		...data,
		formats: data.formats.filter((format) => format.id !== id),
		decks: data.decks.map((deck) =>
			deck.formatId === id ? { ...deck, formatId: null, updatedAt: now } : deck
		),
		tombstones: bury(data, 'format', id, now)
	};
}

export function setPoolQuantity(
	data: UserData,
	clock: Clock,
	formatId: string,
	cardId: string,
	quantity: number
): UserData {
	const format = data.formats.find((item) => item.id === formatId);
	if (!format) return data;
	const next = clampQuantity(quantity);
	const rest = format.pool.filter((card) => card.cardId !== cardId);
	return updateFormat(data, clock, formatId, {
		pool: next > 0 ? [...rest, { cardId, quantity: next }] : rest
	});
}

export function addToPool(
	data: UserData,
	clock: Clock,
	formatId: string,
	cards: FormatPoolCard[]
): UserData {
	const format = data.formats.find((item) => item.id === formatId);
	if (!format) return data;
	const merged = new Map(format.pool.map((card) => [card.cardId, { ...card }]));
	for (const card of cards) merged.set(card.cardId, { ...card });
	return updateFormat(data, clock, formatId, { pool: [...merged.values()] });
}

// -- whole-payload operations -----------------------------------------------

/**
 * Replace everything with a backup file. Every incoming record is stamped now (the user
 * chose this file over what was here), and every current record the file lacks is
 * tombstoned so a synced device does not bring it back.
 */
export function restore(data: UserData, clock: Clock, incoming: UserData): UserData {
	const now = clock.next();
	const stampAll = <T extends { updatedAt: string }>(items: T[]) =>
		items.map((item) => ({ ...item, updatedAt: now }));

	const missing = <T>(current: T[], next: T[], keyOf: (item: T) => string, kind: Kind) => {
		const keep = new Set(next.map(keyOf));
		return current
			.filter((item) => !keep.has(keyOf(item)))
			.map((item): Tombstone => ({ kind, key: keyOf(item), deletedAt: now }));
	};
	const id = <T extends { id: string }>(item: T) => item.id;

	const tombstones = [
		...data.tombstones,
		...incoming.tombstones,
		...missing(data.collection, incoming.collection, rowKey, 'collection'),
		...missing(data.lots, incoming.lots, id, 'lot'),
		...missing(data.folders, incoming.folders, id, 'folder'),
		...missing(data.decks, incoming.decks, id, 'deck'),
		...missing(data.formats, incoming.formats, id, 'format')
	];

	return {
		version: 2,
		collection: stampAll(dedupeRows(incoming.collection)),
		lots: stampAll(incoming.lots),
		folders: stampAll(incoming.folders),
		decks: stampAll(incoming.decks),
		formats: stampAll(incoming.formats),
		tombstones
	};
}

/** Wipe everything, leaving tombstones so the wipe syncs rather than un-syncs. */
export function clear(data: UserData, clock: Clock): UserData {
	return restore(data, clock, emptyData());
}

/** Convenience for tests and callers that build rows without a clock. */
export const rowFrom = (input: RowInput, updatedAt: string): CollectionEntry => ({
	...input,
	updatedAt
});
