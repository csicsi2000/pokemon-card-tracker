import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogueFile, SetDetailFile } from '../src/lib/catalogue-format';

/**
 * Rules text comes from one static file per set, parsed once and kept for the session.
 * What matters is that only a real answer is kept, that a refresh can replace it, and
 * that a new build reaches devices whose service worker cached the old file.
 */

const detailFile = (name: string): SetDetailFile =>
	({
		cards: [{ localId: '001', illustrator: name }]
	}) as unknown as SetDetailFile;

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const status = (code: number) => ({ ok: false, status: code, json: async () => ({}) });

let fetchMock: ReturnType<typeof vi.fn>;

/** Fresh copies of card-details and the catalogue it reads, since both hold module state. */
async function freshModules() {
	vi.resetModules();
	const details = await import('../src/lib/card-details');
	const catalogue = await import('../src/lib/catalogue');
	return { ...details, ...catalogue };
}

// The first import transforms the whole module graph, which under a busy parallel run can
// outlast a single test's timeout. Pay for it once here; fresh copies are cheap after.
beforeAll(async () => {
	await import('../src/lib/card-details');
}, 60_000);

beforeEach(() => {
	fetchMock = vi.fn(async () => ok(detailFile('Ken Sugimori')));
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('loadCardText', () => {
	it('reads a set once and answers the rest of it from memory', async () => {
		const { loadCardText } = await freshModules();

		expect((await loadCardText('sv01', '001')).illustrator).toBe('Ken Sugimori');
		await loadCardText('sv01', '002');

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('remembers a set with no file at all — a 404 is an answer', async () => {
		const { loadCardText } = await freshModules();
		fetchMock.mockResolvedValue(status(404));

		expect((await loadCardText('sv01', '001')).attacks).toEqual([]);
		await loadCardText('sv01', '001');

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('asks again after a network failure instead of keeping a blank set', async () => {
		const { loadCardText } = await freshModules();
		fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

		expect((await loadCardText('sv01', '001')).illustrator).toBeNull();
		expect((await loadCardText('sv01', '001')).illustrator).toBe('Ken Sugimori');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('asks again after a server error', async () => {
		const { loadCardText } = await freshModules();
		fetchMock.mockResolvedValueOnce(status(503));

		expect((await loadCardText('sv01', '001')).illustrator).toBeNull();
		expect((await loadCardText('sv01', '001')).illustrator).toBe('Ken Sugimori');
	});

	it('does not let a read started before a clear write its old rows back', async () => {
		const { loadCardText, clearCardTextCache } = await freshModules();

		let answer!: (value: unknown) => void;
		fetchMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
		const stale = loadCardText('sv01', '001');

		clearCardTextCache();
		answer(ok(detailFile('Old Artist')));
		expect((await stale).illustrator).toBe('Old Artist'); // its own caller still gets an answer

		fetchMock.mockResolvedValueOnce(ok(detailFile('New Artist')));
		expect((await loadCardText('sv01', '001')).illustrator).toBe('New Artist');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('versions the file by the catalogue build, so a deploy gets past the worker cache', async () => {
		const { loadCardText, loadCatalogue } = await freshModules();
		const file: CatalogueFile = { generatedAt: '2026-10-01', sets: [], cards: [] };
		await loadCatalogue((async () => new Response(JSON.stringify(file))) as typeof fetch);

		await loadCardText('sv01', '001');

		expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/details\/sv01\.json\?v=2026-10-01$/);
	});
});
