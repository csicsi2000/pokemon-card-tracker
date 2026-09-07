/**
 * How a list of owned printings is ordered on screen. Kept out of the page so the flat
 * grid and the per-lot sections sort identically, and so the awkward parts — what
 * "rarest" means when the catalogue has thirty rarity strings, how a lettered collector
 * number compares to a plain one — can be tested without a component.
 */
import type { Card } from '../types';

export type CollectionSort = 'name' | 'owned' | 'set' | 'rarity' | 'updated';

export const COLLECTION_SORT_LABELS: Record<CollectionSort, string> = {
	name: 'Name',
	owned: 'Copies owned',
	set: 'Set',
	rarity: 'Rarity',
	updated: 'Recently updated'
};

export const COLLECTION_SORTS = Object.keys(COLLECTION_SORT_LABELS) as CollectionSort[];

export type SortDirection = 'asc' | 'desc';

/**
 * Which way each sort opens. Names read A→Z, but nobody picking "copies owned" wants to
 * start at the singles, and "recently updated" means the newest first.
 */
export const DEFAULT_SORT_DIRECTION: Record<CollectionSort, SortDirection> = {
	name: 'asc',
	owned: 'desc',
	set: 'desc',
	rarity: 'desc',
	updated: 'desc'
};

/** What each direction is called, per sort, so the button can say what it will do. */
export function directionLabel(sort: CollectionSort, direction: SortDirection): string {
	const [asc, desc] = DIRECTION_WORDS[sort];
	return direction === 'asc' ? asc : desc;
}

const DIRECTION_WORDS: Record<CollectionSort, [asc: string, desc: string]> = {
	name: ['A → Z', 'Z → A'],
	owned: ['Fewest first', 'Most first'],
	set: ['Oldest first', 'Newest first'],
	rarity: ['Plainest first', 'Rarest first'],
	updated: ['Oldest first', 'Newest first']
};

/**
 * Rarity strings the catalogue actually uses, plainest first. TCGdex has spelled the
 * same tier several ways over the years ("Rare Holo" and "Holo Rare"), so matching is
 * case-blind on the exact string and anything unrecognised — a rarity minted by a set
 * released after this list — sorts just above the special printings rather than
 * pretending to a tier it may not hold.
 *
 * "Promo" is a print run rather than a tier, so it sits at the special end where the
 * promos group together instead of scattering through the commons.
 */
const RARITY_ORDER = [
	'none',
	'common',
	'uncommon',
	'rare',
	'rare holo',
	'holo rare',
	'black white rare',
	'amazing rare',
	'radiant rare',
	'rare prime',
	'legend',
	'rare holo lv.x',
	'holo rare v',
	'holo rare vstar',
	'holo rare vmax',
	'double rare',
	'ace spec rare',
	'ultra rare',
	'full art trainer',
	'shiny rare',
	'shiny rare v',
	'shiny rare vmax',
	'shiny ultra rare',
	'illustration rare',
	'special illustration rare',
	'secret rare',
	'hyper rare',
	'mega hyper rare',
	'classic collection',
	'promo'
];

const RARITY_RANK = new Map(RARITY_ORDER.map((rarity, index) => [rarity, index]));
/** Where an unknown rarity lands: past every ordinary tier, before the special ones. */
const UNKNOWN_RARITY_RANK = RARITY_ORDER.indexOf('ultra rare') - 0.5;

/** A sortable tier for one rarity string. Cards with no rarity at all sort plainest. */
export function rarityRank(rarity: string | null): number {
	if (!rarity) return -1;
	return RARITY_RANK.get(rarity.toLowerCase()) ?? UNKNOWN_RARITY_RANK;
}

/**
 * The digits of a collector number. Lettered numbers ("TG05", "SWSH092") sort by their
 * digits like every other card in the set, which is the order they are printed in.
 */
const collectorNumber = (card: Card) => Number(card.localId.replace(/\D/g, '')) || 0;

/** What a sort needs to know about a row; pages carry more fields alongside. */
export type SortableRow = {
	card: Card;
	/** Copies owned across every finish. */
	total: number;
	/** When the newest of the folded entries was last touched (ISO). */
	updatedAt: string;
};

/** The one value a sort is chosen on. Only this key is reversed by the direction. */
const keyOf: Record<CollectionSort, (row: SortableRow) => string | number> = {
	name: (row) => row.card.name,
	owned: (row) => row.total,
	set: (row) => row.card.set.releaseDate ?? '',
	rarity: (row) => rarityRank(row.card.rarity),
	updated: (row) => row.updatedAt
};

/**
 * Order inside one group of equal keys, which the direction does *not* flip: a set read
 * back to front would list its cards in reverse printed order, which no binder does.
 */
const withinGroup: Partial<Record<CollectionSort, (a: SortableRow, b: SortableRow) => number>> = {
	set: (a, b) => collectorNumber(a.card) - collectorNumber(b.card)
};

/**
 * Ties always fall back to the same order, so the grid never shuffles on its own: by
 * name, then — as everywhere else in the app — the newest printing of that name first.
 */
const tiebreak = (a: SortableRow, b: SortableRow): number =>
	a.card.name.localeCompare(b.card.name) ||
	(b.card.set.releaseDate ?? '').localeCompare(a.card.set.releaseDate ?? '') ||
	collectorNumber(a.card) - collectorNumber(b.card);

const compareKeys = (a: string | number, b: string | number): number =>
	typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));

/** A copy of `rows` in the asked-for order. */
export function sortRows<Row extends SortableRow>(
	rows: readonly Row[],
	sort: CollectionSort,
	direction: SortDirection
): Row[] {
	const flip = direction === 'asc' ? 1 : -1;
	const key = keyOf[sort];
	const inner = withinGroup[sort];

	return [...rows].sort(
		(a, b) => compareKeys(key(a), key(b)) * flip || inner?.(a, b) || tiebreak(a, b)
	);
}
