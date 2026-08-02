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
 * TCGdex series that are not physical Pokémon TCG cards. Pokémon TCG Pocket is a
 * separate digital game — its ~2k cards would only add noise to a collection tracker.
 */
export const EXCLUDED_SERIES = new Set(['tcgp']);
