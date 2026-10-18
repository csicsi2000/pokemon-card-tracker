/**
 * Turns parsed decklist entries into catalogue cards.
 *
 * Resolution order, most to least trustworthy:
 *   1. set code + collector number  (the exact printing the export named, looked for in
 *      the code's numbered subsets too — see `setsForCode`)
 *   2. the same, via PTCGL_CODE_OVERRIDES for codes TCGdex lacks
 *   3. name only — used for "null" set codes and for codes we could not map
 *   4. basic-energy aliases ("Basic {R} Energy" → "Fire Energy")
 *
 * Anything still unmatched comes back as `unresolved` so the import review screen can
 * ask the user. This is synchronous — the catalogue is already in memory.
 */
import type { Catalogue } from '$lib/catalogue';
import type { Card, CardSet } from '$lib/types';
import { isStandardLegal } from './legality';
import type { ParsedEntry } from './parser';
import { energyNameAliases, normalizeName } from './normalize';
import { PTCGL_CODE_OVERRIDES } from './set-code-overrides';

export type ResolvedEntry = {
	entry: ParsedEntry;
	card: Card | null;
	/** How the card was found — surfaced in the review UI so guesses are visible. */
	match: 'exact' | 'override' | 'name' | 'energy-alias' | 'unresolved';
	/** Other printings of the same name, so the user can switch printing in review. */
	alternatives: Card[];
	note?: string;
};

/** Compares collector numbers ignoring leading zeros: "001" and "1" are the same card. */
const numberKey = (value: string) => value.replace(/^0+(?=\d)/, '').toLowerCase();

/**
 * Digits only. Promo sets are printed as "SWSH092" but exports often write just "92",
 * so a numeric comparison is the fallback when the literal ids differ.
 */
const digitsOnly = (value: string) => value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');

/** The letters a collector number opens with: "TG" for "TG05", "" for "005". */
const letterPrefix = (value: string) => value.match(/^[A-Za-z]*/)![0].toUpperCase();

/**
 * Printings whose collector number matches, literal matches before numeric ones. A
 * lettered number only falls back to printings with the same letters: "TG05" is a
 * Trainer Gallery card, never the main set's #5.
 */
export function findByNumber(candidates: Card[], number: string, setId?: string) {
	const scoped = setId ? candidates.filter((card) => card.set.id === setId) : candidates;
	const literal = scoped.filter((card) => numberKey(card.localId) === numberKey(number));
	const prefix = letterPrefix(number);
	const numeric = scoped.filter(
		(card) =>
			!literal.includes(card) &&
			(!prefix || letterPrefix(card.localId) === prefix) &&
			digitsOnly(card.localId) &&
			digitsOnly(card.localId) === digitsOnly(number)
	);
	return [...literal, ...numeric];
}

/** Newest standard-legal printing wins, then newest overall — what players expect. */
function pickCanonical(candidates: Card[]) {
	return candidates.find(isStandardLegal) ?? candidates[0];
}

/**
 * Every set a code can name, in the order to look for a collector number in them: the
 * PTCGL code, the override table, the set's numbered subsets, then — because people who
 * read the catalogue type them — a raw TCGdex set id like "sv03".
 *
 * The subsets matter because a main set owns its code: PTCGL writes Silver Tempest's
 * Trainer Gallery as "SIT TG05" (TCGdex codes that subset "SIT:TG"), and Hidden Fates'
 * Shiny Vault as "HIF SV49", which only the override table maps to `sma`.
 */
export function setsForCode(catalogue: Catalogue, code: string) {
	const upper = code.toUpperCase();
	const found: { set: CardSet; viaOverride: boolean }[] = [];
	const add = (set: CardSet | undefined, viaOverride: boolean) => {
		if (set && !found.some((entry) => entry.set === set)) found.push({ set, viaOverride });
	};

	add(catalogue.setsByCode.get(upper), false);
	const overrideId = PTCGL_CODE_OVERRIDES[upper];
	add(overrideId ? catalogue.setsById.get(overrideId) : undefined, true);
	for (const [known, set] of catalogue.setsByCode) {
		if (known.startsWith(`${upper}:`)) add(set, false);
	}
	add(catalogue.setsById.get(code.toLowerCase()), false);

	return found;
}

/** The set a code names first — the one to report when none of them holds a number. */
export function setForCode(catalogue: Catalogue, code: string) {
	return setsForCode(catalogue, code)[0] ?? { set: undefined, viaOverride: false };
}

/**
 * The printing a set code and collector number name, searching every set the code can
 * mean. `candidates` narrows the search to printings already matched by name.
 */
export function findPrinting(catalogue: Catalogue, code: string, number: string, candidates?: Card[]) {
	for (const { set, viaOverride } of setsForCode(catalogue, code)) {
		const card = findByNumber(candidates ?? catalogue.cardsBySet.get(set.id) ?? [], number, set.id)[0];
		if (card) return { set, card, viaOverride };
	}
	return null;
}

/** Set code + collector number with no name — "3 MEG 21" — pins one printing or nothing. */
function resolveByNumberOnly(catalogue: Catalogue, entry: ParsedEntry): ResolvedEntry {
	const code = entry.setCode!.toUpperCase();
	const { set } = setForCode(catalogue, code);
	if (!set) {
		return { entry, card: null, match: 'unresolved', alternatives: [], note: `Unknown set code ${code}` };
	}

	const found = findPrinting(catalogue, code, entry.number!);
	if (!found) {
		return {
			entry,
			card: null,
			match: 'unresolved',
			alternatives: [],
			note: `${set.name} has no card #${entry.number}`
		};
	}

	const { card, viaOverride } = found;
	return {
		entry,
		card,
		match: viaOverride ? 'override' : 'exact',
		alternatives: catalogue.byName.get(card.nameNormalized) ?? [card]
	};
}

export function resolveEntry(catalogue: Catalogue, entry: ParsedEntry): ResolvedEntry {
	if (!entry.name && entry.setCode && entry.number) return resolveByNumberOnly(catalogue, entry);

	// `byName` buckets are already sorted newest printing first.
	let candidates = catalogue.byName.get(normalizeName(entry.name)) ?? [];
	let match: ResolvedEntry['match'] = 'name';
	let note: string | undefined;

	if (candidates.length === 0) {
		for (const alias of energyNameAliases(entry.name)) {
			const aliased = catalogue.byName.get(normalizeName(alias));
			if (aliased?.length) {
				candidates = aliased;
				match = 'energy-alias';
				note = `Matched "${entry.name}" to ${alias}`;
				break;
			}
		}
	}

	if (candidates.length === 0) {
		return { entry, card: null, match: 'unresolved', alternatives: [], note: 'No card with this name' };
	}

	// With a set code and number we can pin the exact printing.
	if (entry.setCode && entry.number) {
		const code = entry.setCode.toUpperCase();
		const { set } = setForCode(catalogue, code);
		const exact = findPrinting(catalogue, code, entry.number, candidates);

		if (exact) {
			return {
				entry,
				card: exact.card,
				match: exact.viaOverride ? 'override' : 'exact',
				alternatives: candidates
			};
		}

		note = set
			? `No ${code} #${entry.number} for this card — used another printing instead`
			: `Unknown set code ${code} — matched by name instead`;
	}

	// No usable set code. If a collector number came through, narrow to the printings
	// that carry it before falling back to the canonical one.
	let pool = candidates;
	if (entry.number) {
		const numbered = findByNumber(candidates, entry.number);
		if (numbered.length) pool = numbered;
	}

	return { entry, card: pickCanonical(pool), match, alternatives: candidates, note };
}

export const resolveEntries = (catalogue: Catalogue, entries: ParsedEntry[]) =>
	entries.map((entry) => resolveEntry(catalogue, entry));
