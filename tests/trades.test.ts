import { describe, expect, it } from 'vitest';
import { merge } from '../src/lib/data/merge';
import { migrate } from '../src/lib/data/migrate';
import { rowKey, tradeKey } from '../src/lib/data/model';
import * as mutate from '../src/lib/data/mutations';
import { repair } from '../src/lib/data/repair';
import { toReadableMarkdown } from '../src/lib/agent/readable';
import { fixedClock, makeLot, makeRow, makeTrade, makeUserData } from './data-helpers';
import { makeCard, makeCatalogue, makeSet } from './helpers';

const NOW = '2026-06-01T00:00:00.000Z';

const tombstone = (
	data: { tombstones: { kind: string; key: string }[] },
	key: string,
	kind = 'trade'
) => data.tombstones.find((t) => t.kind === kind && t.key === key);

describe('trade binder mutations', () => {
	it('setTrade creates an entry with defaults and stamps it', () => {
		const clock = fixedClock();

		const result = mutate.setTrade(makeUserData(), clock, {
			cardId: 'a',
			variant: 'reverse',
			quantity: 2
		});

		expect(result.trades).toEqual([
			expect.objectContaining({ cardId: 'a', variant: 'reverse', quantity: 2, note: null })
		]);
		expect(result.trades[0].createdAt).toBe(result.trades[0].updatedAt);
	});

	it('setTrade keeps the note it is not given, and the original createdAt', () => {
		const clock = fixedClock();
		const start = makeUserData({ trades: [makeTrade({ cardId: 'a', note: 'played, NM' })] });

		const result = mutate.setTrade(start, clock, { cardId: 'a', variant: 'normal', quantity: 3 });

		expect(result.trades[0]).toEqual(expect.objectContaining({ quantity: 3, note: 'played, NM' }));
		expect(result.trades[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
		expect(result.trades[0].updatedAt > '2026-01-01T00:00:00.000Z').toBe(true);
	});

	it('another finish is a separate entry', () => {
		const clock = fixedClock();
		let data = mutate.setTrade(makeUserData(), clock, { cardId: 'a', variant: 'normal', quantity: 1 });
		data = mutate.setTrade(data, clock, { cardId: 'a', variant: 'reverse', quantity: 1 });

		expect(data.trades.map(tradeKey).sort()).toEqual(['a|normal', 'a|reverse']);
	});

	it('quantity 0 removes the entry and leaves a tombstone; re-adding clears it', () => {
		const clock = fixedClock();
		const gone = mutate.removeTrade(makeUserData({ trades: [makeTrade({ cardId: 'a' })] }), clock, {
			cardId: 'a',
			variant: 'normal'
		});
		expect(gone.trades).toEqual([]);
		expect(tombstone(gone, 'a|normal')).toBeDefined();

		const back = mutate.setTrade(gone, clock, { cardId: 'a', variant: 'normal', quantity: 1 });
		expect(back.trades).toHaveLength(1);
		expect(tombstone(back, 'a|normal')).toBeUndefined();
	});

	it('updateTrade edits an existing entry and ignores unknown ones', () => {
		const clock = fixedClock();
		const start = makeUserData({ trades: [makeTrade({ cardId: 'a', quantity: 2 })] });

		const noted = mutate.updateTrade(start, clock, { cardId: 'a', variant: 'normal' }, { note: 'LP' });
		expect(noted.trades[0]).toEqual(expect.objectContaining({ quantity: 2, note: 'LP' }));

		expect(mutate.updateTrade(start, clock, { cardId: 'a', variant: 'reverse' }, { note: 'LP' })).toBe(start);
	});

	it('restore tombstones entries the backup does not have', () => {
		const clock = fixedClock();
		const start = makeUserData({ trades: [makeTrade({ cardId: 'gone' })] });

		const result = mutate.restore(start, clock, makeUserData({ trades: [makeTrade({ cardId: 'kept' })] }));

		expect(result.trades.map((trade) => trade.cardId)).toEqual(['kept']);
		expect(tombstone(result, 'gone|normal')).toBeDefined();
	});
});

describe('tradeAway', () => {
	const ref = { cardId: 'a', variant: 'normal' as const };

	it('takes the copies out of the lots with the most first and shrinks the entry', () => {
		const clock = fixedClock();
		const start = makeUserData({
			lots: [makeLot({ id: 'big' }), makeLot({ id: 'small' })],
			collection: [
				makeRow({ cardId: 'a', quantity: 1, lotId: 'small' }),
				makeRow({ cardId: 'a', quantity: 3, lotId: 'big' }),
				makeRow({ cardId: 'a', quantity: 2, lotId: null })
			],
			trades: [makeTrade({ cardId: 'a', quantity: 4 })]
		});

		const result = mutate.tradeAway(start, clock, ref, 3);

		const byLot = Object.fromEntries(result.collection.map((row) => [row.lotId ?? 'unsorted', row.quantity]));
		expect(byLot).toEqual({ small: 1, unsorted: 2 });
		expect(tombstone(result, rowKey({ cardId: 'a', variant: 'normal', lotId: 'big' }), 'collection')).toBeDefined();
		expect(result.trades[0].quantity).toBe(1);
	});

	it('spills over into the next lot and drops the entry when everything offered is gone', () => {
		const clock = fixedClock();
		const start = makeUserData({
			lots: [makeLot({ id: 'big' })],
			collection: [
				makeRow({ cardId: 'a', quantity: 3, lotId: 'big' }),
				makeRow({ cardId: 'a', quantity: 2, lotId: null })
			],
			trades: [makeTrade({ cardId: 'a', quantity: 4 })]
		});

		const result = mutate.tradeAway(start, clock, ref, 4);

		expect(result.collection).toEqual([expect.objectContaining({ lotId: null, quantity: 1 })]);
		expect(result.trades).toEqual([]);
		expect(tombstone(result, 'a|normal')).toBeDefined();
	});

	it('takes only from the named lot when one is given', () => {
		const clock = fixedClock();
		const start = makeUserData({
			lots: [makeLot({ id: 'big' })],
			collection: [
				makeRow({ cardId: 'a', quantity: 3, lotId: 'big' }),
				makeRow({ cardId: 'a', quantity: 1, lotId: null })
			],
			trades: [makeTrade({ cardId: 'a', quantity: 2 })]
		});

		const result = mutate.tradeAway(start, clock, ref, 2, null);

		const byLot = Object.fromEntries(result.collection.map((row) => [row.lotId ?? 'unsorted', row.quantity]));
		expect(byLot).toEqual({ big: 3 });
		expect(result.trades).toEqual([]);
	});

	it('never removes more than is owned, but still clears the entry', () => {
		const clock = fixedClock();
		const start = makeUserData({
			collection: [makeRow({ cardId: 'a', quantity: 1 })],
			trades: [makeTrade({ cardId: 'a', quantity: 3 })]
		});

		const result = mutate.tradeAway(start, clock, ref, 3);

		expect(result.collection).toEqual([]);
		expect(result.trades).toEqual([]);
	});

	it('touches other finishes and other cards not at all', () => {
		const clock = fixedClock();
		const start = makeUserData({
			collection: [
				makeRow({ cardId: 'a', quantity: 2 }),
				makeRow({ cardId: 'a', variant: 'reverse', quantity: 2 }),
				makeRow({ cardId: 'b', quantity: 2 })
			],
			trades: [makeTrade({ cardId: 'a', quantity: 1 })]
		});

		const result = mutate.tradeAway(start, clock, ref, 1);

		expect(result.collection.map((row) => `${rowKey(row)}=${row.quantity}`).sort()).toEqual([
			'a|normal|=1',
			'a|reverse|=2',
			'b|normal|=2'
		]);
	});
});

describe('trade binder across devices', () => {
	it('the newer edit wins', () => {
		const mine = makeUserData({
			trades: [makeTrade({ cardId: 'a', quantity: 1, updatedAt: '2026-02-01T00:00:00.000Z' })]
		});
		const theirs = makeUserData({
			trades: [makeTrade({ cardId: 'a', quantity: 4, updatedAt: '2026-03-01T00:00:00.000Z' })]
		});

		expect(merge(mine, theirs).trades[0].quantity).toBe(4);
		expect(merge(theirs, mine).trades[0].quantity).toBe(4);
	});

	it('an entry deleted on one device stays deleted unless edited later', () => {
		const clock = fixedClock('2026-04-01T00:00:00.000Z');
		const deleted = mutate.removeTrade(makeUserData({ trades: [makeTrade({ cardId: 'a' })] }), clock, {
			cardId: 'a',
			variant: 'normal'
		});
		const stale = makeUserData({ trades: [makeTrade({ cardId: 'a', updatedAt: '2026-02-01T00:00:00.000Z' })] });
		const edited = makeUserData({ trades: [makeTrade({ cardId: 'a', updatedAt: '2026-05-01T00:00:00.000Z' })] });

		expect(merge(deleted, stale).trades).toEqual([]);
		expect(merge(deleted, edited).trades).toHaveLength(1);
	});
});

describe('trade binder in stored files', () => {
	it('a file written before the binder existed loads with none', () => {
		expect(migrate({ version: 2, collection: [], decks: [] }).trades).toEqual([]);
	});

	it('junk entries are dropped and bad finishes fall back to normal', () => {
		const result = migrate({
			version: 2,
			trades: [
				{ cardId: 'a', variant: 'shiny', quantity: 2, note: '' },
				{ cardId: 'b', quantity: 0 },
				{ quantity: 3 },
				'nonsense'
			]
		});

		expect(result.trades).toEqual([
			expect.objectContaining({ cardId: 'a', variant: 'normal', quantity: 2, note: null })
		]);
	});

	it('duplicate entries collapse to the later edit', () => {
		const data = makeUserData({
			trades: [
				makeTrade({ cardId: 'a', quantity: 1, updatedAt: '2026-01-01T00:00:00.000Z' }),
				makeTrade({ cardId: 'a', quantity: 5, updatedAt: '2026-02-01T00:00:00.000Z' })
			]
		});

		expect(repair(data, { now: NOW }).trades).toEqual([expect.objectContaining({ quantity: 5 })]);
	});

	it('repair keeps entries whose copies are no longer owned', () => {
		const data = makeUserData({ trades: [makeTrade({ cardId: 'a', quantity: 2 })] });

		expect(repair(data, { now: NOW }).trades).toHaveLength(1);
	});
});

describe('trade binder in the readable export', () => {
	const meg = makeSet({ id: 'me01', name: 'Mega Evolution', ptcglCode: 'MEG' });
	const numel = makeCard({ name: 'Numel', localId: '021', set: meg, id: 'me01-021' });
	const catalogue = makeCatalogue([numel]);

	it('lists spares with how many are owned, and skips the section when empty', () => {
		const data = makeUserData({
			collection: [makeRow({ cardId: 'me01-021', variant: 'reverse', quantity: 3 })],
			trades: [makeTrade({ cardId: 'me01-021', variant: 'reverse', quantity: 2, note: 'NM' })]
		});

		const text = toReadableMarkdown(data, catalogue, { generatedAt: NOW });
		expect(text).toContain('## Trade binder');
		expect(text).toContain('- 2 Numel MEG 021 rh — owns 3 — NM');

		expect(toReadableMarkdown(makeUserData(), catalogue, { generatedAt: NOW })).not.toContain(
			'## Trade binder'
		);
	});
});
