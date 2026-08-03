/**
 * PTCGL / pkmn.gg set codes that TCGdex does not carry in `abbreviation.official`.
 *
 * Almost all of these are Black Star Promo sets: PTCGL names them "PR-<era>" while
 * TCGdex uses its own ids. Verified against https://limitlesstcg.com/set-codes.
 *
 * Keys are upper-cased PTCGL codes; values are TCGdex set ids.
 */
export const PTCGL_CODE_OVERRIDES: Record<string, string> = {
	'PR-SW': 'swshp', // SWSH Black Star Promos
	'PR-SM': 'smp', // SM Black Star Promos
	'PR-XY': 'xyp', // XY Black Star Promos
	'PR-BLW': 'bwp', // BW Black Star Promos
	'PR-HS': 'hgssp', // HGSS Black Star Promos
	'PR-DPP': 'dpp', // DP Black Star Promos
	'PR-NP': 'np', // Nintendo Black Star Promos
	'PR-W': 'basep', // Wizards Black Star Promos
	'PR-SV': 'svp', // SVP Black Star Promos (PTCGL also emits plain "SVP")
	LTR: 'rc', // Radiant Collection cards are exported under Legendary Treasures
	SHF: 'swsh4.5sv', // Shining Fates Shiny Vault
	HIF: 'sma' // Hidden Fates Shiny Vault
};

/**
 * TCGdex set id → PTCGL code, so exports can name a promo set properly instead of
 * writing "null" for it. Built by inverting the table above; where several codes map
 * to one set (SVP has two), the first wins.
 */
export const TCGDEX_ID_TO_PTCGL_CODE: Record<string, string> = Object.fromEntries(
	Object.entries(PTCGL_CODE_OVERRIDES)
		.reverse()
		.map(([code, setId]) => [setId, code])
);

/** The code to print for a set in a decklist, or null when nothing sensible exists. */
export const exportSetCode = (set: { id: string; ptcglCode: string | null }) =>
	set.ptcglCode ?? TCGDEX_ID_TO_PTCGL_CODE[set.id] ?? null;
