/**
 * The card catalogue: ~21k printings loaded once from a static JSON file.
 *
 * Small enough (about 330 KB over the wire) to keep entirely in memory, which means
 * search and lookups are synchronous and the app needs no backend. Call `loadCatalogue()`
 * before using anything else — pages do this in their `load` function.
 *
 * The indexing itself lives in catalogue-index.ts, which has no SvelteKit dependency so
 * the CLI and MCP server can reuse it.
 */
import { base } from '$app/paths';
import type { CatalogueFile } from './catalogue-format';
import { buildCatalogue, type Catalogue } from './catalogue-index';

export { searchCards, type CardFilters, type Catalogue } from './catalogue-index';

let cached: Catalogue | null = null;
let inflight: Promise<Catalogue> | null = null;

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
		cached = buildCatalogue((await response.json()) as CatalogueFile);
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
