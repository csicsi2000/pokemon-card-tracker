export type Supertype = 'Pokemon' | 'Trainer' | 'Energy';
export type CardVariant = 'normal' | 'reverse' | 'holo' | 'firstEdition' | 'promo';

export const CARD_VARIANTS: CardVariant[] = ['normal', 'reverse', 'holo', 'firstEdition', 'promo'];

export const VARIANT_LABELS: Record<CardVariant, string> = {
	normal: 'Normal',
	reverse: 'Reverse holo',
	holo: 'Holo',
	firstEdition: '1st edition',
	promo: 'Promo'
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
// User data (read/write, persisted to localStorage)
// ---------------------------------------------------------------------------

export type CollectionEntry = {
	cardId: string;
	variant: CardVariant;
	quantity: number;
};

export type DeckCard = { cardId: string; quantity: number };

export type Deck = {
	id: string;
	name: string;
	description: string | null;
	formatId: string | null;
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

/** Everything the app persists. Also the shape of a backup file. */
export type UserData = {
	version: 1;
	collection: CollectionEntry[];
	decks: Deck[];
	formats: Format[];
};
