/**
 * The on-disk shape of static/catalogue.json, shared by the build script and the
 * runtime loader. Rows are tuples to keep the file small; see src/lib/catalogue.ts
 * for the objects the app actually works with.
 */

/**
 * [id, name, series, ptcglCode, releaseDate, cardCount, imageBase, symbolUrl, logoUrl,
 *  legalStandard, legalExpanded, artworkPublished]
 *
 * `artworkPublished` is checked at build time by requesting one card image. TCGdex
 * lists a set's cards as soon as the set is announced, weeks before the scans exist,
 * and a URL that 404s is indistinguishable from a real one until you ask for it.
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

/**
 * Card rules text, split into one file per set. Kept out of the main catalogue because
 * all of it together is 9 MB — fine to ship, far too much to load on first paint — and
 * grouping by set matches how people browse: open one card and the rest of that set is
 * already local.
 *
 * Prices are deliberately absent. They change daily, so they stay a live API call.
 */
export type CardDetailRow = {
	/** Collector number, which is what a card is keyed by inside its own set file. */
	localId: string;
	illustrator?: string;
	retreat?: number;
	effect?: string;
	abilities?: { type: string; name: string; effect: string }[];
	attacks?: { name: string; cost: string[]; damage?: string; effect?: string }[];
	weaknesses?: { type: string; value?: string }[];
};

export type SetDetailFile = {
	setId: string;
	cards: CardDetailRow[];
};

export const CATALOGUE_PATH = 'static/catalogue.json';
export const DETAILS_DIR = 'static/details';

/** Where a set's detail file lives, relative to the deployed root. */
export const detailUrl = (setId: string) => `/details/${encodeURIComponent(setId)}.json`;

/**
 * TCGdex series that are not physical Pokémon TCG cards. Pokémon TCG Pocket is a
 * separate digital game — its ~2k cards would only add noise to a collection tracker.
 */
export const EXCLUDED_SERIES = new Set(['tcgp']);
