import { describe, expect, it, vi } from 'vitest';
import { dropRetiredCaches, retiredCacheNames } from '../src/lib/pwa/caches';

/** Just the one method `dropRetiredCaches` touches. */
function fakeStorage(present: string[]) {
	const held = new Set(present);
	return {
		delete: vi.fn(async (name: string) => held.delete(name)),
		remaining: () => [...held]
	};
}

const asStorage = (fake: ReturnType<typeof fakeStorage>) => fake as unknown as CacheStorage;

describe('dropRetiredCaches', () => {
	it('deletes the poisoned image cache an older build wrote', async () => {
		const storage = fakeStorage(['tcgdex-images', 'tcgdex-art', 'card-details']);

		const dropped = await dropRetiredCaches(asStorage(storage));

		expect(dropped).toEqual(['tcgdex-images']);
		expect(storage.remaining()).toEqual(['tcgdex-art', 'card-details']);
	});

	it('leaves the caches this build still uses alone', async () => {
		const storage = fakeStorage(['tcgdex-art', 'card-details', 'tcgdex-cards']);

		expect(await dropRetiredCaches(asStorage(storage))).toEqual([]);
		expect(storage.remaining()).toHaveLength(3);
	});

	it('is a no-op on a second run', async () => {
		const storage = fakeStorage(['tcgdex-images']);

		await dropRetiredCaches(asStorage(storage));

		expect(await dropRetiredCaches(asStorage(storage))).toEqual([]);
	});

	it('survives a browser that refuses Cache Storage', async () => {
		const throwing = {
			delete: vi.fn(async () => {
				throw new DOMException('denied');
			})
		} as unknown as CacheStorage;

		await expect(dropRetiredCaches(throwing)).resolves.toEqual([]);
	});

	it('does nothing where Cache Storage is absent, as in SSR or an old browser', async () => {
		await expect(dropRetiredCaches(undefined)).resolves.toEqual([]);
	});

	// A name still live in vite.config.ts's runtimeCaching must never appear here, or the
	// app would delete its own cache on every boot.
	it('never retires a cache name the current build writes to', () => {
		const live = ['tcgdex-art', 'tcgdex-cards', 'card-details'];
		expect(retiredCacheNames().filter((name) => live.includes(name))).toEqual([]);
	});
});
