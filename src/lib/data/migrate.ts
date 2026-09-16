/**
 * Turns whatever was persisted — a v1 blob, a v2 blob, a hand-edited backup, junk —
 * into a well-formed v2 `UserData`. Pure and forgiving: bad rows are dropped, missing
 * fields get defaults, and nothing here throws.
 */
import { CARD_VARIANTS, type CardVariant } from '$lib/types';
import { isAppearanceColor, normalizeIcon } from './appearance';
import {
	rowKey,
	SENTINEL,
	tradeKey,
	wantKey,
	BATTLE_RESULTS,
	LOG_ENCODINGS,
	WANT_COUNTINGS,
	WANT_PRIORITIES,
	type BattleLog,
	type BattleResult,
	type LogEncoding,
	type CollectionEntry,
	type Deck,
	type DeckCard,
	type Appearance,
	type Folder,
	type Format,
	type Lot,
	type Tombstone,
	type TradeEntry,
	type UserData,
	type WantEntry,
	type WantCounting,
	type WantList,
	type WantPriority
} from './model';

type Dict = Record<string, unknown>;

const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null;
const str = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);
const strOrNull = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const stamp = (value: unknown) =>
	typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : SENTINEL;

const positiveInt = (value: unknown) => {
	const number = Math.floor(Number(value));
	return Number.isFinite(number) && number > 0 ? number : 0;
};

const variant = (value: unknown): CardVariant =>
	CARD_VARIANTS.includes(value as CardVariant) ? (value as CardVariant) : 'normal';

/**
 * Set ids TCGdex has renamed, old → new.
 *
 * A card id is `<setId>-<collector number>`, so a renamed set silently orphans every row
 * pointing at it: the cards are still in the catalogue, under ids nothing refers to any
 * more. The rename cannot be detected after the fact — the old id is simply gone — so
 * each one is recorded here as it is noticed, and rewritten on load.
 *
 * Rewriting on load rather than as a versioned migration is deliberate: a device that
 * has not run this build yet will keep syncing the old ids over, and this has to keep
 * correcting them. It is idempotent, so that costs nothing.
 */
const RENAMED_SETS: Record<string, string> = {
	// The four Sword & Shield Trainer Galleries, renamed some time before 2026-09-12.
	'swsh9.5tg': 'swsh9tg',
	'swsh10.5tg': 'swsh10tg',
	'swsh11.5tg': 'swsh11tg',
	'swsh12.5tg': 'swsh12tg'
};

export function renameCardId(cardId: string): string {
	const split = cardId.lastIndexOf('-');
	if (split <= 0) return cardId;

	const renamed = RENAMED_SETS[cardId.slice(0, split)];
	return renamed ? `${renamed}${cardId.slice(split)}` : cardId;
}

function toRow(value: unknown): CollectionEntry | null {
	if (!isDict(value) || typeof value.cardId !== 'string') return null;
	const quantity = positiveInt(value.quantity);
	if (quantity === 0) return null;
	return {
		cardId: renameCardId(value.cardId),
		variant: variant(value.variant),
		quantity,
		lotId: strOrNull(value.lotId),
		updatedAt: stamp(value.updatedAt)
	};
}

const priority = (value: unknown): WantPriority =>
	WANT_PRIORITIES.includes(value as WantPriority) ? (value as WantPriority) : 'normal';

/**
 * Wants written before the field existed counted the copies already owned towards the
 * quantity, so a missing value has to read as 'total' or an old list silently doubles.
 */
const counting = (value: unknown): WantCounting =>
	WANT_COUNTINGS.includes(value as WantCounting) ? (value as WantCounting) : 'total';

function toWant(value: unknown): WantEntry | null {
	if (!isDict(value) || typeof value.cardId !== 'string') return null;
	const quantity = positiveInt(value.quantity);
	if (quantity === 0) return null;
	return {
		cardId: renameCardId(value.cardId),
		variant: variant(value.variant),
		quantity,
		listId: strOrNull(value.listId),
		counting: counting(value.counting),
		priority: priority(value.priority),
		note: strOrNull(value.note),
		createdAt: stamp(value.createdAt),
		updatedAt: stamp(value.updatedAt)
	};
}

function toTrade(value: unknown): TradeEntry | null {
	if (!isDict(value) || typeof value.cardId !== 'string') return null;
	const quantity = positiveInt(value.quantity);
	if (quantity === 0) return null;
	return {
		cardId: renameCardId(value.cardId),
		variant: variant(value.variant),
		quantity,
		note: strOrNull(value.note),
		createdAt: stamp(value.createdAt),
		updatedAt: stamp(value.updatedAt)
	};
}

function toWantList(value: unknown): WantList | null {
	if (!isDict(value) || typeof value.id !== 'string') return null;
	return {
		id: value.id,
		name: str(value.name, 'Untitled list'),
		note: strOrNull(value.note),
		createdAt: stamp(value.createdAt),
		updatedAt: stamp(value.updatedAt)
	};
}

function toCards(value: unknown): DeckCard[] {
	const merged = new Map<string, number>();
	for (const item of arr(value)) {
		if (!isDict(item) || typeof item.cardId !== 'string') continue;
		const quantity = positiveInt(item.quantity);
		const cardId = renameCardId(item.cardId);
		if (quantity) merged.set(cardId, (merged.get(cardId) ?? 0) + quantity);
	}
	return [...merged].map(([cardId, quantity]) => ({ cardId, quantity }));
}

function toDeck(value: unknown): Deck | null {
	if (!isDict(value) || typeof value.id !== 'string') return null;
	return {
		id: value.id,
		name: str(value.name, 'Untitled deck'),
		description: strOrNull(value.description),
		formatId: strOrNull(value.formatId),
		folderId: strOrNull(value.folderId),
		cards: toCards(value.cards),
		createdAt: stamp(value.createdAt),
		updatedAt: stamp(value.updatedAt)
	};
}

const battleResult = (value: unknown): BattleResult =>
	BATTLE_RESULTS.includes(value as BattleResult) ? (value as BattleResult) : 'unknown';

/** Anything unrecognised is read as plain text: a wrong guess here would hide the log. */
const logEncoding = (value: unknown): LogEncoding =>
	LOG_ENCODINGS.includes(value as LogEncoding) ? (value as LogEncoding) : 'plain';

/** A log with no text or no deck is not a replay, so it is dropped rather than defaulted. */
function toBattleLog(value: unknown): BattleLog | null {
	if (!isDict(value) || typeof value.id !== 'string') return null;
	if (typeof value.deckId !== 'string' || !value.deckId) return null;
	const text = typeof value.text === 'string' ? value.text.trim() : '';
	if (!text) return null;
	return {
		id: value.id,
		deckId: value.deckId,
		text,
		encoding: logEncoding(value.encoding),
		player: str(value.player, ''),
		opponent: str(value.opponent, ''),
		result: battleResult(value.result),
		playedOn: strOrNull(value.playedOn),
		opponentDeck: strOrNull(value.opponentDeck),
		note: strOrNull(value.note),
		createdAt: stamp(value.createdAt),
		updatedAt: stamp(value.updatedAt)
	};
}

function toFormat(value: unknown): Format | null {
	if (!isDict(value) || typeof value.id !== 'string') return null;
	return {
		id: value.id,
		name: str(value.name, 'Untitled format'),
		description: strOrNull(value.description),
		rules: value.rules ?? null,
		pool: toCards(value.pool),
		createdAt: stamp(value.createdAt),
		updatedAt: stamp(value.updatedAt)
	};
}

function toLot(value: unknown): Lot | null {
	if (!isDict(value) || typeof value.id !== 'string') return null;
	return {
		id: value.id,
		name: str(value.name, 'Untitled lot'),
		...toAppearance(value),
		note: strOrNull(value.note),
		acquiredOn: strOrNull(value.acquiredOn),
		folderId: strOrNull(value.folderId),
		createdAt: stamp(value.createdAt),
		updatedAt: stamp(value.updatedAt)
	};
}

/** A colour outside the palette (a newer version's, or a typo in a hand-edited file) drops to none. */
function toAppearance(value: Record<string, unknown>): Appearance {
	return {
		color: isAppearanceColor(value.color) ? value.color : null,
		icon: normalizeIcon(strOrNull(value.icon))
	};
}

function toFolder(value: unknown): Folder | null {
	if (!isDict(value) || typeof value.id !== 'string') return null;
	return {
		id: value.id,
		name: str(value.name, 'Untitled folder'),
		...toAppearance(value),
		description: strOrNull(value.description),
		parentId: strOrNull(value.parentId),
		createdAt: stamp(value.createdAt),
		updatedAt: stamp(value.updatedAt)
	};
}

const TOMBSTONE_KINDS = new Set([
	'collection',
	'want',
	'wantList',
	'trade',
	'lot',
	'lotFolder',
	'folder',
	'deck',
	'battleLog',
	'format'
]);

/** The tombstone kinds whose key starts with a card id — see rowKey/wantKey/tradeKey. */
const CARD_KEYED_KINDS = new Set(['collection', 'want', 'trade']);

function toTombstone(value: unknown): Tombstone | null {
	if (!isDict(value) || typeof value.key !== 'string') return null;
	if (!TOMBSTONE_KINDS.has(value.kind as string)) return null;

	// A renamed row needs its tombstone renamed with it, or the delete stops matching and
	// the row comes back on the next sync.
	let key = value.key;
	if (CARD_KEYED_KINDS.has(value.kind as string)) {
		const split = key.indexOf('|');
		if (split > 0) key = `${renameCardId(key.slice(0, split))}${key.slice(split)}`;
	}

	return { kind: value.kind as Tombstone['kind'], key, deletedAt: stamp(value.deletedAt) };
}

const compact = <T>(items: (T | null)[]) => items.filter((item): item is T => item !== null);

/** Later `updatedAt` wins; duplicates of one id are a corruption we quietly resolve. */
function uniqueById<T extends { id: string; updatedAt: string }>(items: T[]): T[] {
	const byId = new Map<string, T>();
	for (const item of items) {
		const existing = byId.get(item.id);
		if (!existing || item.updatedAt > existing.updatedAt) byId.set(item.id, item);
	}
	return [...byId.values()];
}

/** Rows with the same key are the same physical stack: add them up. */
export function dedupeRows(rows: CollectionEntry[]): CollectionEntry[] {
	const byKey = new Map<string, CollectionEntry>();
	for (const row of rows) {
		const key = rowKey(row);
		const existing = byKey.get(key);
		if (!existing) byKey.set(key, { ...row });
		else {
			existing.quantity += row.quantity;
			if (row.updatedAt > existing.updatedAt) existing.updatedAt = row.updatedAt;
		}
	}
	return [...byKey.values()];
}

/** Two rows for one want are a corruption rather than two piles: the later edit wins. */
export function dedupeWants(wants: WantEntry[]): WantEntry[] {
	const byKey = new Map<string, WantEntry>();
	for (const want of wants) {
		const key = wantKey(want);
		const existing = byKey.get(key);
		if (!existing || want.updatedAt > existing.updatedAt) byKey.set(key, want);
	}
	return [...byKey.values()];
}

/** Two entries for one trade are a corruption rather than two piles: the later edit wins. */
export function dedupeTrades(trades: TradeEntry[]): TradeEntry[] {
	const byKey = new Map<string, TradeEntry>();
	for (const trade of trades) {
		const key = tradeKey(trade);
		const existing = byKey.get(key);
		if (!existing || trade.updatedAt > existing.updatedAt) byKey.set(key, trade);
	}
	return [...byKey.values()];
}

export function migrate(value: unknown): UserData {
	const data = isDict(value) ? value : {};
	return {
		version: 2,
		collection: dedupeRows(compact(arr(data.collection).map(toRow))),
		wants: dedupeWants(compact(arr(data.wants).map(toWant))),
		wantLists: uniqueById(compact(arr(data.wantLists).map(toWantList))),
		trades: dedupeTrades(compact(arr(data.trades).map(toTrade))),
		lots: uniqueById(compact(arr(data.lots).map(toLot))),
		lotFolders: uniqueById(compact(arr(data.lotFolders).map(toFolder))),
		folders: uniqueById(compact(arr(data.folders).map(toFolder))),
		decks: uniqueById(compact(arr(data.decks).map(toDeck))),
		battleLogs: uniqueById(compact(arr(data.battleLogs).map(toBattleLog))),
		formats: uniqueById(compact(arr(data.formats).map(toFormat))),
		tombstones: compact(arr(data.tombstones).map(toTombstone))
	};
}
