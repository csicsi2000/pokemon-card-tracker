/**
 * Card-name normalisation shared by the seed script (writes `cards.name_normalized`)
 * and the import resolver (looks names up). Both sides MUST use this function, or
 * lookups silently miss.
 *
 * Collapsing to `[a-z0-9 ]` absorbs every spelling difference we see between PTCGL
 * exports, pkmn.gg and TCGdex at once: accents (Pokémon/Pokemon), curly vs straight
 * apostrophes (Sabrina's Gaze), energy braces ("Basic {R} Energy"), and dashes.
 */
export function normalizeName(input: string): string {
	return input
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '') // strip combining diacritics
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

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
