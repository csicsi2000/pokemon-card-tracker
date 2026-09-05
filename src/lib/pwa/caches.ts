/**
 * Runtime caches earlier builds wrote to and this one no longer uses.
 *
 * Renaming a cache in the `runtimeCaching` block of vite.config.ts is what actually
 * retires it: the new worker reads and writes somewhere else, so whatever the old one
 * holds stops being served the moment that worker activates. What renaming does not do
 * is reclaim the space, and these caches hold card art by the thousand — hence this
 * sweep, which runs from the root layout on boot.
 *
 * Pure apart from the CacheStorage handed in, so it can be unit-tested.
 */

/**
 * Cache names to delete on sight, with the build that retired each one.
 *
 * `tcgdex-images` was retired because its rule accepted opaque responses. Those report
 * status 0 for a 404 exactly as they do for a hit, so a card whose scan had not been
 * uploaded yet could be stored as though it were the artwork and served that way until
 * the 60-day expiry ran out. Nothing in the cache says which entries are affected, so
 * the only safe move is to drop all of it and refetch.
 */
const RETIRED = ['tcgdex-images'];

/**
 * Delete every retired cache, ignoring the ones that are already gone.
 *
 * Safe to run at any point in the worker's lifecycle: if the old worker is still in
 * control it will simply refill a cache nothing will read once the update lands, and a
 * second run finds nothing left to do.
 *
 * @returns the names actually deleted, for tests and logging.
 */
export async function dropRetiredCaches(storage: CacheStorage | undefined): Promise<string[]> {
	if (!storage) return [];

	const dropped: string[] = [];
	for (const name of RETIRED) {
		try {
			if (await storage.delete(name)) dropped.push(name);
		} catch {
			// A browser that refuses to open Cache Storage — private mode, storage
			// disabled — leaves stale art around. That is a cosmetic loss, never a
			// reason to fail the page's first paint.
		}
	}

	return dropped;
}

/** The names this build considers retired. Exported for tests. */
export const retiredCacheNames = () => [...RETIRED];
