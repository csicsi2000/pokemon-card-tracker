/**
 * Log names → catalogue printings, so a replay can show the art.
 *
 * A log names cards and nothing else: no set, no number. Any printing of "Alakazam" is
 * therefore as good as any other for a replay — except that the user is watching *their*
 * deck, so the printings in the deck are tried first and the board shows the cards they
 * actually own. Failing that the newest printing of the name wins, which is what the
 * import resolver does too.
 *
 * Lookups are memoised per index because a long game names the same twenty cards several
 * hundred times over.
 */
import type { Catalogue } from '$lib/catalogue-index';
import type { Card } from '$lib/types';
import { energyNameAliases, normalizeName } from '../normalize';

export type LogCardIndex = {
	/** The printing to show for a log name, or null when the catalogue has no such card. */
	find: (name: string) => Card | null;
};

/**
 * `preferred` is the deck's card ids: the log's "Alakazam" then resolves to the Alakazam
 * in the list rather than a random reprint.
 */
export function buildLogCardIndex(catalogue: Catalogue, preferred: string[] = []): LogCardIndex {
	const own = new Map<string, Card>();
	for (const id of preferred) {
		const card = catalogue.byId.get(id);
		// First printing named wins, so a deck holding two Alakazams shows the earlier row.
		if (card && !own.has(card.nameNormalized)) own.set(card.nameNormalized, card);
	}

	const cache = new Map<string, Card | null>();

	/**
	 * The log writes "Basic Darkness Energy" where the catalogue has "Darkness Energy",
	 * and PTCGL exports write "Basic {D} Energy" — which is what energyNameAliases is for.
	 */
	function spellings(name: string): string[] {
		const bare = name.replace(/^basic\s+/i, '');
		return [name, bare, `Basic ${bare}`, ...energyNameAliases(name)];
	}

	const lookup = (name: string): Card | null => {
		for (const spelling of spellings(name)) {
			const key = normalizeName(spelling);
			const mine = own.get(key);
			if (mine) return mine;
			// `byName` buckets are sorted newest printing first.
			const bucket = catalogue.byName.get(key);
			if (bucket?.length) return bucket[0];
		}
		return null;
	};

	return {
		find(name: string) {
			const key = normalizeName(name);
			if (cache.has(key)) return cache.get(key)!;
			const card = lookup(name);
			cache.set(key, card);
			return card;
		}
	};
}

/**
 * The printed HP of what is on top of a stack, for the damage bar. Null for a Pokémon the
 * catalogue does not know — the bar then just shows the damage.
 */
export const hpOf = (index: LogCardIndex, name: string): number | null =>
	index.find(name)?.hp ?? null;
