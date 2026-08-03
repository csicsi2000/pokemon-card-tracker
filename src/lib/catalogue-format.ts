/**
 * The on-disk shape of static/catalogue.json, shared by the build script and the
 * runtime loader. Rows are tuples to keep the file small; see src/lib/catalogue.ts
 * for the objects the app actually works with.
 */

/**
 * [id, name, series, ptcglCode, releaseDate, cardCount, imageBase, symbolUrl, logoUrl,
 *  legalStandard, legalExpanded]
 */
export type SetRow = [
	string,
	string,
	string | null,
	string | null,
	string | null,
	number | null,
	string | null,
	string | null,
	string | null,
	0 | 1,
	0 | 1
];

/**
 * [id, setIndex, localId, name, supertype, subtypes, rarity, regulationMark, hp,
 *  types, evolvesFrom, variants, hasImage]
 *
 * `supertype` is P/T/E and `variants` is a letter per available finish
 * (n normal, r reverse, h holo, f firstEdition, w wPromo).
 */
export type CardRow = [
	string,
	number,
	string,
	string,
	'P' | 'T' | 'E',
	string[],
	string | null,
	string | null,
	number | null,
	string[],
	string | null,
	string,
	0 | 1
];

export type CatalogueFile = {
	generatedAt: string;
	sets: SetRow[];
	cards: CardRow[];
};

export const CATALOGUE_PATH = 'static/catalogue.json';

/**
 * TCGdex series that are not physical Pokémon TCG cards. Pokémon TCG Pocket is a
 * separate digital game — its ~2k cards would only add noise to a collection tracker.
 */
export const EXCLUDED_SERIES = new Set(['tcgp']);
