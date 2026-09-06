import { describe, expect, it, vi } from 'vitest';
import { HEAL_DELAY_MS, healArtwork } from '../src/lib/pwa/art';

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
});
