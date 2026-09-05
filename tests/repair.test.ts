import { describe, expect, it } from 'vitest';
import { repair } from '../src/lib/data/repair';
import { makeDeck, makeFolder, makeLot, makeRow, makeUserData } from './data-helpers';

const NOW = '2026-06-01T00:00:00.000Z';

describe('repair', () => {
	it('folds rows of a missing lot into Unsorted and sums duplicates', () => {
		const result = repair(
			makeUserData({
				lots: [makeLot({ id: 'kept' })],
				collection: [
					makeRow({ cardId: 'a', quantity: 2, lotId: 'gone', updatedAt: '2026-03-01T00:00:00.000Z' }),
					makeRow({ cardId: 'a', quantity: 1, lotId: null, updatedAt: '2026-02-01T00:00:00.000Z' }),
					makeRow({ cardId: 'a', quantity: 1, lotId: 'kept' }),
					makeRow({ cardId: 'z', quantity: 0 })
				]
			}),
			{ now: NOW }
		);

		expect(result.collection).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ cardId: 'a', lotId: null, quantity: 3, updatedAt: '2026-03-01T00:00:00.000Z' }),
				expect.objectContaining({ cardId: 'a', lotId: 'kept', quantity: 1 })
			])
		);
		expect(result.collection).toHaveLength(2);
	});

	it('nulls dangling folder and format references and re-roots orphan folders', () => {
		const result = repair(
			makeUserData({
				folders: [makeFolder({ id: 'orphan', parentId: 'missing' })],
				decks: [makeDeck({ id: 'd', folderId: 'missing', formatId: 'missing' })]
			}),
			{ now: NOW }
		);

		expect(result.folders[0].parentId).toBeNull();
		expect(result.decks[0]).toMatchObject({ folderId: null, formatId: null });
	});

	it('breaks a folder cycle by detaching the least recently edited folder', () => {
		const result = repair(
			makeUserData({
				folders: [
					makeFolder({ id: 'a', parentId: 'b', updatedAt: '2026-01-02T00:00:00.000Z' }),
					makeFolder({ id: 'b', parentId: 'a', updatedAt: '2026-01-01T00:00:00.000Z' })
				]
			}),
			{ now: NOW }
		);

		expect(result.folders.find((f) => f.id === 'b')?.parentId).toBeNull();
		expect(result.folders.find((f) => f.id === 'a')?.parentId).toBe('b');
	});

	it('is idempotent', () => {
		const once = repair(
			makeUserData({
				folders: [makeFolder({ id: 'a', parentId: 'b' }), makeFolder({ id: 'b', parentId: 'a' })],
				collection: [makeRow({ cardId: 'x', lotId: 'gone' })]
			}),
			{ now: NOW }
		);
		expect(repair(once, { now: NOW })).toEqual(once);
	});

	it('prunes tombstones older than 90 days once they predate the last sync', () => {
		const old = '2025-01-01T00:00:00.000Z';
		const result = repair(
			makeUserData({
				tombstones: [
					{ kind: 'deck', key: 'old', deletedAt: old },
					{ kind: 'deck', key: 'recent', deletedAt: '2026-05-30T00:00:00.000Z' },
					{ kind: 'deck', key: 'dup', deletedAt: old },
					{ kind: 'deck', key: 'dup', deletedAt: '2026-05-31T00:00:00.000Z' }
				]
			}),
			{ now: NOW, lastSyncedAt: '2026-05-01T00:00:00.000Z' }
		);

		expect(result.tombstones.map((t) => t.key).sort()).toEqual(['dup', 'recent']);
		expect(result.tombstones.find((t) => t.key === 'dup')?.deletedAt).toBe('2026-05-31T00:00:00.000Z');
	});

	it('keeps an old tombstone that this device has not synced since', () => {
		const result = repair(
			makeUserData({ tombstones: [{ kind: 'deck', key: 'old', deletedAt: '2026-01-01T00:00:00.000Z' }] }),
			{ now: NOW, lastSyncedAt: '2025-12-01T00:00:00.000Z' }
		);
		expect(result.tombstones).toHaveLength(1);
	});
});
