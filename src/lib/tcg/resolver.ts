/**
 * Turns parsed decklist entries into concrete `cards.id` values.
 *
 * Resolution order, most to least trustworthy:
 *   1. set code + collector number  (exact printing the export named)
 *   2. the same, via PTCGL_CODE_OVERRIDES for codes TCGdex lacks
 *   3. name only — used for "null" set codes and for codes we could not map
 *   4. basic-energy aliases ("Basic {R} Energy" → "Fire Energy")
 *
 * Anything still unmatched comes back as `unresolved` so the import review screen
 * can ask the user. Nothing is ever written to the database from here.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CardWithSet } from '$lib/database.types';
import type { ParsedEntry } from './parser';
import { energyNameAliases, normalizeName } from './normalize';
import { CARD_SELECT } from './queries';
import { PTCGL_CODE_OVERRIDES } from './set-code-overrides';

export type ResolvedEntry = {
	entry: ParsedEntry;
	card: CardWithSet | null;
	/** How the card was found — surfaced in the review UI so guesses are visible. */
	match: 'exact' | 'override' | 'name' | 'energy-alias' | 'unresolved';
	/** Other printings of the same name, so the user can switch printing in review. */
	alternatives: CardWithSet[];
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
function findByNumber(candidates: CardWithSet[], number: string, setId?: string) {
	const scoped = setId ? candidates.filter((card) => card.set_id === setId) : candidates;
	const literal = scoped.filter((card) => numberKey(card.local_id) === numberKey(number));
	const numeric = scoped.filter(
		(card) =>
			!literal.includes(card) && digitsOnly(card.local_id) && digitsOnly(card.local_id) === digitsOnly(number)
	);
	return [...literal, ...numeric];
}

/** Newest standard-legal printing wins, then newest overall — matches what players expect. */
function pickCanonical(candidates: CardWithSet[], setsById: Map<string, { release_date: string | null; legal_standard: boolean }>) {
	return [...candidates].sort((a, b) => {
		const setA = setsById.get(a.set_id);
		const setB = setsById.get(b.set_id);
		if (setA?.legal_standard !== setB?.legal_standard) return setA?.legal_standard ? -1 : 1;
		return (setB?.release_date ?? '').localeCompare(setA?.release_date ?? '');
	})[0];
}

export async function resolveEntries(
	supabase: SupabaseClient,
	entries: ParsedEntry[]
): Promise<ResolvedEntry[]> {
	if (entries.length === 0) return [];

	// One round trip for sets, one for candidate cards — no per-entry queries.
	const { data: sets } = await supabase
		.from('sets')
		.select('id, ptcgl_code, release_date, legal_standard');

	const setByCode = new Map<string, string>();
	const setMeta = new Map<string, { release_date: string | null; legal_standard: boolean }>();
	for (const set of sets ?? []) {
		setMeta.set(set.id, { release_date: set.release_date, legal_standard: set.legal_standard });
		if (set.ptcgl_code) setByCode.set(set.ptcgl_code.toUpperCase(), set.id);
	}
	for (const [code, setId] of Object.entries(PTCGL_CODE_OVERRIDES)) {
		if (!setByCode.has(code)) setByCode.set(code, setId);
	}

	// Collect every name we might need, including basic-energy aliases.
	const wantedNames = new Set<string>();
	for (const entry of entries) {
		wantedNames.add(normalizeName(entry.name));
		for (const alias of energyNameAliases(entry.name)) wantedNames.add(normalizeName(alias));
	}

	const byName = new Map<string, CardWithSet[]>();
	const names = [...wantedNames];
	for (let i = 0; i < names.length; i += 200) {
		const { data } = await supabase
			.from('cards')
			.select(CARD_SELECT)
			.in('name_normalized', names.slice(i, i + 200));

		for (const card of (data ?? []) as unknown as CardWithSet[]) {
			const bucket = byName.get(card.name_normalized);
			if (bucket) bucket.push(card);
			else byName.set(card.name_normalized, [card]);
		}
	}

	return entries.map((entry) => {
		const normalized = normalizeName(entry.name);
		let candidates = byName.get(normalized) ?? [];
		let match: ResolvedEntry['match'] = 'name';
		let note: string | undefined;

		if (candidates.length === 0) {
			for (const alias of energyNameAliases(entry.name)) {
				const aliased = byName.get(normalizeName(alias));
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
			const setId = setByCode.get(code);
			const exact = setId ? findByNumber(candidates, entry.number, setId)[0] : undefined;

			if (exact) {
				const viaOverride = PTCGL_CODE_OVERRIDES[code] === setId;
				return {
					entry,
					card: exact,
					match: viaOverride ? 'override' : 'exact',
					alternatives: candidates
				};
			}

			note = setId
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

		return { entry, card: pickCanonical(pool, setMeta), match, alternatives: candidates, note };
	});
}
