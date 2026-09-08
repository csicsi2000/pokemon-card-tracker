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
import type { AppearanceColor } from './appearance';
import { dedupeRows, dedupeTrades, dedupeWants } from './migrate';
import {
	emptyData,
	newId,
	rowKey,
	tradeKey,
	wantKey,
	type CollectionEntry,
	type Deck,
	type DeckFolder,
	type Folder,
	type Format,
	type FormatPoolCard,
	type Lot,
	type LotFolder,
	type Tombstone,
	type TradeEntry,
	type UserData,
	type WantEntry,
	type WantList,
	type WantPriority
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

// -- wants ------------------------------------------------------------------

export type WantInput = {
	cardId: string;
	variant: CardVariant;
	quantity: number;
	/** `null`, or left out, is the default list. */
	listId?: string | null;
	priority?: WantPriority;
	note?: string | null;
};

/** The full identity of a want; `listId` defaults to the default list. */
export type WantRef = { cardId: string; variant: CardVariant; listId?: string | null };

const keyOfRef = (ref: WantRef) => wantKey({ ...ref, listId: ref.listId ?? null });

/**
 * Absolute wanted quantity for one printing, finish and list; 0 removes the want. Fields
 * left out keep what the want already had, so bumping a quantity never drops its note.
 */
export function setWant(data: UserData, clock: Clock, input: WantInput): UserData {
	const next = clampQuantity(input.quantity);
	const listId = input.listId ?? null;
	const key = wantKey({ ...input, listId });
	const existing = data.wants.find((want) => wantKey(want) === key);
	const now = clock.next();

	if (next === 0) {
		if (!existing) return data;
		return {
			...data,
			wants: data.wants.filter((want) => wantKey(want) !== key),
			tombstones: bury(data, 'want', key, now)
		};
	}

	const want: WantEntry = {
		cardId: input.cardId,
		variant: input.variant,
		quantity: next,
		listId,
		priority: input.priority ?? existing?.priority ?? 'normal',
		note: input.note !== undefined ? input.note : (existing?.note ?? null),
		createdAt: existing?.createdAt ?? now,
		updatedAt: now
	};

	return {
		...data,
		wants: [...data.wants.filter((item) => wantKey(item) !== key), want],
		// A want added back after deletion must outrank its old tombstone.
		tombstones: data.tombstones.filter((t) => !(t.kind === 'want' && t.key === key))
	};
}

/** Edit an existing want. Unknown wants are ignored — nothing is created here. */
export function updateWant(
	data: UserData,
	clock: Clock,
	ref: WantRef,
	changes: Partial<Pick<WantEntry, 'quantity' | 'priority' | 'note'>>
): UserData {
	const existing = data.wants.find((want) => wantKey(want) === keyOfRef(ref));
	if (!existing) return data;
	return setWant(data, clock, { ...existing, ...changes });
}

export const removeWant = (data: UserData, clock: Clock, ref: WantRef) =>
	setWant(data, clock, { ...ref, quantity: 0 });

/**
 * Put a want on another list. That re-keys it, so it is a removal plus an insert; where
 * the target list already wants that printing, the larger of the two quantities stands.
 */
export function moveWant(
	data: UserData,
	clock: Clock,
	ref: WantRef,
	toListId: string | null
): UserData {
	const source = data.wants.find((want) => wantKey(want) === keyOfRef(ref));
	if (!source || source.listId === toListId) return data;

	const target = data.wants.find(
		(want) => wantKey(want) === wantKey({ ...source, listId: toListId })
	);
	const afterRemoval = removeWant(data, clock, source);

	return setWant(afterRemoval, clock, {
		cardId: source.cardId,
		variant: source.variant,
		quantity: Math.max(source.quantity, target?.quantity ?? 0),
		listId: toListId,
		priority: source.priority,
		note: source.note ?? target?.note ?? null
	});
}

// -- trade binder -----------------------------------------------------------

export type TradeInput = {
	cardId: string;
	variant: CardVariant;
	quantity: number;
	note?: string | null;
};

/** The identity of a binder entry. */
export type TradeRef = { cardId: string; variant: CardVariant };

/**
 * Absolute number of copies offered for one printing and finish; 0 takes it out of the
 * binder. A note left out keeps what the entry already had.
 */
export function setTrade(data: UserData, clock: Clock, input: TradeInput): UserData {
	const next = clampQuantity(input.quantity);
	const key = tradeKey(input);
	const existing = data.trades.find((trade) => tradeKey(trade) === key);
	const now = clock.next();

	if (next === 0) {
		if (!existing) return data;
		return {
			...data,
			trades: data.trades.filter((trade) => tradeKey(trade) !== key),
			tombstones: bury(data, 'trade', key, now)
		};
	}

	const trade: TradeEntry = {
		cardId: input.cardId,
		variant: input.variant,
		quantity: next,
		note: input.note !== undefined ? input.note : (existing?.note ?? null),
		createdAt: existing?.createdAt ?? now,
		updatedAt: now
	};

	return {
		...data,
		trades: [...data.trades.filter((item) => tradeKey(item) !== key), trade],
		// An entry put back after deletion must outrank its old tombstone.
		tombstones: data.tombstones.filter((t) => !(t.kind === 'trade' && t.key === key))
	};
}

/** Edit an existing binder entry. Unknown entries are ignored — nothing is created here. */
export function updateTrade(
	data: UserData,
	clock: Clock,
	ref: TradeRef,
	changes: Partial<Pick<TradeEntry, 'quantity' | 'note'>>
): UserData {
	const existing = data.trades.find((trade) => tradeKey(trade) === tradeKey(ref));
	if (!existing) return data;
	return setTrade(data, clock, { ...existing, ...changes });
}

export const removeTrade = (data: UserData, clock: Clock, ref: TradeRef) =>
	setTrade(data, clock, { ...ref, quantity: 0 });

/**
 * The copies changed hands: take `quantity` of them out of the collection and off the
 * binder entry. With no lot named, the copies come from the lots that hold the most of
 * them first (ties by lot id, so two devices replaying this agree). Never removes more
 * than is owned; the binder entry shrinks by what was asked regardless.
 */
export function tradeAway(
	data: UserData,
	clock: Clock,
	ref: TradeRef,
	quantity: number,
	lotId?: string | null
): UserData {
	let remaining = clampQuantity(quantity);
	if (remaining === 0) return data;

	const stacks = data.collection
		.filter(
			(row) =>
				row.cardId === ref.cardId &&
				row.variant === ref.variant &&
				(lotId === undefined || row.lotId === lotId)
		)
		.sort((a, b) => b.quantity - a.quantity || (a.lotId ?? '').localeCompare(b.lotId ?? ''));

	let next = data;
	for (const stack of stacks) {
		if (remaining === 0) break;
		const taken = Math.min(stack.quantity, remaining);
		next = setOwned(next, clock, stack.cardId, stack.variant, stack.quantity - taken, stack.lotId);
		remaining -= taken;
	}

	const entry = next.trades.find((trade) => tradeKey(trade) === tradeKey(ref));
	if (entry) next = setTrade(next, clock, { ...entry, quantity: entry.quantity - clampQuantity(quantity) });
	return next;
}

// -- wants lists ------------------------------------------------------------

export function createWantList(
	data: UserData,
	clock: Clock,
	input: { name: string; note?: string | null }
): { data: UserData; list: WantList } {
	const now = clock.next();
	const list: WantList = {
		id: newId(),
		name: input.name,
		note: input.note ?? null,
		createdAt: now,
		updatedAt: now
	};
	return { data: { ...data, wantLists: [...data.wantLists, list] }, list };
}

export function updateWantList(
	data: UserData,
	clock: Clock,
	id: string,
	changes: Partial<Pick<WantList, 'name' | 'note'>>
): UserData {
	return {
		...data,
		wantLists: data.wantLists.map((list) =>
			list.id === id ? { ...list, ...changes, updatedAt: clock.next() } : list
		)
	};
}

/**
 * Remove a list. With `wants: 'default'` its wants are left in place and fold into the
 * default list during repair() — deliberately, so a device that merges this deletion
 * later folds them the same way. With `wants: 'remove'` they go too.
 */
export function deleteWantList(
	data: UserData,
	clock: Clock,
	id: string,
	wants: 'default' | 'remove'
): UserData {
	if (!data.wantLists.some((list) => list.id === id)) return data;
	const now = clock.next();
	let next: UserData = {
		...data,
		wantLists: data.wantLists.filter((list) => list.id !== id),
		tombstones: bury(data, 'wantList', id, now)
	};

	if (wants === 'remove') {
		const doomed = next.wants.filter((want) => want.listId === id);
		let tombstones = next.tombstones;
		for (const want of doomed) tombstones = bury({ ...next, tombstones }, 'want', wantKey(want), now);
		next = { ...next, wants: next.wants.filter((want) => want.listId !== id), tombstones };
	}

	return next;
}

// -- lots -------------------------------------------------------------------

export function createLot(
	data: UserData,
	clock: Clock,
	input: {
		name: string;
		note?: string | null;
		acquiredOn?: string | null;
		folderId?: string | null;
		color?: AppearanceColor | null;
		icon?: string | null;
	}
): { data: UserData; lot: Lot } {
	const now = clock.next();
	const lot: Lot = {
		id: newId(),
		name: input.name,
		color: input.color ?? null,
		icon: input.icon ?? null,
		note: input.note ?? null,
		acquiredOn: input.acquiredOn ?? null,
		folderId: input.folderId ?? null,
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

// -- lot folders ------------------------------------------------------------

/** Optional fields a folder can be created with, beyond its name and parent. */
export type FolderExtras = Partial<Pick<Folder, 'description' | 'color' | 'icon'>>;
/** Everything about a folder that can change after creation. */
export type FolderChanges = Partial<Omit<Folder, 'id' | 'createdAt' | 'updatedAt'>>;


export function createLotFolder(
	data: UserData,
	clock: Clock,
	name: string,
	parentId: string | null,
	extra: FolderExtras = {}
): { data: UserData; folder: LotFolder } {
	const now = clock.next();
	const folder: LotFolder = {
		id: newId(),
		name,
		description: extra.description ?? null,
		color: extra.color ?? null,
		icon: extra.icon ?? null,
		parentId,
		createdAt: now,
		updatedAt: now
	};
	return { data: { ...data, lotFolders: [...data.lotFolders, folder] }, folder };
}

/** Rename, describe, restyle or move a lot folder. Moving one into itself or a descendant is ignored. */
export function updateLotFolder(
	data: UserData,
	clock: Clock,
	id: string,
	changes: FolderChanges
): UserData {
	if (changes.parentId !== undefined && changes.parentId !== null) {
		if (isDescendant(data.lotFolders, changes.parentId, id)) return data;
	}
	return {
		...data,
		lotFolders: data.lotFolders.map((folder) =>
			folder.id === id ? { ...folder, ...changes, updatedAt: clock.next() } : folder
		)
	};
}

/** Delete a lot folder; its sub-folders and lots move up to its parent. */
export function deleteLotFolder(data: UserData, clock: Clock, id: string): UserData {
	const folder = data.lotFolders.find((item) => item.id === id);
	if (!folder) return data;
	const now = clock.next();

	return {
		...data,
		lotFolders: data.lotFolders
			.filter((item) => item.id !== id)
			.map((item) =>
				item.parentId === id ? { ...item, parentId: folder.parentId, updatedAt: now } : item
			),
		lots: data.lots.map((lot) =>
			lot.folderId === id ? { ...lot, folderId: folder.parentId, updatedAt: now } : lot
		),
		tombstones: bury(data, 'lotFolder', id, now)
	};
}

// -- folders ----------------------------------------------------------------

export function createFolder(
	data: UserData,
	clock: Clock,
	name: string,
	parentId: string | null,
	extra: FolderExtras = {}
): { data: UserData; folder: DeckFolder } {
	const now = clock.next();
	const folder: DeckFolder = {
		id: newId(),
		name,
		description: extra.description ?? null,
		color: extra.color ?? null,
		icon: extra.icon ?? null,
		parentId,
		createdAt: now,
		updatedAt: now
	};
	return { data: { ...data, folders: [...data.folders, folder] }, folder };
}

/** Rename, describe, restyle or move a folder. Moving a folder into itself or a descendant is ignored. */
export function updateFolder(
	data: UserData,
	clock: Clock,
	id: string,
	changes: FolderChanges
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

/** "Zard test" → "Zard test copy", then "Zard test copy 2" — the first name still free. */
export function copyName(name: string, taken: Iterable<string>): string {
	const used = new Set([...taken].map((value) => value.toLocaleLowerCase()));
	const base = `${name} copy`;
	if (!used.has(base.toLocaleLowerCase())) return base;
	// `used` is finite, so a free suffix always turns up.
	for (let n = 2; ; n += 1) {
		const candidate = `${base} ${n}`;
		if (!used.has(candidate.toLocaleLowerCase())) return candidate;
	}
}

/**
 * Copy a deck — same list, format, notes and folder — for trying a change out without
 * touching the original. The copy is its own record: new id, fresh timestamps, and it
 * sits right after the deck it came from.
 */
export function duplicateDeck(
	data: UserData,
	clock: Clock,
	id: string
): { data: UserData; deck: Deck | null } {
	const index = data.decks.findIndex((deck) => deck.id === id);
	if (index === -1) return { data, deck: null };
	const source = data.decks[index];
	const now = clock.next();
	const deck: Deck = {
		...source,
		id: newId(),
		name: copyName(
			source.name,
			data.decks.map((item) => item.name)
		),
		cards: source.cards.map((card) => ({ ...card })),
		createdAt: now,
		updatedAt: now
	};
	const decks = [...data.decks];
	decks.splice(index + 1, 0, deck);
	return { data: { ...data, decks }, deck };
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
		...missing(data.wants, incoming.wants, wantKey, 'want'),
		...missing(data.wantLists, incoming.wantLists, id, 'wantList'),
		...missing(data.trades, incoming.trades, tradeKey, 'trade'),
		...missing(data.lots, incoming.lots, id, 'lot'),
		...missing(data.lotFolders, incoming.lotFolders, id, 'lotFolder'),
		...missing(data.folders, incoming.folders, id, 'folder'),
		...missing(data.decks, incoming.decks, id, 'deck'),
		...missing(data.formats, incoming.formats, id, 'format')
	];

	return {
		version: 2,
		collection: stampAll(dedupeRows(incoming.collection)),
		wants: stampAll(dedupeWants(incoming.wants)),
		wantLists: stampAll(incoming.wantLists),
		trades: stampAll(dedupeTrades(incoming.trades)),
		lots: stampAll(incoming.lots),
		lotFolders: stampAll(incoming.lotFolders),
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
