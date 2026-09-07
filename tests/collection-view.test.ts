import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SORT_DIRECTION,
	rarityRank,
	sortRows,
	type SortableRow
} from '../src/lib/tcg/collection-view';
import { makeCard, makeSet } from './helpers';

const meg = makeSet({ id: 'me01', name: 'Mega Evolution', ptcglCode: 'MEG', releaseDate: '2025-09-26' });
const pal = makeSet({ id: 'sv02', name: 'Paldea Evolved', ptcglCode: 'PAL', releaseDate: '2023-06-09' });

const row = (overrides: Partial<SortableRow> & { card: SortableRow['card'] }): SortableRow => ({
	total: 1,
	updatedAt: '2026-01-01T00:00:00.000Z',
	...overrides
});

const names = (rows: SortableRow[]) => rows.map((entry) => entry.card.name);

describe('sortRows', () => {
	const pikachu = row({ card: makeCard({ name: 'Pikachu', localId: '188', set: pal }), total: 2 });
	const numel = row({ card: makeCard({ name: 'Numel', localId: '021', set: meg }), total: 9 });
	const bulbasaur = row({ card: makeCard({ name: 'Bulbasaur', localId: '001', set: meg }), total: 4 });
	const rows = [pikachu, numel, bulbasaur];

	it('orders by name in both directions', () => {
		expect(names(sortRows(rows, 'name', 'asc'))).toEqual(['Bulbasaur', 'Numel', 'Pikachu']);
		expect(names(sortRows(rows, 'name', 'desc'))).toEqual(['Pikachu', 'Numel', 'Bulbasaur']);
	});

	it('orders by copies owned', () => {
		expect(names(sortRows(rows, 'owned', 'desc'))).toEqual(['Numel', 'Bulbasaur', 'Pikachu']);
		expect(names(sortRows(rows, 'owned', 'asc'))).toEqual(['Pikachu', 'Bulbasaur', 'Numel']);
	});

	it('orders by set date, then collector number', () => {
		expect(names(sortRows(rows, 'set', 'desc'))).toEqual(['Bulbasaur', 'Numel', 'Pikachu']);
		expect(names(sortRows(rows, 'set', 'asc'))).toEqual(['Pikachu', 'Bulbasaur', 'Numel']);
	});

	it('reads the digits out of a lettered collector number', () => {
		const tg = row({ card: makeCard({ name: 'Zapdos', localId: 'TG05', set: pal }) });
		const plain = row({ card: makeCard({ name: 'Aipom', localId: '100', set: pal }) });
		expect(names(sortRows([plain, tg], 'set', 'asc'))).toEqual(['Zapdos', 'Aipom']);
	});

	it('orders by when the row was last touched', () => {
		const older = row({
			card: makeCard({ name: 'Aipom' }),
			updatedAt: '2026-01-01T00:00:00.000Z'
		});
		const newer = row({
			card: makeCard({ name: 'Zapdos' }),
			updatedAt: '2026-09-01T00:00:00.000Z'
		});
		expect(names(sortRows([older, newer], 'updated', 'desc'))).toEqual(['Zapdos', 'Aipom']);
		expect(names(sortRows([older, newer], 'updated', 'asc'))).toEqual(['Aipom', 'Zapdos']);
	});

	it('breaks ties the same way whatever the sort', () => {
		const later = row({ card: makeCard({ name: 'Numel', localId: '021', set: meg }), total: 3 });
		const earlier = row({ card: makeCard({ name: 'Numel', localId: '021', set: pal }), total: 3 });
		// Equal names and equal counts: the older printing follows the newer one either way.
		expect(sortRows([earlier, later], 'owned', 'desc').map((entry) => entry.card.set.id)).toEqual([
			'me01',
			'sv02'
		]);
		expect(sortRows([later, earlier], 'name', 'asc').map((entry) => entry.card.set.id)).toEqual([
			'me01',
			'sv02'
		]);
	});

	it('leaves the input untouched', () => {
		const input = [pikachu, numel, bulbasaur];
		sortRows(input, 'name', 'asc');
		expect(names(input)).toEqual(['Pikachu', 'Numel', 'Bulbasaur']);
	});

	it('opens each sort at the end people care about', () => {
		expect(DEFAULT_SORT_DIRECTION.name).toBe('asc');
		expect(DEFAULT_SORT_DIRECTION.owned).toBe('desc');
	});
});

describe('rarityRank', () => {
	it('is case blind and spans the spellings the catalogue uses', () => {
		expect(rarityRank('common')).toBe(rarityRank('Common'));
		expect(rarityRank('Common')).toBeLessThan(rarityRank('Rare'));
		expect(rarityRank('Rare')).toBeLessThan(rarityRank('Ultra Rare'));
		expect(rarityRank('Ultra Rare')).toBeLessThan(rarityRank('Special illustration rare'));
		expect(rarityRank('Illustration rare')).toBeLessThan(rarityRank('Hyper rare'));
	});

	it('sorts a card with no rarity plainest of all', () => {
		expect(rarityRank(null)).toBeLessThan(rarityRank('Common'));
	});

	it('drops an unknown rarity above the ordinary tiers, below the special ones', () => {
		const unknown = rarityRank('Cosmic Foil Rare');
		expect(unknown).toBeGreaterThan(rarityRank('Rare'));
		expect(unknown).toBeLessThan(rarityRank('Secret Rare'));
	});

	it('sorts by rank, not alphabetically', () => {
		const rows = [
			row({ card: makeCard({ name: 'Aipom', rarity: 'Common' }) }),
			row({ card: makeCard({ name: 'Zapdos', rarity: 'Secret Rare' }) }),
			row({ card: makeCard({ name: 'Mew', rarity: 'Uncommon' }) })
		];
		expect(names(sortRows(rows, 'rarity', 'desc'))).toEqual(['Zapdos', 'Mew', 'Aipom']);
	});
});
