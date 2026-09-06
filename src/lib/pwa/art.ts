/**
 * Second (and third, and fourth) chances for card art that failed to load.
 *
 * An <img> pointing at assets.tcgdex.net fails for one of three reasons: the scan really
 * is not there (new set, unscanned promo), the request died on the way (a phone waking
 * up with the radio still asleep, a network switch, a CDN hiccup while a grid of two
 * hundred cards loads at once), or the browser's HTTP cache is serving a 404 it stored
 * earlier — the CDN sends its 404s with `Cache-Control: public, max-age=31536000,
 * immutable`.
 *
 * The page cannot tell these apart: a real 404 from this CDN carries no CORS header, so
 * it surfaces as the same TypeError as a dropped connection. What it can do is keep
 * asking for a while. The catalogue only hands out image URLs for scans that existed at
 * build time, so a failure here is nearly always transient — and a card that fails
 * twice in two seconds (the whole budget the previous version gave it) is exactly the
 * card that would have loaded fine five seconds later. Hence the ladder of delays
 * below, and `onRetryChance` for the failures that outlast the ladder: when the browser
 * comes back online or the page is looked at again, the tile asks once more instead of
 * staying blank until the next navigation.
 *
 * `healArtwork` asks again, bypassing the HTTP cache. A `cache: 'reload'` fetch goes to
 * the network unconditionally and, when the answer is a real image, replaces whatever
 * the cache held — so an <img> re-mounted afterwards loads from the fresh entry (or,
 * when a service worker is in control, from the runtime cache the same fetch just
 * filled).
 *
 * Pure apart from the fetch, the timer and the event targets handed in, so it can be
 * unit-tested.
 */

/**
 * How long to wait before each retry. The first pause lets a burst that tripped a rate
 * limit die down; the later ones cover a phone whose network is still coming back.
 * One entry per retry, so the ladder's length is the number of retries a URL gets.
 */
export const HEAL_DELAYS_MS = [1200, 4000, 10000] as const;

/** The first rung of the ladder; kept for callers that only ever retry once. */
export const HEAL_DELAY_MS = HEAL_DELAYS_MS[0];

export type HealDeps = {
	fetch?: typeof fetch;
	/** Resolves after `ms`; injectable so tests need not wait. */
	wait?: (ms: number) => Promise<void>;
};

const realWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Re-fetch `url` straight from the network after the pause that `attempt` (0-based)
 * earns on the ladder. Resolves true when the CDN now has the image, false when it
 * still does not (or the network is down) — the caller then climbs to the next rung, or
 * shows the name fallback once the ladder is exhausted.
 */
export async function healArtwork(url: string, deps: HealDeps = {}, attempt = 0): Promise<boolean> {
	const doFetch = deps.fetch ?? globalThis.fetch;
	if (!doFetch) return false;
	const delay = HEAL_DELAYS_MS[Math.min(attempt, HEAL_DELAYS_MS.length - 1)];
	await (deps.wait ?? realWait)(delay);
	try {
		const response = await doFetch(url, { mode: 'cors', cache: 'reload' });
		return response.ok;
	} catch {
		return false;
	}
}

/** The two event sources `onRetryChance` listens to, narrowed so tests can fake them. */
export type RetryChanceTargets = {
	window?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
	document?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
};

/**
 * Call `callback` whenever an image that gave up might now succeed: the browser reports
 * it is back online, or the page becomes visible again (an installed app brought back
 * to the foreground, a tab switched to). Returns the teardown; call it once the image
 * has loaded, or when the component leaves.
 *
 * Fires at most once per event rather than debouncing: each firing costs one image
 * request and a short retry ladder, and both events are rare.
 */
export function onRetryChance(callback: () => void, targets: RetryChanceTargets = {}): () => void {
	const win = targets.window ?? (typeof window === 'undefined' ? undefined : window);
	const doc = targets.document ?? (typeof document === 'undefined' ? undefined : document);
	if (!win && !doc) return () => {};

	const onOnline = () => callback();
	const onVisible = () => {
		if (doc?.visibilityState === 'visible') callback();
	};
	win?.addEventListener('online', onOnline);
	doc?.addEventListener('visibilitychange', onVisible);
	return () => {
		win?.removeEventListener('online', onOnline);
		doc?.removeEventListener('visibilitychange', onVisible);
	};
}
