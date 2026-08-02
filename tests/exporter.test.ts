import { describe, expect, it } from 'vitest';
import { toPtcglText } from '../src/lib/tcg/exporter';
import { parseDecklist } from '../src/lib/tcg/parser';
import { makeCard } from './helpers';

const lines = [
	{
		quantity: 4,
		card: makeCard({
			id: 'sv03-125',
			set_id: 'sv03',
			local_id: '125',
			name: 'Charizard ex',
			set: {
				id: 'sv03',
				name: 'Obsidian Flames',
				ptcgl_code: 'OBF',
				symbol_url: null,
				legal_standard: true,
				legal_expanded: true
			}
		})
	},
	{
		quantity: 4,
		card: makeCard({
			id: 'sv04-185',
			set_id: 'sv04',
			local_id: '185',
			name: 'Iono',
			supertype: 'Trainer',
			set: {
				id: 'sv04',
				name: 'Paldea Evolved',
				ptcgl_code: 'PAL',
				symbol_url: null,
				legal_standard: true,
				legal_expanded: true
			}
		})
	},
	{
		quantity: 8,
		card: makeCard({
			id: 'sve-2',
			set_id: 'sve',
			local_id: '2',
			name: 'Fire Energy',
			supertype: 'Energy',
			set: {
				id: 'sve',
				name: 'SV Energy',
				ptcgl_code: 'SVE',
				symbol_url: null,
				legal_standard: true,
				legal_expanded: true
			}
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

	it('falls back to null for sets without a PTCGL code', () => {
		const card = makeCard({
			name: 'Pikachu',
			local_id: '1',
			set: {
				id: 'swshp',
				name: 'SWSH Promos',
				ptcgl_code: null,
				symbol_url: null,
				legal_standard: false,
				legal_expanded: true
			}
		});

		expect(toPtcglText([{ quantity: 1, card }])).toContain('1 Pikachu null 1');
	});
});
