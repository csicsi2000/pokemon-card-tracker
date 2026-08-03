import { describe, expect, it } from 'vitest';
import { parseDecklist } from '../src/lib/tcg/parser';
import { resolveEntries, resolveEntry } from '../src/lib/tcg/resolver';
import { makeCard, makeCatalogue, makeSet } from './helpers';

const obf = makeSet({ id: 'sv03', name: 'Obsidian Flames', ptcglCode: 'OBF', releaseDate: '2023-08-11' });
const swshPromo = makeSet({
	id: 'swshp',
	name: 'SWSH Black Star Promos',
	ptcglCode: 'PR-SW',
	releaseDate: '2020-02-07',
	legalStandard: false
});
const base = makeSet({
	id: 'base1',
	name: 'Base Set',
	ptcglCode: 'BS',
	releaseDate: '1999-01-09',
	legalStandard: false
});
const sve = makeSet({ id: 'sve', name: 'SV Energies', ptcglCode: 'SVE', releaseDate: '2023-03-31' });
// A set TCGdex gives no PTCGL code for, reachable only via the overrides table.
const shinyVault = makeSet({ id: 'sma', name: 'Shiny Vault', ptcglCode: null, releaseDate: '2019-08-23' });

const cards = [
	makeCard({ name: 'Charizard ex', localId: '125', set: obf }),
	makeCard({ name: 'Charmander', localId: '26', set: obf }),
	makeCard({ name: 'Charmander', localId: '92', set: swshPromo }),
	makeCard({ name: 'Charizard', localId: '4', set: base }),
	makeCard({ name: 'Basic Fire Energy', localId: '2', supertype: 'Energy', set: sve }),
	makeCard({ name: 'Charizard-GX', localId: 'SV49', set: shinyVault })
];

const catalogue = makeCatalogue(cards);

const resolve = (line: string) => resolveEntry(catalogue, parseDecklist(line).entries[0]);

describe('resolveEntry', () => {
	it('pins the exact printing from a set code and number', () => {
		const result = resolve('2 Charmander PR-SW 92');

		expect(result.match).toBe('exact');
		expect(result.card?.set.id).toBe('swshp');
		expect(result.card?.localId).toBe('92');
	});

	it('falls back to the newest standard-legal printing for a "null" set', () => {
		// The user's own sample list: "1 Charizard null 1".
		const result = resolve('1 Charizard null 1');

		expect(result.match).toBe('name');
		expect(result.card?.name).toBe('Charizard');
	});

	it('prefers standard-legal printings when matching by name alone', () => {
		const result = resolve('4 Charmander');

		expect(result.card?.set.id).toBe('sv03');
		expect(result.alternatives).toHaveLength(2);
	});

	it('maps set codes TCGdex does not publish via the overrides table', () => {
		const result = resolve('1 Charizard-GX HIF SV49');

		expect(result.match).toBe('override');
		expect(result.card?.set.id).toBe('sma');
	});

	it('ignores leading zeros in collector numbers', () => {
		expect(resolve('1 Charizard ex OBF 00125').card?.localId).toBe('125');
	});

	it('matches promo numbers written without their prefix', () => {
		const padded = makeCatalogue([
			makeCard({ name: 'Pikachu', localId: 'SWSH050', set: swshPromo })
		]);
		const result = resolveEntry(padded, parseDecklist('1 Pikachu PR-SW 50').entries[0]);

		expect(result.match).toBe('exact');
		expect(result.card?.localId).toBe('SWSH050');
	});

	it('resolves basic energy written in PTCGL bracket style', () => {
		const result = resolve('8 Basic {R} Energy SVE 2');

		expect(result.card?.name).toBe('Basic Fire Energy');
	});

	it('keeps the card but warns when the set code and number disagree', () => {
		const result = resolve('1 Charmander OBF 999');

		expect(result.card).not.toBeNull();
		expect(result.note).toMatch(/No OBF #999/);
	});

	it('reports names that are not in the catalogue', () => {
		const result = resolve('1 Definitely Not A Card XYZ 1');

		expect(result.match).toBe('unresolved');
		expect(result.card).toBeNull();
	});

	it('offers every printing of a name as an alternative', () => {
		expect(resolve('1 Charmander PR-SW 92').alternatives.map((c) => c.set.id)).toEqual([
			'sv03',
			'swshp'
		]);
	});
});

describe('resolveEntries', () => {
	it('resolves the whole sample list from pkmn.gg', () => {
		const list = parseDecklist(`Pokémon: 2
1 Charizard null 1
2 Charmander PR-SW 92

Total Cards: 3`);

		const results = resolveEntries(catalogue, list.entries);

		expect(list.warnings).toEqual([]);
		expect(results.every((row) => row.card)).toBe(true);
		expect(results.map((row) => row.card?.name)).toEqual(['Charizard', 'Charmander']);
	});
});
