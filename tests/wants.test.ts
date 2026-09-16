import { describe, expect, it } from 'vitest';
import { merge } from '../src/lib/data/merge';
import { migrate } from '../src/lib/data/migrate';
import { copiesToFind, wantKey, wantProgress, type WantEntry } from '../src/lib/data/model';
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

	it('a new want counts the copies still to find, so owning some does not tick it off', () => {
		const clock = fixedClock();

		const result = mutate.setWant(makeUserData(), clock, {
			cardId: 'a',
			variant: 'normal',
			quantity: 1
		});

		expect(result.wants[0].counting).toBe('extra');
		expect(copiesToFind(result.wants[0], 4)).toBe(1);
	});

	it('bumping the quantity keeps how the want counts', () => {
		const clock = fixedClock();
		const start = makeUserData({ wants: [makeWant({ cardId: 'a', counting: 'total' })] });

		const result = mutate.setWant(start, clock, { cardId: 'a', variant: 'normal', quantity: 4 });

		expect(result.wants[0].counting).toBe('total');
	});

	it('updateWant switches a want between counting the copies owned and ignoring them', () => {
		const clock = fixedClock();
		const start = makeUserData({ wants: [makeWant({ cardId: 'a', quantity: 4, counting: 'extra' })] });

		const result = mutate.updateWant(start, clock, { cardId: 'a', variant: 'normal' }, { counting: 'total' });

		expect(result.wants[0].counting).toBe('total');
		expect(copiesToFind(result.wants[0], 3)).toBe(1);
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

describe('sharing the copies owned between lists', () => {
	const owning = (copies: Record<string, number>) => (cardId: string, variant: string) =>
		copies[`${cardId}|${variant}`] ?? 0;
	const missingOf = (wants: WantEntry[], ownedOf: ReturnType<typeof owning>) =>
		Object.fromEntries(
			[...wantProgress(wants, ownedOf)].map(([key, { missing }]) => [key, missing])
		);

	it('one copy owned ticks off one list, not every list wanting the card', () => {
		const wants = [
			makeWant({ cardId: 'a', counting: 'total' }),
			makeWant({ cardId: 'a', counting: 'total', listId: 'deck' })
		];

		const progress = wantProgress(wants, owning({ 'a|normal': 1 }));

		expect(progress.get('a|normal|')).toEqual({ owned: 1, counted: 1, missing: 0 });
		expect(progress.get('a|normal|deck')).toEqual({ owned: 1, counted: 0, missing: 1 });
	});

	it('the copies go to the most wanted first, then to the want that has waited longest', () => {
		const wants = [
			makeWant({ cardId: 'a', counting: 'total', priority: 'low', createdAt: '2026-01-01T00:00:00.000Z' }),
			makeWant({ cardId: 'a', counting: 'total', listId: 'old', createdAt: '2026-02-01T00:00:00.000Z' }),
			makeWant({ cardId: 'a', counting: 'total', listId: 'new', createdAt: '2026-03-01T00:00:00.000Z' }),
			makeWant({ cardId: 'a', counting: 'total', listId: 'urgent', priority: 'high' })
		];

		expect(missingOf(wants, owning({ 'a|normal': 2 }))).toEqual({
			'a|normal|urgent': 0,
			'a|normal|old': 0,
			'a|normal|new': 1,
			'a|normal|': 1
		});
	});

	it('a want for more copies takes none, leaving them to the wants counting copies owned', () => {
		const wants = [
			makeWant({ cardId: 'a', counting: 'extra', quantity: 2 }),
			makeWant({ cardId: 'a', counting: 'total', quantity: 2, listId: 'binder', priority: 'low' })
		];

		const progress = wantProgress(wants, owning({ 'a|normal': 1 }));

		expect(progress.get('a|normal|')).toEqual({ owned: 1, counted: 0, missing: 2 });
		expect(progress.get('a|normal|binder')).toEqual({ owned: 1, counted: 1, missing: 1 });
	});

	it('a want never counts more than it asked for, so the surplus reaches the next list', () => {
		const wants = [
			makeWant({ cardId: 'a', counting: 'total', quantity: 1 }),
			makeWant({ cardId: 'a', counting: 'total', quantity: 4, listId: 'playset', priority: 'low' })
		];

		expect(missingOf(wants, owning({ 'a|normal': 3 }))).toEqual({
			'a|normal|': 0,
			'a|normal|playset': 2
		});
	});

	it('another finish, or another card, is its own pool of copies', () => {
		const wants = [
			makeWant({ cardId: 'a', counting: 'total' }),
			makeWant({ cardId: 'a', variant: 'reverse', counting: 'total', listId: 'shiny' }),
			makeWant({ cardId: 'b', counting: 'total', listId: 'shiny' })
		];

		expect(missingOf(wants, owning({ 'a|normal': 1, 'b|normal': 1 }))).toEqual({
			'a|normal|': 0,
			'a|reverse|shiny': 1,
			'b|normal|shiny': 0
		});
	});

	it('the answer is the same whichever list is being looked at', () => {
		const wants = [
			makeWant({ cardId: 'a', counting: 'total' }),
			makeWant({ cardId: 'a', counting: 'total', listId: 'deck' })
		];
		const all = wantProgress(wants, owning({ 'a|normal': 1 }));

		// Looking at the deck list alone must not hand it the copy the Main list already counts.
		expect(all.get('a|normal|deck')!.missing).toBe(1);
		expect(wantProgress([wants[1]], owning({ 'a|normal': 1 })).get('a|normal|deck')!.missing).toBe(0);
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
			expect.objectContaining({ listId: 'trades', quantity: 2, note: 'nice copy', counting: 'extra' })
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

	it('a want written before the counting choice existed still counts the copies owned', () => {
		const result = migrate({
			version: 2,
			wants: [{ cardId: 'a', quantity: 4, priority: 'high' }]
		});

		expect(result.wants[0].counting).toBe('total');
		expect(copiesToFind(result.wants[0], 3)).toBe(1);
	});

	it('a nonsense counting falls back to counting the copies owned', () => {
		const result = migrate({ version: 2, wants: [{ cardId: 'a', quantity: 1, counting: 'both' }] });

		expect(result.wants[0].counting).toBe('total');
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
