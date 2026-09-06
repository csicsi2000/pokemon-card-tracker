import { describe, expect, it, vi } from 'vitest';
import { HEAL_DELAYS_MS, HEAL_DELAY_MS, healArtwork, onRetryChance } from '../src/lib/pwa/art';

const noWait = vi.fn(async () => {});

describe('healArtwork', () => {
	it('re-fetches past the HTTP cache and reports a real image', async () => {
		const fetch = vi.fn(async () => new Response('img', { status: 200 }));

		const healed = await healArtwork('https://assets.tcgdex.net/en/sv/sv01/001/low.webp', {
			fetch: fetch as unknown as typeof globalThis.fetch,
			wait: noWait
		});

		expect(healed).toBe(true);
		expect(fetch).toHaveBeenCalledWith('https://assets.tcgdex.net/en/sv/sv01/001/low.webp', {
			mode: 'cors',
			cache: 'reload'
		});
	});

	it('gives up on a scan that is still missing', async () => {
		const fetch = vi.fn(async () => new Response('', { status: 404 }));

		expect(
			await healArtwork('x', { fetch: fetch as unknown as typeof globalThis.fetch, wait: noWait })
		).toBe(false);
	});

	it('treats a network failure (offline, CORS refused) as not healed', async () => {
		const fetch = vi.fn(async () => {
			throw new TypeError('Failed to fetch');
		});

		expect(
			await healArtwork('x', { fetch: fetch as unknown as typeof globalThis.fetch, wait: noWait })
		).toBe(false);
	});

	it('waits before retrying, so a rate-limited burst can clear', async () => {
		const wait = vi.fn(async () => {});
		const fetch = vi.fn(async () => new Response('', { status: 200 }));

		await healArtwork('x', { fetch: fetch as unknown as typeof globalThis.fetch, wait });

		expect(wait).toHaveBeenCalledWith(HEAL_DELAY_MS);
		expect(wait.mock.invocationCallOrder[0]).toBeLessThan(fetch.mock.invocationCallOrder[0]);
	});

	it('waits longer on each rung of the ladder, and no longer past the top', async () => {
		const fetch = vi.fn(async () => new Response('', { status: 200 })) as unknown as typeof globalThis.fetch;
		const waits: number[] = [];
		const wait = async (ms: number) => {
			waits.push(ms);
		};

		for (let attempt = 0; attempt <= HEAL_DELAYS_MS.length; attempt++) {
			await healArtwork('x', { fetch, wait }, attempt);
		}

		expect(waits).toEqual([...HEAL_DELAYS_MS, HEAL_DELAYS_MS[HEAL_DELAYS_MS.length - 1]]);
		expect(HEAL_DELAYS_MS.length).toBeGreaterThan(1);
		for (let i = 1; i < HEAL_DELAYS_MS.length; i++) {
			expect(HEAL_DELAYS_MS[i]).toBeGreaterThan(HEAL_DELAYS_MS[i - 1]);
		}
	});
});

/**
 * Minimal event target: enough for add/remove and for tests to fire an event by name.
 * Doubles as the document when given a visibility state.
 */
function fakeTarget(visibilityState: DocumentVisibilityState = 'visible') {
	const listeners = new Map<string, Set<() => void>>();
	return {
		visibilityState,
		addEventListener: vi.fn((type: string, cb: () => void) => {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)!.add(cb);
		}),
		removeEventListener: vi.fn((type: string, cb: () => void) => {
			listeners.get(type)?.delete(cb);
		}),
		fire: (type: string) => listeners.get(type)?.forEach((cb) => cb()),
		count: () => [...listeners.values()].reduce((n, set) => n + set.size, 0)
	};
}

describe('onRetryChance', () => {
	it('fires when the browser comes back online', () => {
		const win = fakeTarget();
		const doc = fakeTarget('visible');
		const callback = vi.fn();

		onRetryChance(callback, { window: win, document: doc });
		win.fire('online');

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('fires when the page becomes visible, not when it is hidden', () => {
		const win = fakeTarget();
		const doc = fakeTarget('hidden');
		const callback = vi.fn();

		onRetryChance(callback, { window: win, document: doc });
		doc.fire('visibilitychange');
		expect(callback).not.toHaveBeenCalled();

		doc.visibilityState = 'visible';
		doc.fire('visibilitychange');
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('stops listening once torn down', () => {
		const win = fakeTarget();
		const doc = fakeTarget('visible');
		const callback = vi.fn();

		const stop = onRetryChance(callback, { window: win, document: doc });
		stop();
		win.fire('online');
		doc.fire('visibilitychange');

		expect(callback).not.toHaveBeenCalled();
		expect(win.count() + doc.count()).toBe(0);
	});

	it('is a no-op without a window or document (unit tests, build scripts)', () => {
		const stop = onRetryChance(vi.fn(), { window: undefined, document: undefined });
		expect(() => stop()).not.toThrow();
	});
});
