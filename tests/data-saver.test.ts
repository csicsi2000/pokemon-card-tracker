import { describe, expect, it } from 'vitest';
import { knowsNetworkType, meteredReason, shouldSaveData } from '../src/lib/pwa/data-saver';
import { artForDataSaver, isArtCached } from '../src/lib/pwa/art';

describe('shouldSaveData', () => {
	it('follows the choice when it is not auto', () => {
		expect(shouldSaveData('on', { type: 'wifi' })).toBe(true);
		expect(shouldSaveData('off', { type: 'cellular', saveData: true })).toBe(false);
	});

	it('saves on mobile data, or when the system data saver is on', () => {
		expect(shouldSaveData('auto', { type: 'cellular' })).toBe(true);
		expect(shouldSaveData('auto', { type: 'wifi', saveData: true })).toBe(true);
		expect(shouldSaveData('auto', { type: 'wifi', saveData: false })).toBe(false);
	});

	it('does not save when the browser cannot say', () => {
		expect(shouldSaveData('auto', undefined)).toBe(false);
		expect(shouldSaveData('auto', {})).toBe(false);
	});
});

describe('meteredReason and knowsNetworkType', () => {
	it('names what auto reacted to', () => {
		expect(meteredReason({ type: 'cellular', saveData: true })).toBe('save-data');
		expect(meteredReason({ type: 'cellular' })).toBe('cellular');
		expect(meteredReason({ type: 'ethernet' })).toBeNull();
	});

	it('only trusts a browser that names the network type', () => {
		expect(knowsNetworkType(undefined)).toBe(false);
		// Desktop Chromium: the system data saver, but not Wi-Fi versus mobile.
		expect(knowsNetworkType({ saveData: false })).toBe(false);
		expect(knowsNetworkType({ type: 'wifi' })).toBe(true);
	});
});

describe('artForDataSaver', () => {
	const urls = { low: 'https://a/low.webp', high: 'https://a/high.webp' };
	const cachedOnly =
		(...held: string[]) =>
		async (url: string) =>
			held.includes(url);

	it('shows a tile only from the cache', async () => {
		expect(await artForDataSaver(urls, 'low', cachedOnly(urls.low))).toBe(urls.low);
		expect(await artForDataSaver(urls, 'low', cachedOnly(urls.high))).toBe(urls.high);
		expect(await artForDataSaver(urls, 'low', cachedOnly())).toBeNull();
	});

	it('loads the small scan for an opened card unless the big one is cached', async () => {
		expect(await artForDataSaver(urls, 'high', cachedOnly(urls.high))).toBe(urls.high);
		expect(await artForDataSaver(urls, 'high', cachedOnly())).toBe(urls.low);
	});

	it('has nothing to show for a card without a scan', async () => {
		const none = { low: null, high: null };
		expect(await artForDataSaver(none, 'high', cachedOnly())).toBeNull();
	});
});

describe('isArtCached', () => {
	it('asks every cache, ignoring Vary', async () => {
		const asked: unknown[] = [];
		const storage = {
			match: async (url: RequestInfo | URL, options?: CacheQueryOptions) => {
				asked.push(options);
				return url === 'https://a/low.webp' ? new Response('img') : undefined;
			}
		};
		expect(await isArtCached('https://a/low.webp', storage)).toBe(true);
		expect(await isArtCached('https://a/high.webp', storage)).toBe(false);
		expect(asked[0]).toEqual({ ignoreVary: true });
	});

	it('treats no cache, or a failing one, as a miss', async () => {
		expect(await isArtCached('https://a/low.webp', undefined)).toBe(false);
		const broken = {
			match: async () => {
				throw new Error('SecurityError');
			}
		};
		expect(await isArtCached('https://a/low.webp', broken)).toBe(false);
	});
});
