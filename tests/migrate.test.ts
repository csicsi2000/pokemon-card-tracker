import { describe, expect, it } from 'vitest';
import { migrate } from '../src/lib/data/migrate';
import { SENTINEL } from '../src/lib/data/model';

describe('migrate', () => {
	it('upgrades a v1 payload: rows go to Unsorted with the sentinel timestamp', () => {
		const result = migrate({
			version: 1,
			collection: [{ cardId: 'sv03-125', variant: 'holo', quantity: 2 }],
			decks: [
				{
					id: 'd1',
					name: 'Zard',
					description: null,
					formatId: null,
					cards: [{ cardId: 'sv03-125', quantity: 2 }],
					createdAt: '2025-01-01T00:00:00.000Z',
					updatedAt: '2025-06-01T00:00:00.000Z'
				}
			],
			formats: []
		});

		expect(result.version).toBe(2);
		expect(result.collection).toEqual([
			{ cardId: 'sv03-125', variant: 'holo', quantity: 2, lotId: null, updatedAt: SENTINEL }
		]);
		expect(result.decks[0]).toMatchObject({ id: 'd1', folderId: null, updatedAt: '2025-06-01T00:00:00.000Z' });
		expect(result.lots).toEqual([]);
		expect(result.folders).toEqual([]);
		// Files written before lot folders existed have no tree at all.
		expect(result.lotFolders).toEqual([]);
		expect(result.tombstones).toEqual([]);
	});

	it('passes a v2 payload through, filling any missing fields', () => {
		const result = migrate({
			version: 2,
			collection: [
				{ cardId: 'me01-021', variant: 'normal', quantity: 1, lotId: 'lot1', updatedAt: '2026-02-01T00:00:00.000Z' }
			],
			lots: [{ id: 'lot1', name: 'july.2 lot', folderId: 'lf1', color: 'teal', icon: '🔥 hot' }],
			lotFolders: [{ id: 'lf1', name: 'eBay', color: 'not-a-colour' }],
			folders: [{ id: 'f1', name: 'Standard', parentId: null, description: 'Rotation-legal decks' }],
			decks: [],
			tombstones: [{ kind: 'deck', key: 'd9', deletedAt: '2026-02-02T00:00:00.000Z' }]
		});

		expect(result.collection[0].lotId).toBe('lot1');
		// The icon is cut to one character; a colour outside the palette drops to none.
		expect(result.lots[0]).toMatchObject({ id: 'lot1', name: 'july.2 lot', note: null, acquiredOn: null, folderId: 'lf1', color: 'teal', icon: '🔥' });
		// Folders written before descriptions and looks existed come through with none.
		expect(result.lotFolders[0]).toMatchObject({ id: 'lf1', name: 'eBay', parentId: null, description: null, color: null, icon: null });
		expect(result.folders[0]).toMatchObject({ parentId: null, description: 'Rotation-legal decks' });
		expect(result.formats).toEqual([]);
		expect(result.tombstones).toHaveLength(1);
	});

	it('drops malformed rows and sums duplicates', () => {
		const result = migrate({
			collection: [
				{ cardId: 'a', variant: 'normal', quantity: 1 },
				{ cardId: 'a', variant: 'normal', quantity: 2 },
				{ cardId: 'b', variant: 'bogus', quantity: 'three' },
				{ variant: 'normal', quantity: 1 },
				null,
				{ cardId: 'c', variant: 'normal', quantity: 0 }
			],
			decks: [{ name: 'no id' }, 'junk'],
			tombstones: [{ kind: 'nonsense', key: 'x' }]
		});

		expect(result.collection).toEqual([
			expect.objectContaining({ cardId: 'a', quantity: 3 })
		]);
		expect(result.decks).toEqual([]);
		expect(result.tombstones).toEqual([]);
	});

	it('returns an empty payload for junk input', () => {
		expect(migrate(null).collection).toEqual([]);
		expect(migrate('hello').decks).toEqual([]);
		expect(migrate(42).version).toBe(2);
	});
});
