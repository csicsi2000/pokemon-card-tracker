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

/**
 * What a want's `quantity` counts.
 *
 *   * `extra` — copies to go and find, whatever is already in the collection. Wanting a
 *     second Charizard when one is already in a binder is an ordinary thing to want, so
 *     this is what a newly added want gets.
 *   * `total` — copies to end up owning; the ones already owned count towards it. This
 *     is the "finish the playset" reading, and what every want written before the
 *     choice existed meant.
 */
export type WantCounting = 'extra' | 'total';

export const WANT_COUNTINGS: WantCounting[] = ['extra', 'total'];

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
	/** How many copies are wanted — read against the collection as `counting` says. */
	quantity: number;
	/** Which list it sits on. `null` is the default "Main list". */
	listId: string | null;
	/** Whether copies already owned count towards `quantity`. See WantCounting. */
	counting: WantCounting;
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

/** How a match ended, from the point of view of the deck the log is filed under. */
export type BattleResult = 'win' | 'loss' | 'tie' | 'unknown';

export const BATTLE_RESULTS: BattleResult[] = ['win', 'loss', 'tie', 'unknown'];

/** How a log's `text` is stored. See tcg/battle-log/storage.ts. */
export type LogEncoding = 'plain' | 'gzip';

export const LOG_ENCODINGS: LogEncoding[] = ['plain', 'gzip'];

/**
 * A game played with one deck, kept as the log text the client produced plus the few
 * facts the user can correct. Everything else a replay shows — the board, the damage,
 * the prizes — is parsed out of `text` on demand by tcg/battle-log, never stored, so a
 * better parser improves every log already saved.
 *
 * The text is by far the bulkiest thing this app stores — a long game is ~25,000
 * characters, which localStorage bills at ~49 KB — and it rides along in every sync, so it
 * is normally gzipped and base64-ed on the way in. Never read `text` directly: it is only
 * the log itself when `encoding` says 'plain'. Use `unpackLogText` (or, in a component, the
 * cache in lib/logs.svelte.ts) to get the game back out.
 */
export type BattleLog = {
	id: string;
	/** The deck this game was played with. Deleting that deck deletes its logs. */
	deckId: string;
	/** The log as pasted and trimmed, or its gzipped base64 — see `encoding`. */
	text: string;
	/** Absent from logs written before compression; migrate reads that as 'plain'. */
	encoding: LogEncoding;
	/** The handle in the log that is the user's side — guessed on import, editable after. */
	player: string;
	opponent: string;
	/** Parsed from the log when it names a winner, and overridable: ties and
	 *  disconnects never make it into the text. */
	result: BattleResult;
	/** YYYY-MM-DD, defaulting to the day it was saved. */
	playedOn: string | null;
	/** What the opponent was playing — free text, since only the user can name it. */
	opponentDeck: string | null;
	note: string | null;
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
	| 'battleLog'
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
	/** Saved battle logs. Absent from files written before replays existed; migrate defaults it. */
	battleLogs: BattleLog[];
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

/**
 * One deck's battle logs, newest game first — the order both the deck page and the CLI
 * want. Sorted by when the game was played, falling back to when it was saved.
 */
export const battleLogsFor = (data: UserData, deckId: string): BattleLog[] =>
	data.battleLogs
		.filter((log) => log.deckId === deckId)
		.sort((a, b) => (b.playedOn ?? b.createdAt).localeCompare(a.playedOn ?? a.createdAt));

/** Identity of a collection row: one printing, one finish, one lot. */
export const rowKey = (entry: { cardId: string; variant: string; lotId: string | null }) =>
	`${entry.cardId}|${entry.variant}|${entry.lotId ?? ''}`;

/**
 * Copies of a want still to be found, given how many of that printing and finish count
 * towards it. The one place the two counting modes differ. Callers with a whole wants
 * list should go through `wantProgress`, which decides how many copies each want gets
 * when several lists want the same card; this is the arithmetic for one want on its own.
 */
export const copiesToFind = (
	want: Pick<WantEntry, 'quantity' | 'counting'>,
	owned: number
): number => (want.counting === 'extra' ? want.quantity : Math.max(0, want.quantity - owned));

/** How far along one want is. `owned` is every copy of that finish; `counted` is its share. */
export type WantProgress = {
	/** Copies of the printing and finish in the collection, whichever list they serve. */
	owned: number;
	/** The copies that count towards this want — never more than its quantity. */
	counted: number;
	/** Copies still to find; the same number `copiesToFind` gives for `counted`. */
	missing: number;
};

const PRIORITY_RANK = new Map(WANT_PRIORITIES.map((priority, index) => [priority, index]));

/**
 * Which want gets the copies first when several want the same card: the most wanted,
 * then the one that has been waiting longest. Ends on the key so the order is total and
 * two devices agree on it.
 */
const byClaim = (a: WantEntry, b: WantEntry) =>
	PRIORITY_RANK.get(a.priority)! - PRIORITY_RANK.get(b.priority)! ||
	a.createdAt.localeCompare(b.createdAt) ||
	wantKey(a).localeCompare(wantKey(b));

/**
 * The progress of every want, keyed by `wantKey`, with the copies owned shared out
 * between the wants for one printing and finish rather than counted towards each of
 * them in turn. Wanting one Charizard for a deck and one for a binder is wanting two;
 * owning one should tick off one list, not both.
 *
 * Only wants that count "copies to own" take a share — a "copies to find" want is
 * asking for more whatever is in the binder, so it leaves the copies for the others.
 * Everything that shows a wants list, prices it or ticks it off reads from here, and the
 * answer does not depend on which list is being looked at.
 */
export function wantProgress(
	wants: readonly WantEntry[],
	ownedOf: (cardId: string, variant: CardVariant) => number
): Map<string, WantProgress> {
	const progress = new Map<string, WantProgress>();
	const owned = new Map<string, number>();
	const unclaimed = new Map<string, number>();

	for (const want of [...wants].sort(byClaim)) {
		const finish = `${want.cardId}|${want.variant}`;
		if (!owned.has(finish)) {
			const copies = ownedOf(want.cardId, want.variant);
			owned.set(finish, copies);
			unclaimed.set(finish, copies);
		}
		const counted =
			want.counting === 'total' ? Math.min(want.quantity, unclaimed.get(finish)!) : 0;
		unclaimed.set(finish, unclaimed.get(finish)! - counted);
		progress.set(wantKey(want), {
			owned: owned.get(finish)!,
			counted,
			missing: copiesToFind(want, counted)
		});
	}
	return progress;
}

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
	battleLogs: [],
	formats: [],
	tombstones: []
});

export const newId = () =>
	globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
