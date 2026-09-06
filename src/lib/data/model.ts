/**
 * Everything the app persists, version 2. Also the shape of a backup file and of the
 * file synced to Google Drive.
 *
 * Every record carries `updatedAt` and every removal leaves a tombstone, because two
 * devices may edit the same data offline and later merge (see merge.ts). Timestamps are
 * ISO strings produced by the hybrid clock in clock.ts, so they compare lexically.
 */
import type { CardVariant } from '$lib/types';

import type { AppearanceColor } from './appearance';

export type CollectionEntry = {
	cardId: string;
	variant: CardVariant;
	quantity: number;
	/** Which lot (purchase / batch) the copies came in. `null` is the "Unsorted" lot. */
	lotId: string | null;
	updatedAt: string;
};

/**
 * The look a lot or folder shows on its card: a palette colour and an emoji, either of
 * them optional. See appearance.ts for the palette.
 */
export type Appearance = {
	color: AppearanceColor | null;
	/** One emoji (or any single character); null shows the default icon. */
	icon: string | null;
};

/** A batch of cards acquired together — "july.2 lot", "Christmas booster box". */
export type Lot = Appearance & {
	id: string;
	name: string;
	note: string | null;
	/** YYYY-MM-DD, or null when unknown. */
	acquiredOn: string | null;
	/** Which lot folder it is filed in. `null` sits at the top level. */
	folderId: string | null;
	createdAt: string;
	updatedAt: string;
};

/** How badly the user wants a card; drives the order of the wants list. */
export type WantPriority = 'low' | 'normal' | 'high';

export const WANT_PRIORITIES: WantPriority[] = ['high', 'normal', 'low'];

/** A named wants list — "Trade targets", "Charizard binder", "Christmas". */
export type WantList = {
	id: string;
	name: string;
	note: string | null;
	createdAt: string;
	updatedAt: string;
};

/**
 * A card the user is hunting for. Keyed like a collection row, with the list standing in
 * for the lot: one printing, one finish, on one list. Where the copies end up once found
 * is decided then, not now.
 */
export type WantEntry = {
	cardId: string;
	variant: CardVariant;
	/** How many copies the user wants to end up owning. */
	quantity: number;
	/** Which list it sits on. `null` is the default "Main list". */
	listId: string | null;
	priority: WantPriority;
	note: string | null;
	createdAt: string;
	updatedAt: string;
};

/**
 * A card the user would trade away: one printing, one finish, how many copies are up for
 * grabs. The copies themselves stay in the collection (and in their lots) until they
 * actually change hands; this only marks them as spare.
 */
export type TradeEntry = {
	cardId: string;
	variant: CardVariant;
	/** How many copies are offered. */
	quantity: number;
	note: string | null;
	createdAt: string;
	updatedAt: string;
};

/**
 * A node in a folder tree. Decks and lots each have their own tree — a deck never lands
 * in a lot folder — but the shape and the helpers in folders.ts are shared.
 */
export type Folder = Appearance & {
	id: string;
	name: string;
	/** Free text shown on the folder's card — what the folder is for. */
	description: string | null;
	/** `null` at the root. Folders nest arbitrarily. */
	parentId: string | null;
	createdAt: string;
	updatedAt: string;
};

/** A folder in the deck tree (`data.folders`). */
export type DeckFolder = Folder;

/** A folder in the lot tree (`data.lotFolders`). */
export type LotFolder = Folder;

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

export type TombstoneKind =
	| 'collection'
	| 'want'
	| 'wantList'
	| 'trade'
	| 'lot'
	| 'lotFolder'
	| 'folder'
	| 'deck'
	| 'format';

/** A record that was deleted; lets a merge tell "deleted here" from "never seen there". */
export type Tombstone = { kind: TombstoneKind; key: string; deletedAt: string };

export type UserData = {
	version: 2;
	collection: CollectionEntry[];
	/** The wishlist. Absent from files written before wants existed; migrate defaults it. */
	wants: WantEntry[];
	wantLists: WantList[];
	/** The trade binder. Absent from files written before it existed; migrate defaults it. */
	trades: TradeEntry[];
	lots: Lot[];
	/** The lot tree. Absent from files written before lot folders existed; migrate defaults it. */
	lotFolders: LotFolder[];
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

/** Identity of a want: one printing, one finish, one list. */
export const wantKey = (entry: { cardId: string; variant: string; listId: string | null }) =>
	`${entry.cardId}|${entry.variant}|${entry.listId ?? ''}`;

/** Identity of a trade binder entry: one printing, one finish. */
export const tradeKey = (entry: { cardId: string; variant: string }) =>
	`${entry.cardId}|${entry.variant}`;

export const emptyData = (): UserData => ({
	version: 2,
	collection: [],
	wants: [],
	wantLists: [],
	trades: [],
	lots: [],
	lotFolders: [],
	folders: [],
	decks: [],
	formats: [],
	tombstones: []
});

export const newId = () =>
	globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
