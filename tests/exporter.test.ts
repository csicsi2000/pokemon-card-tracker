import { describe, expect, it } from 'vitest';
import { toPtcglText } from '../src/lib/tcg/exporter';
import { parseDecklist } from '../src/lib/tcg/parser';
import { makeCard, makeSet } from './helpers';

const lines = [
	{
		quantity: 4,
		card: makeCard({
			name: 'Charizard ex',
			localId: '125',
			set: makeSet({ id: 'sv03', name: 'Obsidian Flames', ptcglCode: 'OBF' })
		})
	},
	{
		quantity: 4,
		card: makeCard({
			name: 'Iono',
			localId: '185',
			supertype: 'Trainer',
			set: makeSet({ id: 'sv04', name: 'Paldea Evolved', ptcglCode: 'PAL' })
		})
	},
	{
		quantity: 8,
		card: makeCard({
			name: 'Fire Energy',
			localId: '2',
			supertype: 'Energy',
			set: makeSet({ id: 'sve', name: 'SV Energy', ptcglCode: 'SVE' })
		})
	}
];

describe('toPtcglText', () => {
	it('writes sections in PTCGL order with a total', () => {
		expect(toPtcglText(lines)).toBe(
			`Pokémon: 4
4 Charizard ex OBF 125

Trainer: 4
4 Iono PAL 185

Energy: 8
8 Fire Energy SVE 2

Total Cards: 16
`
		);
	});

	it('round-trips through the parser', () => {
		const { entries, total, warnings } = parseDecklist(toPtcglText(lines));

		expect(warnings).toEqual([]);
		expect(total).toBe(16);
		expect(entries.map((e) => [e.quantity, e.name, e.setCode, e.number])).toEqual([
			[4, 'Charizard ex', 'OBF', '125'],
			[4, 'Iono', 'PAL', '185'],
			[8, 'Fire Energy', 'SVE', '2']
		]);
	});

	it('recovers a promo set code the catalogue is missing', () => {
		const card = makeCard({
			name: 'Pikachu',
			localId: '1',
			set: makeSet({ id: 'swshp', name: 'SWSH Promos', ptcglCode: null })
		});

		expect(toPtcglText([{ quantity: 1, card }])).toContain('1 Pikachu PR-SW 1');
	});

	it('falls back to null for sets with no code anywhere', () => {
		const card = makeCard({
			name: 'Pikachu',
			localId: '1',
			set: makeSet({ id: 'someobscureset', name: 'Obscure', ptcglCode: null })
		});

		expect(toPtcglText([{ quantity: 1, card }])).toContain('1 Pikachu null 1');
	});
});
