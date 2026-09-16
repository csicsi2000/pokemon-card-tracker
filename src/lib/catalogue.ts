/**
 * The card catalogue: ~21k printings loaded once from a static JSON file.
 *
 * Small enough (about 330 KB over the wire) to keep entirely in memory, which means
 * search and lookups are synchronous and the app needs no backend. Call `loadCatalogue()`
 * before using anything else — pages do this in their `load` function.
 *
 * The static file is a snapshot taken at build time. Anything TCGdex has published since
 * arrives as a cached *delta* merged on top of it, refreshed in the background; see
 * catalogue-refresh.ts. The merge happens before indexing, so the rest of the app never
 * has to know whether a card came from the build or from the network.
 *
 * The indexing itself lives in catalogue-index.ts, which has no SvelteKit dependency so
 * the CLI and MCP server can reuse it.
 */
import { base } from '$app/paths';
import { mergeDelta, type CatalogueDelta } from './catalogue-delta';
import type { CatalogueFile } from './catalogue-format';
import { readDelta, refreshDelta, writeDelta } from './catalogue-refresh';
import { buildCatalogue, type Catalogue } from './catalogue-index';

export { searchCards, type CardFilters, type Catalogue } from './catalogue-index';

/** The dependency `+layout.ts` declares, so a refresh can re-run its `load`. */
export const CATALOGUE_DEP = 'cardex:catalogue';

let cached: Catalogue | null = null;
let inflight: Promise<Catalogue> | null = null;

/** The static file as fetched, kept so a later delta can be merged against it. */
let baseline: CatalogueFile | null = null;
let delta: CatalogueDelta | null = null;

export async function loadCatalogue(fetcher: typeof fetch = fetch): Promise<Catalogue> {
	if (cached) return cached;
	// Concurrent callers during the first page load must share one request.
	if (inflight) return inflight;

	inflight = (async () => {
		const response = await fetcher(`${base}/catalogue.json`);
		if (!response.ok) {
			throw new Error(
				`Could not load the card catalogue (${response.status}). Run "npm run build:catalogue".`
			);
		}

		baseline = (await response.json()) as CatalogueFile;
		delta = readDelta(baseline.generatedAt);
		cached = buildCatalogue(mergeDelta(baseline, delta));
		return cached;
	})();

	try {
		return await inflight;
	} finally {
		inflight = null;
	}
}

/** Non-null once `loadCatalogue()` has resolved. */
export const getCatalogue = () => cached;

/** The cached delta, for callers that need what the static build does not carry. */
export const getCatalogueDelta = () => delta;

export type RefreshOutcome = {
	/** True when the in-memory catalogue was rebuilt and callers should re-read it. */
	changed: boolean;
	checked: boolean;
	/** Net cards gained over the static file, once merged. */
	added: number;
	failures: string[];
};

/**
 * Check TCGdex for sets that have moved since this build, and fold them in.
 *
 * Cheap to call — it no-ops while the last check is still fresh, unless `force`. Errors
 * are swallowed: a catalogue that could not be topped up is the static one, which is a
 * perfectly good catalogue.
 */
export async function refreshCatalogue(
	options: { fetcher?: typeof fetch; force?: boolean; signal?: AbortSignal } = {}
): Promise<RefreshOutcome> {
	if (!baseline) return { changed: false, checked: false, added: 0, failures: [] };

	const before = cached?.cards.length ?? 0;

	try {
		const result = await refreshDelta({
			baseline,
			delta,
			fetcher: options.fetcher,
			signal: options.signal,
			force: options.force
		});

		// Persist even when nothing changed: the run still moved `checkedAt` forward.
		delta = writeDelta(result.delta);

		if (result.changed) cached = buildCatalogue(mergeDelta(baseline, delta));

		return {
			changed: result.changed,
			checked: result.checked,
			added: (cached?.cards.length ?? 0) - before,
			failures: result.failures
		};
	} catch (error) {
		return { changed: false, checked: false, added: 0, failures: [(error as Error).message] };
	}
}

/**
 * Every URL these two return points at assets.tcgdex.net, and any <img> that renders one
 * must carry `crossorigin="anonymous"`. The service worker caches that host with
 * CacheFirst; without the attribute the browser fetches no-cors and hands it an opaque
 * response, which reports the same status 0 for a missing scan as for real artwork. See
 * the assets.tcgdex.net rule in vite.config.ts for what that cost us.
 */

/** TCGdex serves images without an extension; pick the size at render time. */
export function cardImage(card: { image: string | null }, quality: 'low' | 'high' = 'low') {
	return card.image ? `${card.image}/${quality}.webp` : null;
}

/** Set logos and symbols are extension-less too, but have no size variants. */
export const setAsset = (url: string | null) => (url ? `${url}.webp` : null);
