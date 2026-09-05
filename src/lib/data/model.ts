/**
 * Everything the app persists, version 2. Also the shape of a backup file and of the
 * file synced to Google Drive.
 *
 * Every record carries `updatedAt` and every removal leaves a tombstone, because two
 * devices may edit the same data offline and later merge (see merge.ts). Timestamps are
 * ISO strings produced by the hybrid clock in clock.ts, so they compare lexically.
 */
import type { CardVariant } from '$lib/types';

export type CollectionEntry = {
	cardId: string;
	variant: CardVariant;
	quantity: number;
	/** Which lot (purchase / batch) the copies came in. `null` is the "Unsorted" lot. */
	lotId: string | null;
	updatedAt: string;
};

/** A batch of cards acquired together — "july.2 lot", "Christmas booster box". */
export type Lot = {
	id: string;
	name: string;
	note: string | null;
	/** YYYY-MM-DD, or null when unknown. */
	acquiredOn: string | null;
	createdAt: string;
	updatedAt: string;
};

export type DeckFolder = {
	id: string;
	name: string;
	/** `null` at the root. Folders nest arbitrarily. */
	parentId: string | null;
	createdAt: string;
	updatedAt: string;
};

export type DeckCard = { cardId: string; quantity: number };

export type Deck = {
	id: string;
	name: string;
	description: string | null;
	formatId: string | null;
	folderId: string | null;
	cards: DeckCard[];
	createdAt: string;
	updatedAt: string;
};

export type FormatPoolCard = { cardId: string; quantity: number };

export type Format = {
	id: string;
	name: string;
	description: string | null;
	rules: unknown;
	/** Explicit card pool — the Cube list. Only meaningful for pool type 'explicit'. */
	pool: FormatPoolCard[];
	createdAt: string;
	updatedAt: string;
};

export type TombstoneKind = 'collection' | 'lot' | 'folder' | 'deck' | 'format';

/** A record that was deleted; lets a merge tell "deleted here" from "never seen there". */
export type Tombstone = { kind: TombstoneKind; key: string; deletedAt: string };

export type UserData = {
	version: 2;
	collection: CollectionEntry[];
	lots: Lot[];
	folders: DeckFolder[];
	decks: Deck[];
	formats: Format[];
	tombstones: Tombstone[];
};

/** The v1 shape, kept so old localStorage blobs and backup files still load. */
export type LegacyUserDataV1 = {
	version: 1;
	collection: { cardId: string; variant: CardVariant; quantity: number }[];
	decks: Omit<Deck, 'folderId'>[];
	formats: Format[];
};

/**
 * `updatedAt` given to records that predate timestamps (migrated from v1). Older than
 * anything real, so a genuine edit anywhere always wins over it.
 */
export const SENTINEL = '1970-01-01T00:00:00.000Z';

/** Identity of a collection row: one printing, one finish, one lot. */
export const rowKey = (entry: { cardId: string; variant: string; lotId: string | null }) =>
	`${entry.cardId}|${entry.variant}|${entry.lotId ?? ''}`;

export const emptyData = (): UserData => ({
	version: 2,
	collection: [],
	lots: [],
	folders: [],
	decks: [],
	formats: [],
	tombstones: []
});

export const newId = () =>
	globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
