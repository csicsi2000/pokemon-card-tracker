/**
 * Card-name normalisation shared by the seed script (writes `cards.name_normalized`)
 * and the import resolver (looks names up). Both sides MUST use this function, or
 * lookups silently miss.
 *
 * Collapsing to `[a-z0-9 ]` absorbs every spelling difference we see between PTCGL
 * exports, pkmn.gg and TCGdex at once: accents (Pokémon/Pokemon), curly vs straight
 * apostrophes (Sabrina's Gaze), energy braces ("Basic {R} Energy"), and dashes.
 *
 * The gender signs are the one symbol that carries meaning: Nidoran♂ and Nidoran♀ are
 * different Pokémon, so they become "m" and "f" before the strip rather than vanishing
 * (which also lets a typed "Nidoran F" find Nidoran♀).
 */
export function normalizeName(input: string): string {
	return input
		.replace(/♂/g, ' m ')
		.replace(/♀/g, ' f ')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '') // strip combining diacritics
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/**
 * TCGdex tells reprints with a different character apart in a trailing parenthetical —
 * "Professor's Research (Professor Oak)", "Boss's Orders (Giovanni)" — but the game
 * treats them as one card. Only a plain-word parenthetical counts: "PokéDex (HANDY909)"
 * is a card of its own.
 */
const CHARACTER_SUFFIX = /\s*\([A-Za-z' .’-]+\)\s*$/;

/** A card's name without that parenthetical: "Professor's Research". */
export const deckDisplayName = (name: string) => name.replace(CHARACTER_SUFFIX, '');

/** The key copy limits and ownership go by — every Professor's Research is one card. */
export const deckNameKey = (name: string) => normalizeName(deckDisplayName(name));

/** Energy symbol letter → full type name, as used in "Basic {R} Energy". */
export const ENERGY_SYMBOLS: Record<string, string> = {
	g: 'Grass',
	r: 'Fire',
	w: 'Water',
	l: 'Lightning',
	p: 'Psychic',
	f: 'Fighting',
	d: 'Darkness',
	m: 'Metal',
	y: 'Fairy',
	c: 'Colorless',
	n: 'Dragon'
};

/**
 * PTCGL writes basic energy as "Basic {R} Energy" while TCGdex names it "Fire Energy".
 * Returns alternative spellings to try when the primary name lookup finds nothing.
 */
export function energyNameAliases(name: string): string[] {
	const normalized = normalizeName(name);
	const match = normalized.match(/^(?:basic\s+)?([a-z])\s+energy$/);
	if (!match) return [];

	const type = ENERGY_SYMBOLS[match[1]];
	if (!type) return [];

	return [`${type} Energy`, `Basic ${type} Energy`];
}
