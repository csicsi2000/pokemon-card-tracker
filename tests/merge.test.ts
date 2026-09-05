import { describe, expect, it } from 'vitest';
import { merge, sameData } from '../src/lib/data/merge';
import { SENTINEL } from '../src/lib/data/model';
import * as mutate from '../src/lib/data/mutations';
import { repair } from '../src/lib/data/repair';
import { fixedClock, makeDeck, makeFolder, makeLot, makeRow, makeUserData } from './data-helpers';

const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-01-02T00:00:00.000Z';
const T3 = '2026-01-03T00:00:00.000Z';

describe('merge', () => {
	it('is commutative and idempotent', () => {
		const a = makeUserData({
			collection: [makeRow({ cardId: 'x', quantity: 1, updatedAt: T1 })],
			decks: [makeDeck({ id: 'd', name: 'A', updatedAt: T2 })]
		});
		const b = makeUserData({
			collection: [makeRow({ cardId: 'x', quantity: 4, updatedAt: T2 }), makeRow({ cardId: 'y', updatedAt: T1 })],
			decks: [makeDeck({ id: 'd', name: 'B', updatedAt: T1 })],
			tombstones: [{ kind: 'lot', key: 'l', deletedAt: T1 }]
		});

		const ab = merge(a, b);
		const ba = merge(b, a);
		expect(sameData(ab, ba)).toBe(true);
		expect(sameData(merge(a, a), a)).toBe(true);
		expect(sameData(merge(ab, b), ab)).toBe(true);
	});

	it('takes the newer version of a record edited on both sides', () => {
		const a = makeUserData({ decks: [makeDeck({ id: 'd', name: 'newer', cards: [{ cardId: 'c', quantity: 4 }], updatedAt: T2 })] });
		const b = makeUserData({ decks: [makeDeck({ id: 'd', name: 'older', updatedAt: T1 })] });

		const result = merge(a, b);
		expect(result.decks).toEqual([expect.objectContaining({ name: 'newer', cards: [{ cardId: 'c', quantity: 4 }] })]);
	});

	it('a tombstone beats an older record but loses to a newer edit', () => {
		const deleted = makeUserData({ tombstones: [{ kind: 'deck', key: 'd', deletedAt: T2 }] });
		const stale = makeUserData({ decks: [makeDeck({ id: 'd', updatedAt: T1 })] });
		const fresh = makeUserData({ decks: [makeDeck({ id: 'd', updatedAt: T3 })] });

		expect(merge(deleted, stale).decks).toEqual([]);
		expect(merge(deleted, fresh).decks).toHaveLength(1);
		expect(merge(deleted, fresh).tombstones).toHaveLength(1);
	});

	it('takes the larger count when both sides still carry migrated (sentinel) rows', () => {
		const a = makeUserData({ collection: [makeRow({ cardId: 'x', quantity: 2, updatedAt: SENTINEL })] });
		const b = makeUserData({ collection: [makeRow({ cardId: 'x', quantity: 5, updatedAt: SENTINEL })] });

		expect(merge(a, b).collection[0].quantity).toBe(5);
		expect(merge(b, a).collection[0].quantity).toBe(5);
	});

	it('a real edit beats a sentinel row', () => {
		const a = makeUserData({ collection: [makeRow({ cardId: 'x', quantity: 9, updatedAt: SENTINEL })] });
		const b = makeUserData({ collection: [makeRow({ cardId: 'x', quantity: 1, updatedAt: T1 })] });
		expect(merge(a, b).collection[0].quantity).toBe(1);
	});

	it('breaks exact-timestamp ties the same way regardless of order', () => {
		const a = makeUserData({ decks: [makeDeck({ id: 'd', name: 'Alpha', updatedAt: T1 })] });
		const b = makeUserData({ decks: [makeDeck({ id: 'd', name: 'Beta', updatedAt: T1 })] });
		expect(merge(a, b).decks[0].name).toBe(merge(b, a).decks[0].name);
	});

	it('lot deleted on A while B added cards to it: cards survive, folded into Unsorted', () => {
		const clockA = fixedClock('2026-02-01T00:00:00.000Z');
		const clockB = fixedClock('2026-02-01T00:00:10.000Z');
		const shared = makeUserData({
			lots: [makeLot({ id: 'lot1', updatedAt: T1 })],
			collection: [makeRow({ cardId: 'a', quantity: 1, lotId: 'lot1', updatedAt: T1 })]
		});

		const deviceA = mutate.deleteLot(shared, clockA, 'lot1', 'unsorted');
		const deviceB = mutate.setOwned(shared, clockB, 'b', 'normal', 2, 'lot1');

		const merged = repair(merge(deviceA, deviceB), { now: '2026-03-01T00:00:00.000Z' });
		expect(merged.lots).toEqual([]);
		expect(merged.collection).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ cardId: 'a', lotId: null, quantity: 1 }),
				expect.objectContaining({ cardId: 'b', lotId: null, quantity: 2 })
			])
		);
	});

	it('folder cycle from concurrent moves is broken after repair', () => {
		const a = makeUserData({
			folders: [makeFolder({ id: 'f1', parentId: 'f2', updatedAt: T2 }), makeFolder({ id: 'f2', updatedAt: T1 })]
		});
		const b = makeUserData({
			folders: [makeFolder({ id: 'f1', updatedAt: T1 }), makeFolder({ id: 'f2', parentId: 'f1', updatedAt: T3 })]
		});

		const merged = repair(merge(a, b), { now: '2026-03-01T00:00:00.000Z' });
		const parents = Object.fromEntries(merged.folders.map((f) => [f.id, f.parentId]));
		// f2 (edited at T3) keeps its move under f1; f1 (T2) is the one detached.
		expect(parents).toEqual({ f1: null, f2: 'f1' });
	});

	it('restore on one device removes records on the other after merge', () => {
		const clock = fixedClock('2026-02-01T00:00:00.000Z');
		const shared = makeUserData({
			decks: [makeDeck({ id: 'keep', updatedAt: T1 }), makeDeck({ id: 'drop', updatedAt: T1 })]
		});
		const restored = mutate.restore(shared, clock, makeUserData({ decks: [makeDeck({ id: 'keep' })] }));

		const merged = merge(restored, shared);
		expect(merged.decks.map((d) => d.id)).toEqual(['keep']);
	});
});
