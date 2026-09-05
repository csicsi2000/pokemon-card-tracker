import { describe, expect, it } from 'vitest';
import * as mutate from '../src/lib/data/mutations';
import { rowKey } from '../src/lib/data/model';
import { repair } from '../src/lib/data/repair';
import { fixedClock, makeDeck, makeFolder, makeLot, makeRow, makeUserData } from './data-helpers';

const tombstone = (data: { tombstones: { kind: string; key: string }[] }, kind: string, key: string) =>
	data.tombstones.find((t) => t.kind === kind && t.key === key);

describe('collection mutations', () => {
	it('setOwned to zero removes the row and leaves a tombstone', () => {
		const clock = fixedClock();
		const start = makeUserData({ collection: [makeRow({ cardId: 'a', quantity: 2 })] });

		const result = mutate.setOwned(start, clock, 'a', 'normal', 0);

		expect(result.collection).toEqual([]);
		expect(tombstone(result, 'collection', 'a|normal|')).toBeDefined();
	});

	it('re-adding a row clears its tombstone and stamps it', () => {
		const clock = fixedClock();
		const gone = mutate.setOwned(makeUserData({ collection: [makeRow({ cardId: 'a' })] }), clock, 'a', 'normal', 0);
		const back = mutate.setOwned(gone, clock, 'a', 'normal', 3);

		expect(back.collection).toEqual([expect.objectContaining({ cardId: 'a', quantity: 3, lotId: null })]);
		expect(back.collection[0].updatedAt > '2026-01-01T00:00:00.000Z').toBe(true);
		expect(tombstone(back, 'collection', 'a|normal|')).toBeUndefined();
	});

	it('rows in different lots are different rows', () => {
		const clock = fixedClock();
		let data = mutate.setOwned(makeUserData(), clock, 'a', 'normal', 1, null);
		data = mutate.setOwned(data, clock, 'a', 'normal', 2, 'lot1');

		expect(data.collection).toHaveLength(2);
		expect(data.collection.map(rowKey).sort()).toEqual(['a|normal|', 'a|normal|lot1']);
	});

	it('addOwned adds or replaces and tombstones rows that reach zero', () => {
		const clock = fixedClock();
		const start = makeUserData({ collection: [makeRow({ cardId: 'a', quantity: 2 })] });

		const added = mutate.addOwned(start, clock, [{ cardId: 'a', variant: 'normal', quantity: 3, lotId: null }], 'add');
		expect(added.collection[0].quantity).toBe(5);

		const replaced = mutate.addOwned(start, clock, [{ cardId: 'a', variant: 'normal', quantity: 0, lotId: null }], 'replace');
		expect(replaced.collection).toEqual([]);
		expect(tombstone(replaced, 'collection', 'a|normal|')).toBeDefined();
	});

	it('moveOwned re-keys copies into another lot, tombstoning an emptied source', () => {
		const clock = fixedClock();
		const start = makeUserData({ collection: [makeRow({ cardId: 'a', quantity: 2, lotId: 'lot1' })] });

		const partial = mutate.moveOwned(start, clock, 'a|normal|lot1', null, 1);
		expect(partial.collection).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ lotId: 'lot1', quantity: 1 }),
				expect.objectContaining({ lotId: null, quantity: 1 })
			])
		);
		expect(tombstone(partial, 'collection', 'a|normal|lot1')).toBeUndefined();

		const all = mutate.moveOwned(start, clock, 'a|normal|lot1', 'lot2', 5);
		expect(all.collection).toEqual([expect.objectContaining({ lotId: 'lot2', quantity: 2 })]);
		expect(tombstone(all, 'collection', 'a|normal|lot1')).toBeDefined();
	});
});

describe('lot mutations', () => {
	it('deleteLot with "unsorted" only tombstones the lot; repair folds the cards', () => {
		const clock = fixedClock();
		const start = makeUserData({
			lots: [makeLot({ id: 'lot1' })],
			collection: [
				makeRow({ cardId: 'a', quantity: 2, lotId: 'lot1' }),
				makeRow({ cardId: 'a', quantity: 1, lotId: null })
			]
		});

		const deleted = mutate.deleteLot(start, clock, 'lot1', 'unsorted');
		expect(deleted.lots).toEqual([]);
		expect(tombstone(deleted, 'lot', 'lot1')).toBeDefined();
		expect(deleted.collection).toHaveLength(2);

		const repaired = repair(deleted, { now: clock.next() });
		expect(repaired.collection).toEqual([expect.objectContaining({ cardId: 'a', lotId: null, quantity: 3 })]);
	});

	it('deleteLot with "remove" tombstones every row in it', () => {
		const clock = fixedClock();
		const start = makeUserData({
			lots: [makeLot({ id: 'lot1' })],
			collection: [makeRow({ cardId: 'a', lotId: 'lot1' }), makeRow({ cardId: 'b', lotId: null })]
		});

		const result = mutate.deleteLot(start, clock, 'lot1', 'remove');
		expect(result.collection).toEqual([expect.objectContaining({ cardId: 'b' })]);
		expect(tombstone(result, 'collection', 'a|normal|lot1')).toBeDefined();
	});
});

describe('lot folder mutations', () => {
	it('createLot files the lot in the folder it was given', () => {
		const clock = fixedClock();
		const { data, folder } = mutate.createLotFolder(makeUserData(), clock, '2026', null);
		const created = mutate.createLot(data, clock, { name: 'july.2 lot', folderId: folder.id });

		expect(created.lot.folderId).toBe(folder.id);
	});

	it('updateLot moves a lot between folders and stamps it', () => {
		const clock = fixedClock();
		const start = makeUserData({
			lots: [makeLot({ id: 'lot1' })],
			lotFolders: [makeFolder({ id: 'ebay' })]
		});

		const moved = mutate.updateLot(start, clock, 'lot1', { folderId: 'ebay' });

		expect(moved.lots[0].folderId).toBe('ebay');
		expect(moved.lots[0].updatedAt > '2026-01-01T00:00:00.000Z').toBe(true);
	});

	it('deleteLotFolder moves sub-folders and lots up to the parent', () => {
		const clock = fixedClock();
		const start = makeUserData({
			lotFolders: [
				makeFolder({ id: 'root' }),
				makeFolder({ id: 'mid', parentId: 'root' }),
				makeFolder({ id: 'leaf', parentId: 'mid' })
			],
			lots: [makeLot({ id: 'lot1', folderId: 'mid' }), makeLot({ id: 'lot2', folderId: 'root' })]
		});

		const result = mutate.deleteLotFolder(start, clock, 'mid');

		expect(result.lotFolders.map((f) => f.id).sort()).toEqual(['leaf', 'root']);
		expect(result.lotFolders.find((f) => f.id === 'leaf')?.parentId).toBe('root');
		expect(result.lots.find((lot) => lot.id === 'lot1')?.folderId).toBe('root');
		expect(result.lots.find((lot) => lot.id === 'lot2')?.folderId).toBe('root');
		expect(tombstone(result, 'lotFolder', 'mid')).toBeDefined();
	});

	it('a lot folder cannot be moved into itself or a descendant', () => {
		const clock = fixedClock();
		const start = makeUserData({
			lotFolders: [makeFolder({ id: 'a' }), makeFolder({ id: 'b', parentId: 'a' })]
		});

		expect(mutate.updateLotFolder(start, clock, 'a', { parentId: 'b' })).toBe(start);
		expect(mutate.updateLotFolder(start, clock, 'a', { parentId: 'a' })).toBe(start);
		expect(mutate.updateLotFolder(start, clock, 'b', { parentId: null }).lotFolders[1].parentId).toBeNull();
	});

	it('the deck tree and the lot tree are separate', () => {
		const clock = fixedClock();
		const { data } = mutate.createLotFolder(makeUserData(), clock, 'eBay', null);

		expect(data.folders).toEqual([]);
		expect(data.lotFolders).toHaveLength(1);
	});
});

describe('folder and deck mutations', () => {
	it('deleteFolder moves children and decks to the parent', () => {
		const clock = fixedClock();
		const start = makeUserData({
			folders: [
				makeFolder({ id: 'root' }),
				makeFolder({ id: 'mid', parentId: 'root' }),
				makeFolder({ id: 'leaf', parentId: 'mid' })
			],
			decks: [makeDeck({ id: 'd1', folderId: 'mid' })]
		});

		const result = mutate.deleteFolder(start, clock, 'mid');
		expect(result.folders.find((f) => f.id === 'leaf')?.parentId).toBe('root');
		expect(result.decks[0].folderId).toBe('root');
		expect(result.decks[0].updatedAt > start.decks[0].updatedAt).toBe(true);
		expect(tombstone(result, 'folder', 'mid')).toBeDefined();
	});

	it('refuses to move a folder into its own subtree', () => {
		const clock = fixedClock();
		const start = makeUserData({
			folders: [makeFolder({ id: 'a' }), makeFolder({ id: 'b', parentId: 'a' })]
		});

		expect(mutate.updateFolder(start, clock, 'a', { parentId: 'b' })).toBe(start);
		expect(mutate.updateFolder(start, clock, 'a', { parentId: 'a' })).toBe(start);
		expect(mutate.updateFolder(start, clock, 'b', { parentId: null }).folders[1].parentId).toBeNull();
	});

	it('deleteFormat stamps the decks it detaches', () => {
		const clock = fixedClock();
		const { data: withFormat, format } = mutate.createFormat(makeUserData(), clock, {
			name: 'Cube',
			description: null,
			rules: {}
		});
		const withDeck = mutate.createDeck(withFormat, clock, { name: 'D', formatId: format.id }).data;

		const result = mutate.deleteFormat(withDeck, clock, format.id);
		expect(result.decks[0].formatId).toBeNull();
		expect(result.decks[0].updatedAt > withDeck.decks[0].updatedAt).toBe(true);
		expect(tombstone(result, 'format', format.id)).toBeDefined();
	});
});

describe('restore and clear', () => {
	it('restore stamps incoming records and tombstones what the file lacks', () => {
		const clock = fixedClock();
		const current = makeUserData({
			collection: [makeRow({ cardId: 'old' })],
			decks: [makeDeck({ id: 'oldDeck' })]
		});
		const incoming = makeUserData({ collection: [makeRow({ cardId: 'new' })] });

		const result = mutate.restore(current, clock, incoming);
		expect(result.collection).toEqual([expect.objectContaining({ cardId: 'new' })]);
		expect(result.collection[0].updatedAt > incoming.collection[0].updatedAt).toBe(true);
		expect(tombstone(result, 'collection', 'old|normal|')).toBeDefined();
		expect(tombstone(result, 'deck', 'oldDeck')).toBeDefined();
	});

	it('clear leaves only tombstones', () => {
		const clock = fixedClock();
		const result = mutate.clear(
			makeUserData({ lots: [makeLot({ id: 'l' })], decks: [makeDeck({ id: 'd' })] }),
			clock
		);
		expect(result.lots).toEqual([]);
		expect(result.decks).toEqual([]);
		expect(result.tombstones.map((t) => t.key).sort()).toEqual(['d', 'l']);
	});
});
