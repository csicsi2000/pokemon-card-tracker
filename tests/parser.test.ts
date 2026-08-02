import { describe, expect, it } from 'vitest';
import { parseDecklist } from '../src/lib/tcg/parser';

describe('parseDecklist', () => {
	it('parses the pkmn.gg sample, including a null set code', () => {
		const result = parseDecklist(`Pokémon: 2
1 Charizard null 1
2 Charmander PR-SW 92

Total Cards: 3`);

		expect(result.warnings).toEqual([]);
		expect(result.declaredTotal).toBe(3);
		expect(result.total).toBe(3);
		expect(result.entries).toEqual([
			expect.objectContaining({
				quantity: 1,
				name: 'Charizard',
				setCode: null,
				number: '1',
				section: 'Pokemon'
			}),
			expect.objectContaining({
				quantity: 2,
				name: 'Charmander',
				setCode: 'PR-SW',
				number: '92',
				section: 'Pokemon'
			})
		]);
	});

	it('handles all three sections and an unaccented header', () => {
		const result = parseDecklist(`Pokemon: 1
4 Charizard ex OBF 125

Trainer: 1
4 Iono PAL 185

Energy: 1
8 Basic {R} Energy SVE 2

Total Cards: 16`);

		expect(result.total).toBe(16);
		expect(result.entries.map((e) => e.section)).toEqual(['Pokemon', 'Trainer', 'Energy']);
		expect(result.entries[0]).toMatchObject({ name: 'Charizard ex', setCode: 'OBF', number: '125' });
		expect(result.entries[2]).toMatchObject({ name: 'Basic {R} Energy', setCode: 'SVE', number: '2' });
	});

	it('keeps alphanumeric promo numbers intact', () => {
		const { entries } = parseDecklist('1 Pikachu V PR-SW SWSH061');
		expect(entries[0]).toMatchObject({ name: 'Pikachu V', setCode: 'PR-SW', number: 'SWSH061' });
	});

	it('does not mistake a name suffix for a set code', () => {
		const { entries } = parseDecklist('3 Charizard VMAX\n2 Mew ex');
		expect(entries[0]).toMatchObject({ name: 'Charizard VMAX', setCode: null, number: null });
		expect(entries[1]).toMatchObject({ name: 'Mew ex', setCode: null, number: null });
	});

	it('strips trailing foil markers', () => {
		const { entries } = parseDecklist("1 Professor's Research SVI 189 PH");
		expect(entries[0]).toMatchObject({ name: "Professor's Research", setCode: 'SVI', number: '189' });
	});

	it('warns when the declared total disagrees with the lines', () => {
		const result = parseDecklist('2 Pikachu SVI 25\n\nTotal Cards: 5');
		expect(result.total).toBe(2);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toMatch(/5 cards but 2/);
	});

	it('reports unreadable lines instead of dropping them silently', () => {
		const result = parseDecklist('Pokémon: 1\nthis is not a card line\n1 Pikachu SVI 25');
		expect(result.entries).toHaveLength(1);
		expect(result.warnings[0]).toMatch(/Line 2/);
	});

	it('accepts "4x Card" style quantities and ignores comments', () => {
		const { entries, warnings } = parseDecklist('# my deck\n4x Iono PAL 185');
		expect(warnings).toEqual([]);
		expect(entries[0]).toMatchObject({ quantity: 4, name: 'Iono' });
	});
});
