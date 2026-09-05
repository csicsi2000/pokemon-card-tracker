/**
 * Turns whatever was persisted — a v1 blob, a v2 blob, a hand-edited backup, junk —
 * into a well-formed v2 `UserData`. Pure and forgiving: bad rows are dropped, missing
 * fields get defaults, and nothing here throws.
 */
import { CARD_VARIANTS, type CardVariant } from '$lib/types';
import {
	rowKey,
	SENTINEL,
	type CollectionEntry,
	type Deck,
	type DeckCard,
	type DeckFolder,
	type Format,
	type Lot,
	type Tombstone,
	type UserData
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

function toRow(value: unknown): CollectionEntry | null {
	if (!isDict(value) || typeof value.cardId !== 'string') return null;
	const quantity = positiveInt(value.quantity);
	if (quantity === 0) return null;
	return {
		cardId: value.cardId,
		variant: variant(value.variant),
		quantity,
		lotId: strOrNull(value.lotId),
		updatedAt: stamp(value.updatedAt)
	};
}

function toCards(value: unknown): DeckCard[] {
	const merged = new Map<string, number>();
	for (const item of arr(value)) {
		if (!isDict(item) || typeof item.cardId !== 'string') continue;
		const quantity = positiveInt(item.quantity);
		if (quantity) merged.set(item.cardId, (merged.get(item.cardId) ?? 0) + quantity);
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
		note: strOrNull(value.note),
		acquiredOn: strOrNull(value.acquiredOn),
		createdAt: stamp(value.createdAt),
		updatedAt: stamp(value.updatedAt)
	};
}

function toFolder(value: unknown): DeckFolder | null {
	if (!isDict(value) || typeof value.id !== 'string') return null;
	return {
		id: value.id,
		name: str(value.name, 'Untitled folder'),
		parentId: strOrNull(value.parentId),
		createdAt: stamp(value.createdAt),
		updatedAt: stamp(value.updatedAt)
	};
}

const TOMBSTONE_KINDS = new Set(['collection', 'lot', 'folder', 'deck', 'format']);

function toTombstone(value: unknown): Tombstone | null {
	if (!isDict(value) || typeof value.key !== 'string') return null;
	if (!TOMBSTONE_KINDS.has(value.kind as string)) return null;
	return { kind: value.kind as Tombstone['kind'], key: value.key, deletedAt: stamp(value.deletedAt) };
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

export function migrate(value: unknown): UserData {
	const data = isDict(value) ? value : {};
	return {
		version: 2,
		collection: dedupeRows(compact(arr(data.collection).map(toRow))),
		lots: uniqueById(compact(arr(data.lots).map(toLot))),
		folders: uniqueById(compact(arr(data.folders).map(toFolder))),
		decks: uniqueById(compact(arr(data.decks).map(toDeck))),
		formats: uniqueById(compact(arr(data.formats).map(toFormat))),
		tombstones: compact(arr(data.tombstones).map(toTombstone))
	};
}
