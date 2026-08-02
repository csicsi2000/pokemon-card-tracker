/** Shared PostgREST select strings, so every card query returns the same shape. */
export const CARD_SELECT =
	'*, set:sets(id, name, ptcgl_code, symbol_url, legal_standard, legal_expanded)';

/** TCGdex serves images without an extension; pick the size at render time. */
export function cardImage(base: string | null, quality: 'low' | 'high' = 'low') {
	return base ? `${base}/${quality}.webp` : null;
}
