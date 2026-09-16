import { describe, expect, it } from 'vitest';
import {
	deltaCardCount,
	emptyDelta,
	mergeDelta,
	pruneDelta,
	staleSetIds,
	type CatalogueDelta,
	type DeltaSet
} from '../src/lib/catalogue-delta';
import { buildCatalogue } from '../src/lib/catalogue-index';
import type { CardRow, CatalogueFile, SetRow } from '../src/lib/catalogue-format';
import type { RestSetBrief } from '../src/lib/tcg/tcgdex';

/** `declaredTotal` is TCGdex's own count, which may exceed the rows it has published. */
function setRow(id: string, declaredTotal: number | null, name = id): SetRow {
	return [id, name, 'Series', id.toUpperCase(), '2025-01-01', declaredTotal, null, null, null, 1, 1, 1];
}

function cardRow(id: string, setIndex: number, localId: string, name = 'Pikachu'): CardRow {
	return [id, setIndex, localId, name, 'P', [], null, null, null, [], null, 'n', 0];
}

const baseline: CatalogueFile = {
	generatedAt: '2026-08-03',
	sets: [setRow('mep', 60), setRow('sv01', 2)],
	cards: [
		cardRow('mep-001', 0, '001'),
		cardRow('sv01-001', 1, '001'),
		cardRow('sv01-002', 1, '002')
	]
};

const brief = (id: string, total: number | null): RestSetBrief => ({
	id,
	name: id,
	cardCount: { total: total ?? undefined }
});

function deltaSet(overrides: Partial<DeltaSet> & { set: SetRow }): DeltaSet {
	return { cards: [], details: [], fetchedAt: '2026-09-12T00:00:00.000Z', ...overrides };
}

describe('staleSetIds', () => {
	it('flags a set TCGdex has grown since the build', () => {
		const briefs = [brief('mep', 93), brief('sv01', 2)];
		expect(staleSetIds(baseline, briefs, null)).toEqual(['mep']);
	});

	it('flags a set the build has never seen', () => {
		const briefs = [brief('mep', 60), brief('sv01', 2), brief('swsh9tg', 30)];
		expect(staleSetIds(baseline, briefs, null)).toEqual(['swsh9tg']);
	});

	it('leaves an unchanged set alone', () => {
		expect(staleSetIds(baseline, [brief('mep', 60), brief('sv01', 2)], null)).toEqual([]);
	});

	/**
	 * The regression this rule exists for: MEP declares 93 cards and publishes 89, so a
	 * row-count test would call it stale forever and re-fetch it on every single check.
	 */
	it('does not re-flag a set whose declared total is already recorded', () => {
		const delta: CatalogueDelta = {
			...emptyDelta('2026-08-03'),
			sets: { mep: deltaSet({ set: setRow('mep', 93), cards: [cardRow('mep-001', 0, '001')] }) }
		};

		expect(staleSetIds(baseline, [brief('mep', 93), brief('sv01', 2)], delta)).toEqual([]);
	});

	it('re-flags a set that grew again after being cached', () => {
		const delta: CatalogueDelta = {
			...emptyDelta('2026-08-03'),
			sets: { mep: deltaSet({ set: setRow('mep', 93) }) }
		};

		expect(staleSetIds(baseline, [brief('mep', 96), brief('sv01', 2)], delta)).toEqual(['mep']);
	});

	it('never re-checks a set recorded as skipped', () => {
		const delta: CatalogueDelta = { ...emptyDelta('2026-08-03'), skipped: ['A1'] };
		expect(staleSetIds(baseline, [brief('A1', 286)], delta)).toEqual([]);
	});
});

describe('mergeDelta', () => {
	it('returns the baseline untouched when there is nothing to merge', () => {
		expect(mergeDelta(baseline, null)).toBe(baseline);
		expect(mergeDelta(baseline, emptyDelta('2026-08-03'))).toBe(baseline);
	});

	it('replaces a set wholesale rather than patching card by card', () => {
		const delta: CatalogueDelta = {
			...emptyDelta('2026-08-03'),
			sets: {
				mep: deltaSet({
					set: setRow('mep', 93),
					// mep-001 is gone upstream; 002 and 093 are new.
					cards: [cardRow('mep-002', 0, '002'), cardRow('mep-093', 0, '093')]
				})
			}
		};

		const merged = mergeDelta(baseline, delta);
		const ids = merged.cards.map((card) => card[0]);

		expect(ids).toEqual(['mep-002', 'mep-093', 'sv01-001', 'sv01-002']);
		// The untouched set keeps every card it had.
		expect(ids.filter((id) => id.startsWith('sv01-'))).toHaveLength(2);
	});

	it('keeps set indexes pointing at the right sets', () => {
		const delta: CatalogueDelta = {
			...emptyDelta('2026-08-03'),
			sets: {
				swsh9tg: deltaSet({
					set: setRow('swsh9tg', 30, 'Brilliant Stars Trainer Gallery'),
					cards: [cardRow('swsh9tg-TG01', 0, 'TG01', 'Bidoof')]
				})
			}
		};

		const catalogue = buildCatalogue(mergeDelta(baseline, delta));

		expect(catalogue.byId.get('swsh9tg-TG01')?.set.id).toBe('swsh9tg');
		expect(catalogue.byId.get('sv01-002')?.set.id).toBe('sv01');
		expect(catalogue.byId.get('mep-001')?.set.id).toBe('mep');
	});

	it('carries a replaced set’s own row, not the stale one', () => {
		const delta: CatalogueDelta = {
			...emptyDelta('2026-08-03'),
			sets: { mep: deltaSet({ set: setRow('mep', 93) }) }
		};

		const merged = mergeDelta(baseline, delta);
		expect(merged.sets.find((set) => set[0] === 'mep')?.[5]).toBe(93);
		expect(merged.sets).toHaveLength(2);
	});
});

describe('pruneDelta', () => {
	it('keeps the newest sets and drops what will not fit', () => {
		const big = Array.from({ length: 40 }, (_, i) => cardRow(`x-${i}`, 0, String(i)));
		const delta: CatalogueDelta = {
			...emptyDelta('2026-08-03'),
			sets: {
				old: deltaSet({ set: setRow('old', 40), cards: big, fetchedAt: '2026-09-01T00:00:00.000Z' }),
				new: deltaSet({ set: setRow('new', 40), cards: big, fetchedAt: '2026-09-10T00:00:00.000Z' })
			}
		};

		const budget = JSON.stringify(delta.sets.new).length + 10;
		const pruned = pruneDelta(delta, budget);

		expect(Object.keys(pruned.sets)).toEqual(['new']);
		expect(deltaCardCount(pruned)).toBe(40);
	});

	it('leaves a delta inside its budget alone', () => {
		const delta: CatalogueDelta = {
			...emptyDelta('2026-08-03'),
			sets: { mep: deltaSet({ set: setRow('mep', 93), cards: [cardRow('mep-093', 0, '093')] }) }
		};

		expect(pruneDelta(delta, 100_000)).toEqual(delta);
	});
});
