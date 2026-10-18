import { describe, expect, it } from 'vitest';
import { parseDecklist } from '../src/lib/tcg/parser';
import { toPtcglText } from '../src/lib/tcg/exporter';
import { findByNumber, resolveEntries, resolveEntry } from '../src/lib/tcg/resolver';
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

	it('decides "standard-legal" by regulation mark when picking a printing', () => {
		// TCGdex marks no set Standard-legal, so the flag cannot be what decides.
		const newer = makeSet({ id: 'cel25', ptcglCode: 'CEL', releaseDate: '2026-09-01', legalStandard: false });
		const older = makeSet({ id: 'sv08', ptcglCode: 'SSP', releaseDate: '2024-11-08', legalStandard: false });
		const marked = makeCatalogue([
			makeCard({ name: 'Pikachu', localId: '5', set: newer }),
			makeCard({ name: 'Pikachu', localId: '57', set: older, regulationMark: 'H' })
		]);

		expect(resolveEntry(marked, parseDecklist('1 Pikachu').entries[0]).card?.set.id).toBe('sv08');
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

describe('numbered subsets behind a main set code', () => {
	// Shaped like the real catalogue: the main set owns the plain code, the subset is
	// coded "SIT:TG", and Hidden Fates' Shiny Vault has no code of its own at all.
	const hif = makeSet({ id: 'sm115', name: 'Hidden Fates', ptcglCode: 'HIF', releaseDate: '2019-08-23' });
	const sma = makeSet({ id: 'sma', name: 'Yellow A Alternate', ptcglCode: null, releaseDate: '2019-08-23' });
	const sit = makeSet({ id: 'swsh12', name: 'Silver Tempest', ptcglCode: 'SIT', releaseDate: '2022-11-11' });
	const sitTg = makeSet({ id: 'swsh12tg', name: 'Silver Tempest Trainer Gallery', ptcglCode: 'SIT:TG', releaseDate: '2022-11-11' });
	const crz = makeSet({ id: 'swsh12.5', name: 'Crown Zenith', ptcglCode: 'CRZ', releaseDate: '2023-01-20' });
	const crzGg = makeSet({ id: 'swsh12.5gg', name: 'Crown Zenith Galarian Gallery', ptcglCode: 'CRZ:GG', releaseDate: '2023-01-20' });
	const brs = makeSet({ id: 'swsh9', name: 'Brilliant Stars', ptcglCode: 'BRS', releaseDate: '2022-02-25' });
	const brsTg = makeSet({ id: 'swsh9tg', name: 'Brilliant Stars Trainer Gallery', ptcglCode: 'BRS:TG', releaseDate: '2022-02-25' });
	const svi = makeSet({ id: 'sv01', name: 'Scarlet & Violet', ptcglCode: 'SVI', releaseDate: '2023-03-31' });

	const subsetCatalogue = makeCatalogue([
		makeCard({ name: 'Charizard-GX', localId: '9', set: hif }),
		makeCard({ name: 'Charizard-GX', localId: 'SV49', set: sma }),
		makeCard({ name: 'Sunkern', localId: '005', set: sit }),
		makeCard({ name: 'Gardevoir', localId: 'TG05', set: sitTg }),
		makeCard({ name: 'Grookey', localId: '001', set: crz }),
		makeCard({ name: 'Hisuian Voltorb', localId: 'GG01', set: crzGg }),
		makeCard({ name: 'Ninjask', localId: '010', set: brs }),
		makeCard({ name: 'Houndoom', localId: 'TG10', set: brsTg }),
		makeCard({ name: 'Pineco', localId: '005', set: svi })
	]);

	const resolveIn = (line: string) => resolveEntry(subsetCatalogue, parseDecklist(line).entries[0]);

	it('finds Shiny Vault cards through the override when the main set owns the code', () => {
		const result = resolveIn('1 HIF SV49');
		expect(result.card?.id).toBe('sma-SV49');
		expect(result.match).toBe('override');
		expect(resolveIn('1 Charizard-GX HIF SV49').card?.id).toBe('sma-SV49');
		expect(resolveIn('1 Charizard-GX HIF 9').card?.id).toBe('sm115-9');
	});

	it('finds gallery cards written under the parent code', () => {
		expect(resolveIn('1 SIT TG05').card?.id).toBe('swsh12tg-TG05');
		expect(resolveIn('1 Gardevoir SIT TG05').card?.id).toBe('swsh12tg-TG05');
		expect(resolveIn('1 CRZ GG01').card?.id).toBe('swsh12.5gg-GG01');
		expect(resolveIn('1 Houndoom BRS TG10').card?.id).toBe('swsh9tg-TG10');
	});

	it('never reads a lettered number as the main set card with the same digits', () => {
		const result = resolveIn('1 SVI TG05');
		expect(result.card).toBeNull();
		expect(result.note).toMatch(/no card #TG05/);
		expect(resolveIn('1 SIT 5').card?.id).toBe('swsh12-005');
	});

	it('round-trips an exported gallery card', () => {
		const card = subsetCatalogue.byId.get('swsh12tg-TG05')!;
		const text = toPtcglText([{ quantity: 1, card }]);
		expect(text).toContain('1 Gardevoir SIT TG05');
		expect(resolveEntries(subsetCatalogue, parseDecklist(text).entries)[0].card).toBe(card);
	});
});

describe('Expedition, whose code is also a name suffix', () => {
	it('pins "Charizard EX 6" to Expedition #6', () => {
		const expedition = makeSet({ id: 'ecard1', name: 'Expedition Base Set', ptcglCode: 'EX', releaseDate: '2002-09-15' });
		const expeditionCatalogue = makeCatalogue([
			makeCard({ name: 'Charizard', localId: '6', set: expedition }),
			makeCard({ name: 'Charizard', localId: '39', set: expedition })
		]);
		const result = resolveEntry(expeditionCatalogue, parseDecklist('1 Charizard EX 6').entries[0]);

		expect(result.match).toBe('exact');
		expect(result.card?.id).toBe('ecard1-6');
	});
});

describe('findByNumber', () => {
	it('keeps the numeric fallback for unprefixed numbers only', () => {
		const promo = makeCard({ name: 'Pikachu', localId: 'SWSH050', set: swshPromo });
		const plain = makeCard({ name: 'Pikachu', localId: '5', set: obf });

		expect(findByNumber([promo], '50')).toEqual([promo]);
		expect(findByNumber([promo], 'SWSH50')).toEqual([promo]);
		expect(findByNumber([plain], 'TG05')).toEqual([]);
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
