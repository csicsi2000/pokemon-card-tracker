/**
 * Second chance for card art that failed to load.
 *
 * An <img> pointing at assets.tcgdex.net fails for one of three reasons: the scan really
 * is not there (new set, unscanned promo), the CDN hiccupped (a 5xx or a 429 while a grid
 * of two hundred cards loads at once), or the browser's HTTP cache is serving a 404 it
 * stored earlier. The last one is the insidious case: the CDN sends its 404s with
 * `Cache-Control: public, max-age=31536000, immutable`, so a card looked at once before its
 * art was uploaded stays blank on that device for a year — the <img> never asks the server
 * again.
 *
 * `healArtwork` asks again, bypassing the HTTP cache. A `cache: 'reload'` fetch goes to the
 * network unconditionally and, when the answer is a real image, replaces whatever the cache
 * held — so an <img> re-mounted afterwards loads from the fresh entry (or, when a service
 * worker is in control, from the runtime cache the same fetch just filled). A short pause
 * first lets a burst of requests that tripped a rate limit die down.
 *
 * Pure apart from the fetch and the timer handed in, so it can be unit-tested.
 */

/** How long to wait before asking again; enough for a 429 burst to clear. */
export const HEAL_DELAY_MS = 1200;

export type HealDeps = {
	fetch?: typeof fetch;
	/** Resolves after `ms`; injectable so tests need not wait. */
	wait?: (ms: number) => Promise<void>;
};

const realWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Re-fetch `url` straight from the network. Resolves true when the CDN now has the image,
 * false when it still does not (or the network is down) — the caller then shows the
 * name fallback and leaves it at that.
 */
export async function healArtwork(url: string, deps: HealDeps = {}): Promise<boolean> {
	const doFetch = deps.fetch ?? globalThis.fetch;
	if (!doFetch) return false;
	await (deps.wait ?? realWait)(HEAL_DELAY_MS);
	try {
		const response = await doFetch(url, { mode: 'cors', cache: 'reload' });
		return response.ok;
	} catch {
		return false;
	}
}
