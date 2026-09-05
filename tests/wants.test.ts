import { describe, expect, it } from 'vitest';
import { merge } from '../src/lib/data/merge';
import { migrate } from '../src/lib/data/migrate';
import { wantKey } from '../src/lib/data/model';
import * as mutate from '../src/lib/data/mutations';
import { repair } from '../src/lib/data/repair';
import { fixedClock, makeUserData, makeWant, makeWantList } from './data-helpers';

const NOW = '2026-06-01T00:00:00.000Z';

const tombstone = (
	data: { tombstones: { kind: string; key: string }[] },
	key: string,
	kind = 'want'
) => data.tombstones.find((t) => t.kind === kind && t.key === key);

describe('want mutations', () => {
	it('setWant creates a want with defaults and stamps it', () => {
		const clock = fixedClock();

		const result = mutate.setWant(makeUserData(), clock, {
			cardId: 'a',
			variant: 'reverse',
			quantity: 2
		});

		expect(result.wants).toEqual([
			expect.objectContaining({
				cardId: 'a',
				variant: 'reverse',
				quantity: 2,
				listId: null,
				priority: 'normal',
				note: null
			})
		]);
		expect(result.wants[0].createdAt).toBe(result.wants[0].updatedAt);
	});

	it('setWant keeps fields it is not given, and the original createdAt', () => {
		const clock = fixedClock();
		const start = makeUserData({
			wants: [makeWant({ cardId: 'a', quantity: 1, priority: 'high', note: 'for the Zard deck' })]
		});

		const result = mutate.setWant(start, clock, { cardId: 'a', variant: 'normal', quantity: 4 });

		expect(result.wants[0]).toEqual(
			expect.objectContaining({ quantity: 4, priority: 'high', note: 'for the Zard deck' })
		);
		expect(result.wants[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
		expect(result.wants[0].updatedAt > '2026-01-01T00:00:00.000Z').toBe(true);
	});

	it('another finish, or another list, is a separate want', () => {
		const clock = fixedClock();
		let data = mutate.setWant(makeUserData(), clock, { cardId: 'a', variant: 'normal', quantity: 1 });
		data = mutate.setWant(data, clock, { cardId: 'a', variant: 'reverse', quantity: 1 });
		data = mutate.setWant(data, clock, {
			cardId: 'a',
			variant: 'normal',
			quantity: 3,
			listId: 'trades'
		});

		expect(data.wants.map(wantKey).sort()).toEqual(['a|normal|', 'a|normal|trades', 'a|reverse|']);
	});

	it('quantity 0 removes the want and leaves a tombstone', () => {
		const clock = fixedClock();
		const start = makeUserData({ wants: [makeWant({ cardId: 'a' })] });

		const result = mutate.removeWant(start, clock, { cardId: 'a', variant: 'normal' });

		expect(result.wants).toEqual([]);
		expect(tombstone(result, 'a|normal|')).toBeDefined();
	});

	it('re-adding a want clears its tombstone', () => {
		const clock = fixedClock();
		const gone = mutate.removeWant(makeUserData({ wants: [makeWant({ cardId: 'a' })] }), clock, {
			cardId: 'a',
			variant: 'normal'
		});

		const back = mutate.setWant(gone, clock, { cardId: 'a', variant: 'normal', quantity: 1 });

		expect(back.wants).toHaveLength(1);
		expect(tombstone(back, 'a|normal|')).toBeUndefined();
	});

	it('updateWant edits an existing want and ignores unknown ones', () => {
		const clock = fixedClock();
		const start = makeUserData({ wants: [makeWant({ cardId: 'a', note: 'keep me' })] });

		const bumped = mutate.updateWant(start, clock, { cardId: 'a', variant: 'normal' }, { priority: 'high' });
		expect(bumped.wants[0]).toEqual(expect.objectContaining({ priority: 'high', note: 'keep me' }));

		// Right card, wrong list: not the same want.
		expect(
			mutate.updateWant(start, clock, { cardId: 'a', variant: 'normal', listId: 'trades' }, { priority: 'low' })
		).toBe(start);
	});

	it('updateWant to zero removes the want', () => {
		const clock = fixedClock();
		const start = makeUserData({ wants: [makeWant({ cardId: 'a' })] });

		const result = mutate.updateWant(start, clock, { cardId: 'a', variant: 'normal' }, { quantity: 0 });

		expect(result.wants).toEqual([]);
		expect(tombstone(result, 'a|normal|')).toBeDefined();
	});

	it('restore tombstones wants the backup does not have', () => {
		const clock = fixedClock();
		const start = makeUserData({ wants: [makeWant({ cardId: 'gone' })] });

		const result = mutate.restore(start, clock, makeUserData({ wants: [makeWant({ cardId: 'kept' })] }));

		expect(result.wants.map((want) => want.cardId)).toEqual(['kept']);
		expect(tombstone(result, 'gone|normal|')).toBeDefined();
	});
});

describe('wants lists', () => {
	it('moving a want re-keys it, tombstoning where it was', () => {
		const clock = fixedClock();
		const start = makeUserData({
			wantLists: [makeWantList({ id: 'trades' })],
			wants: [makeWant({ cardId: 'a', quantity: 2, note: 'nice copy' })]
		});

		const result = mutate.moveWant(start, clock, { cardId: 'a', variant: 'normal' }, 'trades');

		expect(result.wants).toEqual([
			expect.objectContaining({ listId: 'trades', quantity: 2, note: 'nice copy' })
		]);
		expect(tombstone(result, 'a|normal|')).toBeDefined();
		expect(tombstone(result, 'a|normal|trades')).toBeUndefined();
	});

	it('moving onto a list that already wants the card keeps the larger quantity', () => {
		const clock = fixedClock();
		const start = makeUserData({
			wantLists: [makeWantList({ id: 'trades' })],
			wants: [
				makeWant({ cardId: 'a', quantity: 4 }),
				makeWant({ cardId: 'a', quantity: 1, listId: 'trades' })
			]
		});

		const result = mutate.moveWant(start, clock, { cardId: 'a', variant: 'normal' }, 'trades');

		expect(result.wants).toEqual([expect.objectContaining({ listId: 'trades', quantity: 4 })]);
	});

	it('deleting a list can keep its wants, which repair folds onto the default list', () => {
		const clock = fixedClock();
		const start = makeUserData({
			wantLists: [makeWantList({ id: 'trades' })],
			wants: [makeWant({ cardId: 'a', listId: 'trades' })]
		});

		const deleted = mutate.deleteWantList(start, clock, 'trades', 'default');
		expect(tombstone(deleted, 'trades', 'wantList')).toBeDefined();

		const repaired = repair(deleted, { now: NOW });
		expect(repaired.wants).toEqual([expect.objectContaining({ cardId: 'a', listId: null })]);
	});

	it('deleting a list can take its wants with it', () => {
		const clock = fixedClock();
		const start = makeUserData({
			wantLists: [makeWantList({ id: 'trades' })],
			wants: [makeWant({ cardId: 'a', listId: 'trades' }), makeWant({ cardId: 'b' })]
		});

		const result = mutate.deleteWantList(start, clock, 'trades', 'remove');

		expect(result.wants.map((want) => want.cardId)).toEqual(['b']);
		expect(tombstone(result, 'a|normal|trades')).toBeDefined();
	});

	it('a list renamed on one device and deleted on the other stays deleted', () => {
		const clock = fixedClock('2026-04-01T00:00:00.000Z');
		const start = makeUserData({ wantLists: [makeWantList({ id: 'trades' })] });
		const deleted = mutate.deleteWantList(start, clock, 'trades', 'default');
		const renamed = makeUserData({
			wantLists: [makeWantList({ id: 'trades', name: 'Trade night', updatedAt: '2026-02-01T00:00:00.000Z' })]
		});

		expect(merge(deleted, renamed).wantLists).toEqual([]);
	});
});

describe('wants across devices', () => {
	it('the newer edit wins', () => {
		const mine = makeUserData({
			wants: [makeWant({ cardId: 'a', quantity: 1, updatedAt: '2026-02-01T00:00:00.000Z' })]
		});
		const theirs = makeUserData({
			wants: [makeWant({ cardId: 'a', quantity: 4, updatedAt: '2026-03-01T00:00:00.000Z' })]
		});

		expect(merge(mine, theirs).wants[0].quantity).toBe(4);
		expect(merge(theirs, mine).wants[0].quantity).toBe(4);
	});

	it('a want deleted on one device stays deleted unless edited later', () => {
		const clock = fixedClock('2026-04-01T00:00:00.000Z');
		const deleted = mutate.removeWant(makeUserData({ wants: [makeWant({ cardId: 'a' })] }), clock, {
			cardId: 'a',
			variant: 'normal'
		});
		const stale = makeUserData({ wants: [makeWant({ cardId: 'a', updatedAt: '2026-02-01T00:00:00.000Z' })] });
		const edited = makeUserData({ wants: [makeWant({ cardId: 'a', updatedAt: '2026-05-01T00:00:00.000Z' })] });

		expect(merge(deleted, stale).wants).toEqual([]);
		expect(merge(deleted, edited).wants).toHaveLength(1);
	});
});

describe('wants in stored files', () => {
	it('a file written before wants existed loads with none', () => {
		const result = migrate({ version: 2, collection: [], decks: [] });
		expect(result.wants).toEqual([]);
		expect(result.wantLists).toEqual([]);
	});

	it('junk wants are dropped and bad priorities fall back to normal', () => {
		const result = migrate({
			version: 2,
			wants: [
				{ cardId: 'a', variant: 'reverse', quantity: 2, priority: 'urgent' },
				{ cardId: 'b', quantity: 0 },
				{ quantity: 3 },
				'nonsense'
			]
		});

		expect(result.wants).toEqual([
			expect.objectContaining({ cardId: 'a', variant: 'reverse', quantity: 2, priority: 'normal' })
		]);
	});

	it('duplicate wants collapse to the later edit', () => {
		const data = makeUserData({
			wants: [
				makeWant({ cardId: 'a', quantity: 1, updatedAt: '2026-01-01T00:00:00.000Z' }),
				makeWant({ cardId: 'a', quantity: 5, updatedAt: '2026-02-01T00:00:00.000Z' })
			]
		});

		expect(repair(data, { now: NOW }).wants).toEqual([expect.objectContaining({ quantity: 5 })]);
	});

	it('repair keeps wants for cards the owner already has', () => {
		const data = makeUserData({ wants: [makeWant({ cardId: 'a', quantity: 2 })] });

		expect(repair(data, { now: NOW }).wants).toHaveLength(1);
	});
});
