/**
 * Turns parsed decklist entries into catalogue cards.
 *
 * Resolution order, most to least trustworthy:
 *   1. set code + collector number  (the exact printing the export named)
 *   2. the same, via PTCGL_CODE_OVERRIDES for codes TCGdex lacks
 *   3. name only — used for "null" set codes and for codes we could not map
 *   4. basic-energy aliases ("Basic {R} Energy" → "Fire Energy")
 *
 * Anything still unmatched comes back as `unresolved` so the import review screen can
 * ask the user. This is synchronous — the catalogue is already in memory.
 */
import type { Catalogue } from '$lib/catalogue';
import type { Card } from '$lib/types';
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

/** Printings whose collector number matches, literal matches before numeric ones. */
function findByNumber(candidates: Card[], number: string, setId?: string) {
	const scoped = setId ? candidates.filter((card) => card.set.id === setId) : candidates;
	const literal = scoped.filter((card) => numberKey(card.localId) === numberKey(number));
	const numeric = scoped.filter(
		(card) =>
			!literal.includes(card) &&
			digitsOnly(card.localId) &&
			digitsOnly(card.localId) === digitsOnly(number)
	);
	return [...literal, ...numeric];
}

/** Newest standard-legal printing wins, then newest overall — what players expect. */
function pickCanonical(candidates: Card[]) {
	return (
		candidates.find((card) => card.set.legalStandard) ?? candidates[0]
	);
}

function setForCode(catalogue: Catalogue, code: string) {
	const direct = catalogue.setsByCode.get(code);
	if (direct) return { set: direct, viaOverride: false };

	const overrideId = PTCGL_CODE_OVERRIDES[code];
	const override = overrideId ? catalogue.setsById.get(overrideId) : undefined;
	return override ? { set: override, viaOverride: true } : { set: undefined, viaOverride: false };
}

export function resolveEntry(catalogue: Catalogue, entry: ParsedEntry): ResolvedEntry {
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
		const { set, viaOverride } = setForCode(catalogue, code);
		const exact = set ? findByNumber(candidates, entry.number, set.id)[0] : undefined;

		if (exact) {
			return { entry, card: exact, match: viaOverride ? 'override' : 'exact', alternatives: candidates };
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
