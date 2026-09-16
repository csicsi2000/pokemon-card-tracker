/**
 * The gap between the catalogue that shipped with the build and what TCGdex has now.
 *
 * `static/catalogue.json` is a snapshot: accurate the day `npm run build:catalogue` ran,
 * and progressively wrong afterwards as sets are announced, filled in and corrected.
 * Rather than fetch 21k cards at runtime, the app keeps the static file as its baseline
 * and layers a *delta* on top — the handful of sets that have moved since — which is
 * small enough to cache in localStorage and merge on every load.
 *
 * This module is the decision-making half: which sets are stale, and how a delta folds
 * back into a `CatalogueFile`. It performs no I/O, so it can be tested directly; the
 * fetching and caching live in catalogue-refresh.ts.
 */
import type { CardDetailRow, CardRow, CatalogueFile, SetRow } from './catalogue-format';
import type { RestSetBrief } from './tcg/tcgdex';

/** One set, fetched whole. Sets are replaced entire — never patched card by card. */
export type DeltaSet = {
	set: SetRow;
	/**
	 * The set's cards. Slot 1 (the set index) is a placeholder: a delta has no set array
	 * of its own, so `mergeDelta` rewrites it against the merged one.
	 */
	cards: CardRow[];
	details: CardDetailRow[];
	fetchedAt: string;
};

export type CatalogueDelta = {
	/**
	 * The `generatedAt` of the static file this was computed against. A deploy with a
	 * newer file makes the whole delta redundant, so it is thrown away rather than
	 * merged — see `readDelta` in catalogue-refresh.ts.
	 */
	baseGeneratedAt: string;
	/** When TCGdex's set list was last compared against the baseline. */
	checkedAt: string;
	sets: Record<string, DeltaSet>;
	/**
	 * Sets deliberately not carried: TCGdex ids that turned out to belong to an excluded
	 * series (Pokémon TCG Pocket). Remembered so each refresh does not re-discover them.
	 */
	skipped: string[];
};

export const emptyDelta = (baseGeneratedAt: string): CatalogueDelta => ({
	baseGeneratedAt,
	checkedAt: '',
	sets: {},
	skipped: []
});

export const deltaCardCount = (delta: CatalogueDelta | null) =>
	delta ? Object.values(delta.sets).reduce((total, entry) => total + entry.cards.length, 0) : 0;

/**
 * Which sets are worth fetching, given TCGdex's current set list.
 *
 * The test is the set's own `cardCount.total` against the total recorded alongside the
 * rows we already hold — not against how many rows we hold. TCGdex routinely announces
 * a set's size before publishing every card (MEP declares 93 and has published 89), so
 * comparing row counts would mark such a set stale forever and re-fetch it on every
 * check. Comparing the declared totals only reacts when TCGdex itself moves.
 */
export function staleSetIds(
	baseline: CatalogueFile,
	briefs: RestSetBrief[],
	delta: CatalogueDelta | null
): string[] {
	const declaredTotal = new Map<string, number | null>();
	for (const set of baseline.sets) declaredTotal.set(set[0], set[5]);
	// A set already in the delta was fetched more recently than the baseline; its row wins.
	for (const entry of Object.values(delta?.sets ?? {})) {
		declaredTotal.set(entry.set[0], entry.set[5]);
	}

	const skipped = new Set(delta?.skipped ?? []);

	return briefs
		.filter((brief) => {
			if (skipped.has(brief.id)) return false;
			if (!declaredTotal.has(brief.id)) return true; // a set this build has never seen
			return (brief.cardCount?.total ?? null) !== declaredTotal.get(brief.id);
		})
		.map((brief) => brief.id);
}

/**
 * The baseline with the delta's sets swapped in. Existing set rows are replaced in place
 * so every untouched card keeps its set index; genuinely new sets are appended.
 */
export function mergeDelta(baseline: CatalogueFile, delta: CatalogueDelta | null): CatalogueFile {
	const setIds = Object.keys(delta?.sets ?? {});
	if (!delta || !setIds.length) return baseline;

	const sets = [...baseline.sets];
	const indexById = new Map(sets.map((set, index) => [set[0], index]));

	for (const setId of setIds) {
		const row = delta.sets[setId].set;
		const at = indexById.get(setId);
		if (at === undefined) {
			indexById.set(setId, sets.length);
			sets.push(row);
		} else {
			sets[at] = row;
		}
	}

	// Replacing a set means dropping the baseline's whole printing list for it, so cards
	// TCGdex has since removed or renumbered do not survive as ghosts.
	const replaced = new Set(setIds);
	const cards = baseline.cards.filter((card) => !replaced.has(baseline.sets[card[1]][0]));

	for (const setId of setIds) {
		const setIndex = indexById.get(setId)!;
		for (const card of delta.sets[setId].cards) {
			const row = [...card] as CardRow;
			row[1] = setIndex;
			cards.push(row);
		}
	}

	// Same order the build script writes, so merged and built catalogues behave alike.
	cards.sort((a, b) => (a[0] as string).localeCompare(b[0] as string));

	return { generatedAt: baseline.generatedAt, sets, cards };
}

/**
 * Keeps the cached delta inside a byte budget by dropping whole sets, oldest fetch
 * first. localStorage is shared with the user's actual collection, which must never lose
 * a write because the catalogue cache grew — so the cache yields, and anything dropped
 * is simply re-fetched on the next check (or superseded by the next deploy).
 */
export function pruneDelta(delta: CatalogueDelta, budgetBytes: number): CatalogueDelta {
	const entries = Object.entries(delta.sets).sort((a, b) =>
		b[1].fetchedAt.localeCompare(a[1].fetchedAt)
	);

	const kept: Record<string, DeltaSet> = {};
	let used = 0;

	for (const [setId, entry] of entries) {
		const size = JSON.stringify(entry).length;
		if (used + size > budgetBytes) continue;
		used += size;
		kept[setId] = entry;
	}

	return { ...delta, sets: kept };
}
