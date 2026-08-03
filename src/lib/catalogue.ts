/**
 * The card catalogue: ~21k printings loaded once from a static JSON file.
 *
 * Small enough (about 330 KB over the wire) to keep entirely in memory, which means
 * search and lookups are synchronous and the app needs no backend. Call `loadCatalogue()`
 * before using anything else — pages do this in their `load` function.
 */
import { base } from '$app/paths';
import type { CatalogueFile, CardRow, SetRow } from './catalogue-format';
import { normalizeName } from './tcg/normalize';
import type { Card, CardSet, CardVariant, Supertype } from './types';

const SUPERTYPES: Record<string, Supertype> = { P: 'Pokemon', T: 'Trainer', E: 'Energy' };
const VARIANTS: Record<string, CardVariant> = {
	n: 'normal',
	r: 'reverse',
	h: 'holo',
	f: 'firstEdition',
	w: 'promo'
};

export type Catalogue = {
	generatedAt: string;
	cards: Card[];
	sets: CardSet[];
	byId: Map<string, Card>;
	/** Every printing of a name, newest-first. Keyed by normalised name. */
	byName: Map<string, Card[]>;
	setsById: Map<string, CardSet>;
	/** Upper-cased PTCGL code → set. */
	setsByCode: Map<string, CardSet>;
};

function toSet(row: SetRow): CardSet {
	return {
		id: row[0],
		name: row[1],
		series: row[2],
		ptcglCode: row[3],
		releaseDate: row[4],
		cardCount: row[5],
		imageBase: row[6],
		symbolUrl: row[7],
		legalStandard: row[8] === 1,
		legalExpanded: row[9] === 1
	};
}

function toCard(row: CardRow, sets: CardSet[]): Card {
	const set = sets[row[1]];
	return {
		id: row[0],
		set,
		localId: row[2],
		name: row[3],
		nameNormalized: normalizeName(row[3]),
		supertype: SUPERTYPES[row[4]] ?? 'Trainer',
		subtypes: row[5],
		rarity: row[6],
		regulationMark: row[7],
		hp: row[8],
		types: row[9],
		evolvesFrom: row[10],
		variants: [...row[11]].map((letter) => VARIANTS[letter]).filter(Boolean),
		image: row[12] === 1 && set.imageBase ? `${set.imageBase}/${row[2]}` : null
	};
}

function build(file: CatalogueFile): Catalogue {
	const sets = file.sets.map(toSet);
	const cards = file.cards.map((row) => toCard(row, sets));

	const setsById = new Map(sets.map((set) => [set.id, set]));
	const setsByCode = new Map<string, CardSet>();
	for (const set of sets) {
		if (set.ptcglCode) setsByCode.set(set.ptcglCode.toUpperCase(), set);
	}

	const byId = new Map(cards.map((card) => [card.id, card]));
	const byName = new Map<string, Card[]>();
	for (const card of cards) {
		const bucket = byName.get(card.nameNormalized);
		if (bucket) bucket.push(card);
		else byName.set(card.nameNormalized, [card]);
	}

	// Newest printing first everywhere, so "the current one" is just [0].
	const newestFirst = (a: Card, b: Card) =>
		(b.set.releaseDate ?? '').localeCompare(a.set.releaseDate ?? '');
	for (const bucket of byName.values()) bucket.sort(newestFirst);
	sets.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));

	// Browse order: newest set first, then collector number. Search results inherit it.
	const collectorNumber = (card: Card) => Number(card.localId.replace(/\D/g, '')) || 0;
	cards.sort((a, b) => newestFirst(a, b) || collectorNumber(a) - collectorNumber(b));

	return { generatedAt: file.generatedAt, cards, sets, byId, byName, setsById, setsByCode };
}

let cached: Catalogue | null = null;
let inflight: Promise<Catalogue> | null = null;

export async function loadCatalogue(fetcher: typeof fetch = fetch): Promise<Catalogue> {
	if (cached) return cached;
	// Concurrent callers during the first page load must share one request.
	if (inflight) return inflight;

	inflight = (async () => {
		const response = await fetcher(`${base}/catalogue.json`);
		if (!response.ok) {
			throw new Error(
				`Could not load the card catalogue (${response.status}). Run "npm run build:catalogue".`
			);
		}
		cached = build((await response.json()) as CatalogueFile);
		return cached;
	})();

	try {
		return await inflight;
	} finally {
		inflight = null;
	}
}

/** Non-null once `loadCatalogue()` has resolved. */
export const getCatalogue = () => cached;

export type CardFilters = {
	query?: string;
	setId?: string;
	supertype?: Supertype | '';
};

export function searchCards(catalogue: Catalogue, filters: CardFilters, limit = Infinity) {
	const needle = filters.query ? normalizeName(filters.query) : '';
	const results: Card[] = [];

	for (const card of catalogue.cards) {
		if (filters.setId && card.set.id !== filters.setId) continue;
		if (filters.supertype && card.supertype !== filters.supertype) continue;
		if (needle && !card.nameNormalized.includes(needle)) continue;

		results.push(card);
		if (results.length >= limit) break;
	}

	return results;
}

/** TCGdex serves images without an extension; pick the size at render time. */
export function cardImage(card: { image: string | null }, quality: 'low' | 'high' = 'low') {
	return card.image ? `${card.image}/${quality}.webp` : null;
}
