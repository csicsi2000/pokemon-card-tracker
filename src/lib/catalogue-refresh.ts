/**
 * Keeping the catalogue current without a backend.
 *
 * `static/catalogue.json` is only as fresh as the last deploy, so the app checks TCGdex
 * in the background and caches whatever has moved since. The check is one request for
 * the set list (~35 KB); only sets whose declared size changed are fetched in full, so a
 * typical run costs that one request and nothing else.
 *
 * The cache is keyed to the static file's `generatedAt`: a deploy carrying a newer build
 * makes every cached set redundant, and the whole thing is dropped rather than merged.
 * That keeps the cache self-limiting — it only ever holds the drift of one deploy.
 *
 * Nothing here is required for the app to work. Offline, or with TCGdex down, the static
 * file plus whatever was last cached is what you get, which is exactly the old behaviour.
 */
import {
	emptyDelta,
	pruneDelta,
	staleSetIds,
	type CatalogueDelta,
	type DeltaSet
} from './catalogue-delta';
import { EXCLUDED_SERIES, type CatalogueFile } from './catalogue-format';
import {
	fetchSet,
	fetchSetBriefs,
	fetchSetCards,
	hasPublishedArtwork,
	imageBaseOf,
	mapLimit,
	toCardRow,
	toDetailRow,
	toSetRow,
	type Fetcher
} from './tcg/tcgdex';

const STORAGE_KEY = 'cardex:catalogue-delta:v1';

/** How long a check stays good for. The catalogue moves in days, not minutes. */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Cap on the cached delta. localStorage is shared with the user's collection, and the
 * collection must never fail to save because the catalogue cache grew.
 */
const BUDGET_BYTES = 400_000;

/** Sets fetched per run. The rest wait for the next check rather than storming TCGdex. */
const MAX_SETS_PER_RUN = 20;

const CONCURRENCY = 4;

function isDelta(value: unknown): value is CatalogueDelta {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<CatalogueDelta>;
	return (
		typeof candidate.baseGeneratedAt === 'string' &&
		typeof candidate.checkedAt === 'string' &&
		Boolean(candidate.sets) &&
		typeof candidate.sets === 'object' &&
		Array.isArray(candidate.skipped)
	);
}

/**
 * The cached delta for this baseline, or null. A delta computed against a different
 * build is not repairable — the baseline it patched is gone — so it is discarded.
 */
export function readDelta(baseGeneratedAt: string): CatalogueDelta | null {
	if (typeof localStorage === 'undefined') return null;

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;

		const parsed: unknown = JSON.parse(raw);
		if (!isDelta(parsed) || parsed.baseGeneratedAt !== baseGeneratedAt) {
			localStorage.removeItem(STORAGE_KEY);
			return null;
		}

		return parsed;
	} catch {
		// Corrupt or unreadable: the baseline alone is still a working catalogue.
		return null;
	}
}

export function writeDelta(delta: CatalogueDelta): CatalogueDelta {
	if (typeof localStorage === 'undefined') return delta;

	const pruned = pruneDelta(delta, BUDGET_BYTES);
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
	} catch {
		// Out of quota, most likely. Drop the cache rather than the collection; the next
		// check re-fetches, and the next deploy makes it moot anyway.
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// Nothing further to try.
		}
	}

	return pruned;
}

export function clearDelta() {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Ignore: a cache we cannot clear is still only a cache.
	}
}

export const isDeltaDue = (delta: CatalogueDelta | null, now = Date.now()) =>
	!delta?.checkedAt || now - Date.parse(delta.checkedAt) > CHECK_INTERVAL_MS;

export type RefreshOptions = {
	baseline: CatalogueFile;
	delta: CatalogueDelta | null;
	fetcher?: Fetcher;
	signal?: AbortSignal;
	/** Run even when the last check is still within `CHECK_INTERVAL_MS`. */
	force?: boolean;
};

export type RefreshResult = {
	delta: CatalogueDelta;
	/** Whether any set's cards changed — i.e. whether the catalogue must be rebuilt. */
	changed: boolean;
	/** Whether TCGdex was contacted at all. False when the last check is still fresh. */
	checked: boolean;
	/** Set ids that were stale but did not fit this run's budget. */
	pending: string[];
	failures: string[];
};

/**
 * One refresh pass. Fetches the set list, fetches whatever looks stale, and returns the
 * delta to cache and merge. Failures are collected rather than thrown: a refresh that
 * half-worked is better than one that threw away its own results.
 */
export async function refreshDelta(options: RefreshOptions): Promise<RefreshResult> {
	const { baseline, fetcher = fetch, signal, force = false } = options;
	const delta: CatalogueDelta = options.delta
		? { ...options.delta, sets: { ...options.delta.sets }, skipped: [...options.delta.skipped] }
		: emptyDelta(baseline.generatedAt);

	if (!force && !isDeltaDue(delta)) {
		return { delta, changed: false, checked: false, pending: [], failures: [] };
	}

	const fetchOptions = { fetcher, signal, attempts: 2 };
	const briefs = await fetchSetBriefs(fetchOptions);

	const stale = staleSetIds(baseline, briefs, delta);
	const take = stale.slice(0, MAX_SETS_PER_RUN);
	const pending = stale.slice(MAX_SETS_PER_RUN);

	const failures: string[] = [];
	const fetched: [string, DeltaSet | null][] = await mapLimit(take, CONCURRENCY, async (setId) => {
		try {
			// The set list carries no series, so that is checked before the expensive call:
			// Pokémon TCG Pocket sets are not physical cards and must never be merged in.
			const set = await fetchSet(setId, fetchOptions);
			if (EXCLUDED_SERIES.has(set.serie?.id ?? '')) return [setId, null] as [string, null];

			const { cards } = await fetchSetCards(setId, fetchOptions);
			const details = cards.map(toDetailRow).filter((row) => row !== null);

			return [
				setId,
				{
					// Slot 1 is a placeholder; mergeDelta rewrites it against the merged set array.
					set: toSetRow(set, {
						imageBase: imageBaseOf(cards),
						artworkPublished: await hasPublishedArtwork(cards, fetchOptions)
					}),
					cards: cards.map((card) => toCardRow(card, 0)),
					details,
					fetchedAt: new Date().toISOString()
				}
			] as [string, DeltaSet];
		} catch (error) {
			failures.push(`${setId}: ${(error as Error).message}`);
			return [setId, null] as [string, null];
		}
	});

	let changed = false;
	const failed = new Set(failures.map((failure) => failure.split(':')[0]));

	for (const [setId, entry] of fetched) {
		if (entry) {
			delta.sets[setId] = entry;
			changed = true;
		} else if (!failed.has(setId) && !delta.skipped.includes(setId)) {
			// Excluded series: remember it so every later check skips it for free.
			delta.skipped.push(setId);
		}
	}

	delta.checkedAt = new Date().toISOString();

	return { delta, changed, checked: true, pending, failures };
}
