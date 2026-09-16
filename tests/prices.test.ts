import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The price cache is the only part of the app that keeps a copy of something a server
 * owns, so what matters is that it stops asking twice, stops trusting a stale answer,
 * and can never grow big enough to crowd the collection out of localStorage.
 */

const KEY = 'cardex:prices:v1';
const HOUR = 60 * 60 * 1000;

/** Just enough of the Storage interface for card-details.ts. */
function fakeStorage(seed: Record<string, string> = {}) {
	const held = new Map(Object.entries(seed));
	return {
		getItem: (key: string) => held.get(key) ?? null,
		setItem: (key: string, value: string) => void held.set(key, value),
		removeItem: (key: string) => void held.delete(key),
		read: (key: string) => held.get(key) ?? null
	};
}

/** A TCGdex card response with one Cardmarket trend price. */
const cardResponse = (trend: number) => ({
	ok: true,
	json: async () => ({ pricing: { cardmarket: { trend, low: trend / 2, updated: '2026-09-01' } } })
});

let storage: ReturnType<typeof fakeStorage>;
let fetchMock: ReturnType<typeof vi.fn>;

/** A fresh copy of the module, since its cache is module-level state. */
async function freshModule(seed: Record<string, string> = {}) {
	vi.resetModules();
	storage = fakeStorage(seed);
	vi.stubGlobal('localStorage', storage);
	return import('../src/lib/card-details');
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-09-11T12:00:00.000Z'));
	fetchMock = vi.fn(async () => cardResponse(4.5));
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('loadPrices', () => {
	it('reads the quote TCGdex returns', async () => {
		const { loadPrices } = await freshModule();

		expect(await loadPrices('swsh1-1')).toEqual([
			{ source: 'Cardmarket', currency: 'EUR', price: 4.5, low: 2.25, updated: '2026-09-01' }
		]);
	});

	it('asks once per card, however many rows want the price', async () => {
		const { loadPrices } = await freshModule();

		await Promise.all([loadPrices('swsh1-1'), loadPrices('swsh1-1')]);
		await loadPrices('swsh1-1');

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('serves a quote this browser already stored, without a request', async () => {
		const stored = {
			[KEY]: JSON.stringify({
				'swsh1-1': { at: Date.now() - HOUR, prices: [{ source: 'Cardmarket', price: 1 }] }
			})
		};
		const { loadPrices } = await freshModule(stored);

		expect(await loadPrices('swsh1-1')).toEqual([{ source: 'Cardmarket', price: 1 }]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('refetches a quote older than half a day', async () => {
		const stored = {
			[KEY]: JSON.stringify({
				'swsh1-1': { at: Date.now() - 13 * HOUR, prices: [{ source: 'Cardmarket', price: 1 }] }
			})
		};
		const { loadPrices } = await freshModule(stored);

		expect((await loadPrices('swsh1-1'))[0].price).toBe(4.5);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('writes what it fetched back to storage, one write for a whole list', async () => {
		const { loadPrices } = await freshModule();

		await loadPrices('swsh1-1');
		await loadPrices('swsh1-2');
		expect(storage.read(KEY)).toBeNull(); // still batching

		await vi.advanceTimersByTimeAsync(1000);

		expect(Object.keys(JSON.parse(storage.read(KEY)!))).toEqual(['swsh1-1', 'swsh1-2']);
	});

	it('drops the oldest quotes rather than filling up localStorage', async () => {
		const seeded = Object.fromEntries(
			Array.from({ length: 1600 }, (_, index) => [
				`old-${index}`,
				{ at: Date.now() - (1600 - index) * 1000, prices: [] }
			])
		);
		const { loadPrices } = await freshModule({ [KEY]: JSON.stringify(seeded) });

		await loadPrices('swsh1-1');
		await vi.advanceTimersByTimeAsync(1000);

		const kept = JSON.parse(storage.read(KEY)!);
		expect(Object.keys(kept)).toHaveLength(1500);
		expect(kept['swsh1-1']).toBeDefined();
		expect(kept['old-0']).toBeUndefined(); // the oldest went first
		expect(kept['old-1599']).toBeDefined();
	});

	it('survives junk in storage, and a browser with no storage at all', async () => {
		const { loadPrices } = await freshModule({ [KEY]: 'not json' });
		expect(await loadPrices('swsh1-1')).toHaveLength(1);

		vi.resetModules();
		vi.stubGlobal('localStorage', undefined);
		const offline = await import('../src/lib/card-details');
		expect(await offline.loadPrices('swsh1-2')).toHaveLength(1);
	});

	it('throws when TCGdex says no, so the caller can say prices need a connection', async () => {
		const { loadPrices } = await freshModule();
		fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });

		await expect(loadPrices('swsh1-1')).rejects.toThrow('503');
	});

	it('forgets everything when the user asks for fresh prices', async () => {
		const { loadPrices, clearPriceCache } = await freshModule();

		await loadPrices('swsh1-1');
		clearPriceCache();
		await loadPrices('swsh1-1');

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(storage.read(KEY)).toBeNull();
	});
});

describe('reading a price', () => {
	it('picks the marketplace asked for, and says so when it has none', async () => {
		const { priceFrom } = await freshModule();
		const cardmarket = { source: 'Cardmarket' as const, currency: 'EUR' as const, price: 3, low: null, updated: null };

		expect(priceFrom([cardmarket], 'Cardmarket')).toBe(cardmarket);
		expect(priceFrom([cardmarket], 'TCGplayer')).toBeNull();
		expect(priceFrom(undefined, 'Cardmarket')).toBeNull();
	});

	it('formats a total in the currency of the marketplace it came from', async () => {
		const { formatMoney } = await freshModule();

		expect(formatMoney('USD', 12.5)).toBe('$12.50');
		// German grouping for euros — a non-breaking space before the symbol.
		expect(formatMoney('EUR', 12.5).replace(/ /g, ' ')).toBe('12,50 €');
	});
});
