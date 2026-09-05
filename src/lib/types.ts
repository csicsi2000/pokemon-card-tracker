import type { WantPriority } from './data/model';

export type Supertype = 'Pokemon' | 'Trainer' | 'Energy';
export type CardVariant = 'normal' | 'reverse' | 'holo' | 'firstEdition' | 'promo';

export const CARD_VARIANTS: CardVariant[] = ['normal', 'reverse', 'holo', 'firstEdition', 'promo'];

/**
 * Finishes from plainest to most special. Holo comes before reverse on purpose: for a
 * rare holo card, the holo *is* the regular printing and the reverse is the parallel
 * one, so a card that exists only as holo + reverse is recorded as holo by default.
 */
export const VARIANTS_PLAINEST_FIRST: CardVariant[] = [
	'normal',
	'holo',
	'reverse',
	'firstEdition',
	'promo'
];

const VARIANT_RANK = new Map(VARIANTS_PLAINEST_FIRST.map((variant, index) => [variant, index]));

/** The same finishes, plainest first. Unknown values (from a newer catalogue) sort last. */
export const sortVariants = (variants: readonly CardVariant[]): CardVariant[] =>
	[...variants].sort((a, b) => (VARIANT_RANK.get(a) ?? 99) - (VARIANT_RANK.get(b) ?? 99));

/** The finish to assume when none was asked for: the plainest one the card exists in. */
export const plainestVariant = (variants: readonly CardVariant[]): CardVariant =>
	sortVariants(variants)[0] ?? 'normal';

export const VARIANT_LABELS: Record<CardVariant, string> = {
	normal: 'Normal',
	reverse: 'Reverse holo',
	holo: 'Holo',
	firstEdition: '1st edition',
	promo: 'Promo'
};

export const WANT_PRIORITY_LABELS: Record<WantPriority, string> = {
	high: 'High',
	normal: 'Normal',
	low: 'Low'
};

// ---------------------------------------------------------------------------
// Catalogue (read-only, from static/catalogue.json)
// ---------------------------------------------------------------------------

export type CardSet = {
	id: string;
	name: string;
	series: string | null;
	ptcglCode: string | null;
	releaseDate: string | null;
	cardCount: number | null;
	imageBase: string | null;
	/** Both are extension-less TCGdex assets; append '.png' or '.webp'. */
	symbolUrl: string | null;
	logoUrl: string | null;
	legalStandard: boolean;
	legalExpanded: boolean;
	/**
	 * False for sets TCGdex has listed but not yet scanned — the cards exist, the art
	 * does not. Checked at build time, since the URLs look valid until requested.
	 */
	artworkPublished: boolean;
};

export type Card = {
	id: string;
	set: CardSet;
	localId: string;
	name: string;
	/** Lowercased and stripped of punctuation — see tcg/normalize.ts. */
	nameNormalized: string;
	supertype: Supertype;
	subtypes: string[];
	rarity: string | null;
	regulationMark: string | null;
	hp: number | null;
	types: string[];
	evolvesFrom: string | null;
	/** Which finishes this printing exists in. */
	variants: CardVariant[];
	/** Base URL with no extension; append '/low.webp' or '/high.webp'. */
	image: string | null;
};

// ---------------------------------------------------------------------------
// User data (read/write, persisted to localStorage and optionally synced)
// ---------------------------------------------------------------------------

// The shapes live in data/model.ts next to the code that migrates and merges them;
// re-exported here so the rest of the app keeps one import path for domain types.
export type {
	CollectionEntry,
	Deck,
	DeckCard,
	DeckFolder,
	Folder,
	Format,
	FormatPoolCard,
	Lot,
	LotFolder,
	Tombstone,
	UserData,
	WantEntry,
	WantList,
	WantPriority
} from './data/model';
