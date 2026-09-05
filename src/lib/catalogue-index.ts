/**
 * Turns the on-disk catalogue file into the in-memory, indexed `Catalogue`.
 *
 * Kept free of any SvelteKit import so the CLI and MCP server (scripts/) can build the
 * same indexes from `static/catalogue.json` straight off the file system.
 */
import type { CatalogueFile, CardRow, SetRow } from './catalogue-format';
import { cardQuery } from './tcg/card-query';
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
	/** Set id → its printings, so "MEG 21" is a lookup within one set, not a scan. */
	cardsBySet: Map<string, Card[]>;
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
		logoUrl: row[8],
		legalStandard: row[9] === 1,
		legalExpanded: row[10] === 1,
		artworkPublished: row[11] === 1
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

export function buildCatalogue(file: CatalogueFile): Catalogue {
	const sets = file.sets.map(toSet);
	const cards = file.cards.map((row) => toCard(row, sets));

	const setsById = new Map(sets.map((set) => [set.id, set]));
	const setsByCode = new Map<string, CardSet>();
	for (const set of sets) {
		if (set.ptcglCode) setsByCode.set(set.ptcglCode.toUpperCase(), set);
	}

	const byId = new Map(cards.map((card) => [card.id, card]));
	const byName = new Map<string, Card[]>();
	const cardsBySet = new Map<string, Card[]>();
	for (const card of cards) {
		const bucket = byName.get(card.nameNormalized);
		if (bucket) bucket.push(card);
		else byName.set(card.nameNormalized, [card]);

		const setBucket = cardsBySet.get(card.set.id);
		if (setBucket) setBucket.push(card);
		else cardsBySet.set(card.set.id, [card]);
	}

	// Newest printing first everywhere, so "the current one" is just [0].
	const newestFirst = (a: Card, b: Card) =>
		(b.set.releaseDate ?? '').localeCompare(a.set.releaseDate ?? '');
	for (const bucket of byName.values()) bucket.sort(newestFirst);
	sets.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));

	// Browse order: newest set first, then collector number — except that sets TCGdex has
	// not scanned yet sort last, whatever their date. A just-announced set would otherwise
	// fill the opening screen with cards that have no art to show.
	const collectorNumber = (card: Card) => Number(card.localId.replace(/\D/g, '')) || 0;
	cards.sort(
		(a, b) =>
			Number(b.set.artworkPublished) - Number(a.set.artworkPublished) ||
			newestFirst(a, b) ||
			collectorNumber(a) - collectorNumber(b)
	);

	return { generatedAt: file.generatedAt, cards, sets, byId, byName, setsById, setsByCode, cardsBySet };
}

export type CardFilters = {
	query?: string;
	setId?: string;
	supertype?: Supertype | '';
};

export function searchCards(catalogue: Catalogue, filters: CardFilters, limit = Infinity) {
	const { matches, code } = cardQuery(catalogue, filters.query ?? '');
	const passesFilters = (card: Card) =>
		(!filters.setId || card.set.id === filters.setId) &&
		(!filters.supertype || card.supertype === filters.supertype);

	// A "MEG 21" query names one printing; show it before the name matches.
	const results: Card[] = [];
	const pinned = new Set<string>();
	for (const card of code?.cards ?? []) {
		if (!passesFilters(card)) continue;
		pinned.add(card.id);
		results.push(card);
		if (results.length >= limit) return results;
	}

	for (const card of catalogue.cards) {
		if (pinned.has(card.id)) continue;
		if (!passesFilters(card)) continue;
		if (!matches(card)) continue;

		results.push(card);
		if (results.length >= limit) break;
	}

	return results;
}
