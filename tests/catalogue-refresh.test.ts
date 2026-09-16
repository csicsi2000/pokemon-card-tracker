import { describe, expect, it } from 'vitest';
import { emptyDelta, mergeDelta, type CatalogueDelta } from '../src/lib/catalogue-delta';
import { refreshDelta } from '../src/lib/catalogue-refresh';
import { buildCatalogue } from '../src/lib/catalogue-index';
import type { CardRow, CatalogueFile, SetRow } from '../src/lib/catalogue-format';

function setRow(id: string, declaredTotal: number | null): SetRow {
	return [id, id, 'Series', id.toUpperCase(), '2025-01-01', declaredTotal, null, null, null, 1, 1, 1];
}

function cardRow(id: string, setIndex: number, localId: string): CardRow {
	return [id, setIndex, localId, 'Pikachu', 'P', [], null, null, null, [], null, 'n', 0];
}

const baseline: CatalogueFile = {
	generatedAt: '2026-08-03',
	sets: [setRow('mep', 60)],
	cards: [cardRow('mep-001', 0, '001')]
};

type Upstream = {
	briefs: { id: string; total: number }[];
	sets: Record<string, { serie: string; cards: { localId: string; name: string }[] }>;
};

/** A stand-in for TCGdex covering the three calls a refresh makes. */
function fakeFetch(upstream: Upstream) {
	const calls: string[] = [];

	const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		calls.push(`${init?.method ?? 'GET'} ${url}`);

		const json = (body: unknown) =>
			new Response(JSON.stringify(body), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});

		if (init?.method === 'HEAD') return new Response(null, { status: 404 });

		if (url.endsWith('/v2/en/sets')) {
			return json(upstream.briefs.map((set) => ({ id: set.id, name: set.id, cardCount: set })));
		}

		if (url.includes('/v2/en/sets/')) {
			const id = decodeURIComponent(url.split('/v2/en/sets/')[1]);
			const set = upstream.sets[id];
			if (!set) return new Response('not found', { status: 404 });
			return json({
				id,
				name: id,
				cardCount: { total: upstream.briefs.find((brief) => brief.id === id)?.total },
				releaseDate: '2025-09-26',
				serie: { id: set.serie, name: set.serie }
			});
		}

		if (url.endsWith('/graphql')) {
			const query = JSON.parse(String(init?.body)).query as string;
			const id = query.match(/id: "(.+?)-"/)![1];
			return json({
				data: {
					cards: upstream.sets[id].cards.map((card) => ({
						id: `${id}-${card.localId}`,
						localId: card.localId,
						name: card.name,
						category: 'Pokemon',
						set: { id },
						variants: { normal: true },
						attacks: [{ name: 'Thunder Shock', cost: ['Lightning'], damage: '20' }]
					}))
				}
			});
		}

		throw new Error(`unexpected request: ${url}`);
	}) as typeof fetch;

	return { fetcher, calls };
}

describe('refreshDelta', () => {
	const upstream: Upstream = {
		briefs: [
			{ id: 'mep', total: 93 },
			{ id: 'A1', total: 286 }
		],
		sets: {
			mep: {
				serie: 'me',
				cards: [
					{ localId: '001', name: 'Meganium' },
					{ localId: '093', name: 'Pikachu' }
				]
			},
			A1: { serie: 'tcgp', cards: [{ localId: '001', name: 'Bulbasaur' }] }
		}
	};

	it('fetches a grown set and merges its new cards in', async () => {
		const { fetcher } = fakeFetch(upstream);
		const result = await refreshDelta({ baseline, delta: null, fetcher });

		expect(result.checked).toBe(true);
		expect(result.changed).toBe(true);
		expect(result.failures).toEqual([]);

		const catalogue = buildCatalogue(mergeDelta(baseline, result.delta));
		expect(catalogue.byId.get('mep-093')?.name).toBe('Pikachu');
		expect(catalogue.cards).toHaveLength(2);
	});

	it('keeps the rules text the card list already carried', async () => {
		const { fetcher } = fakeFetch(upstream);
		const result = await refreshDelta({ baseline, delta: null, fetcher });

		const details = result.delta.sets.mep.details;
		expect(details.find((row) => row.localId === '093')?.attacks?.[0].name).toBe('Thunder Shock');
	});

	it('records an excluded series as skipped instead of merging it', async () => {
		const { fetcher } = fakeFetch(upstream);
		const result = await refreshDelta({ baseline, delta: null, fetcher });

		expect(result.delta.skipped).toContain('A1');
		expect(result.delta.sets.A1).toBeUndefined();

		// And a second pass costs one request: the set list, and nothing else.
		const second = fakeFetch(upstream);
		const again = await refreshDelta({
			baseline,
			delta: { ...result.delta, checkedAt: '' },
			fetcher: second.fetcher
		});

		expect(again.changed).toBe(false);
		expect(second.calls).toEqual(['GET https://api.tcgdex.net/v2/en/sets']);
	});

	it('skips the network entirely while the last check is still fresh', async () => {
		const { fetcher, calls } = fakeFetch(upstream);
		const delta: CatalogueDelta = { ...emptyDelta('2026-08-03'), checkedAt: new Date().toISOString() };

		const result = await refreshDelta({ baseline, delta, fetcher });

		expect(result.checked).toBe(false);
		expect(result.changed).toBe(false);
		expect(calls).toEqual([]);
	});

	it('runs anyway when forced', async () => {
		const { fetcher, calls } = fakeFetch(upstream);
		const delta: CatalogueDelta = { ...emptyDelta('2026-08-03'), checkedAt: new Date().toISOString() };

		const result = await refreshDelta({ baseline, delta, fetcher, force: true });

		expect(result.checked).toBe(true);
		expect(calls.length).toBeGreaterThan(1);
	});

	it('reports a failed set without losing the ones that worked', async () => {
		const broken: Upstream = {
			briefs: [
				{ id: 'mep', total: 93 },
				{ id: 'gone', total: 10 }
			],
			sets: upstream.sets
		};

		const { fetcher } = fakeFetch(broken);
		const result = await refreshDelta({ baseline, delta: null, fetcher });

		expect(result.failures).toHaveLength(1);
		expect(result.failures[0]).toContain('gone');
		expect(result.delta.sets.mep).toBeDefined();
		// A set that merely failed must not be remembered as skipped, or it is never retried.
		expect(result.delta.skipped).not.toContain('gone');
	});
});
