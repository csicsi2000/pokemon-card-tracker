// Hand-written types for the tables in supabase/migrations. Kept small and readable
// on purpose — regenerate with the Supabase CLI later if the schema grows.

export type Supertype = 'Pokemon' | 'Trainer' | 'Energy';
export type CardVariant = 'normal' | 'reverse' | 'holo' | 'firstEdition' | 'promo';

export type CardSet = {
	id: string;
	name: string;
	series: string | null;
	ptcgl_code: string | null;
	release_date: string | null;
	card_count: number | null;
	logo_url: string | null;
	symbol_url: string | null;
	legal_standard: boolean;
	legal_expanded: boolean;
};

export type Card = {
	id: string;
	set_id: string;
	local_id: string;
	name: string;
	name_normalized: string;
	supertype: Supertype;
	subtypes: string[];
	rarity: string | null;
	regulation_mark: string | null;
	hp: number | null;
	types: string[];
	evolves_from: string | null;
	image_url: string | null;
	variants: Partial<Record<CardVariant, boolean>>;
	pricing: CardPricing | null;
};

export type CardPricing = {
	/** Lowest sensible market price in EUR, precomputed by the seed script. */
	eur?: number | null;
	tcgplayer?: Record<string, unknown> | null;
	cardmarket?: Record<string, unknown> | null;
};

/** A card row joined with its set — what most list/grid views and legality checks need. */
export type CardSetRef = Pick<
	CardSet,
	'id' | 'name' | 'ptcgl_code' | 'symbol_url' | 'legal_standard' | 'legal_expanded'
>;
export type CardWithSet = Card & { set: CardSetRef | null };

export type CollectionItem = {
	id: string;
	user_id: string;
	card_id: string;
	variant: CardVariant;
	quantity: number;
	notes: string | null;
};

export type Deck = {
	id: string;
	user_id: string;
	name: string;
	format_id: string | null;
	description: string | null;
	created_at: string;
	updated_at: string;
};

export type DeckCard = { deck_id: string; card_id: string; quantity: number };

export type Format = {
	id: string;
	user_id: string;
	name: string;
	description: string | null;
	rules: unknown;
	created_at: string;
	updated_at: string;
};

export type FormatCard = { format_id: string; card_id: string; quantity: number | null };

/**
 * The Supabase clients are left untyped (no `Database` generic). Generating the real
 * schema types needs the Supabase CLI, and a hand-written approximation makes every
 * query result collapse to `never` instead of failing loudly. Query results are cast
 * to the domain types above at the call site instead.
 */
