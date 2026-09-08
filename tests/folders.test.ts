import { describe, expect, it } from 'vitest';
import {
	canMoveInto,
	childrenOf,
	countDeep,
	flattenTree,
	folderPath,
	isDescendant
} from '../src/lib/data/folders';
import { makeDeck, makeFolder, makeLot } from './data-helpers';

const folders = [
	makeFolder({ id: 'std', name: 'Standard' }),
	makeFolder({ id: 'y26', name: '2026', parentId: 'std' }),
	makeFolder({ id: 'zard', name: 'Charizard builds', parentId: 'y26' }),
	makeFolder({ id: 'exp', name: 'Expanded' })
];

describe('folders', () => {
	it('folderPath walks root to leaf', () => {
		expect(folderPath(folders, 'zard').map((f) => f.id)).toEqual(['std', 'y26', 'zard']);
		expect(folderPath(folders, null)).toEqual([]);
		expect(folderPath(folders, 'nope')).toEqual([]);
	});

	it('childrenOf sorts by name and respects the root', () => {
		expect(childrenOf(folders, null).map((f) => f.id)).toEqual(['exp', 'std']);
		expect(childrenOf(folders, 'std').map((f) => f.id)).toEqual(['y26']);
	});

	it('isDescendant includes the folder itself', () => {
		expect(isDescendant(folders, 'zard', 'std')).toBe(true);
		expect(isDescendant(folders, 'std', 'std')).toBe(true);
		expect(isDescendant(folders, 'exp', 'std')).toBe(false);
		expect(isDescendant(folders, null, 'std')).toBe(false);
	});

	it('countDeep counts items in sub-folders too', () => {
		const decks = [
			makeDeck({ id: 'a', folderId: 'std' }),
			makeDeck({ id: 'b', folderId: 'zard' }),
			makeDeck({ id: 'c', folderId: 'exp' }),
			makeDeck({ id: 'd', folderId: null })
		];
		expect(countDeep(folders, decks, 'std')).toBe(2);
		expect(countDeep(folders, decks, 'exp')).toBe(1);

		// The same helper walks the lot tree.
		const lots = [makeLot({ id: 'p', folderId: 'y26' }), makeLot({ id: 'q', folderId: null })];
		expect(countDeep(folders, lots, 'std')).toBe(1);
	});

	it('flattenTree lists depth-first with depths', () => {
		expect(flattenTree(folders).map((row) => `${row.depth}:${row.folder.id}`)).toEqual([
			'0:exp',
			'0:std',
			'1:y26',
			'2:zard'
		]);
	});

	it('canMoveInto refuses no-op moves and moves into own subtree', () => {
		const deck = { kind: 'item' as const, id: 'd1', parentId: 'std' };
		expect(canMoveInto(folders, deck, 'exp')).toBe(true);
		expect(canMoveInto(folders, deck, null)).toBe(true);
		expect(canMoveInto(folders, deck, 'std')).toBe(false); // already there

		const folder = { kind: 'folder' as const, id: 'std', parentId: null };
		expect(canMoveInto(folders, folder, 'exp')).toBe(true);
		expect(canMoveInto(folders, folder, 'std')).toBe(false); // into itself
		expect(canMoveInto(folders, folder, 'zard')).toBe(false); // into its own subtree
		expect(canMoveInto(folders, folder, null)).toBe(false); // already at the top level

		// A folder from further down can always come back up to the root.
		const nested = { kind: 'folder' as const, id: 'zard', parentId: 'y26' };
		expect(canMoveInto(folders, nested, null)).toBe(true);
		expect(canMoveInto(folders, nested, 'std')).toBe(true);
	});

	it('survives a cycle without looping forever', () => {
		const cyclic = [makeFolder({ id: 'a', parentId: 'b' }), makeFolder({ id: 'b', parentId: 'a' })];
		expect(folderPath(cyclic, 'a').length).toBe(2);
	});
});
