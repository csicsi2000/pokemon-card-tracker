import { describe, expect, it } from 'vitest';
import { toCardmarketText, toPtcglText, type CardNaming } from '../src/lib/tcg/exporter';
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

describe('toCardmarketText', () => {
	const text: Record<string, CardNaming> = {
		'sv03-125': {
			abilities: [{ name: 'Infernal Reign' }],
			attacks: [{ name: 'Burning Darkness' }]
		}
	};
	const textOf = (card: { id: string }) => text[card.id];

	it('names a Pokémon by its abilities and attacks, and everything else by name', () => {
		expect(toCardmarketText(lines, textOf)).toBe(
			`4x Charizard ex Infernal Reign Burning Darkness
4x Iono
8x Fire Energy
`
		);
	});

	it('falls back to the bare name when no rules text is available', () => {
		expect(toCardmarketText(lines)).toBe(
			`4x Charizard ex
4x Iono
8x Fire Energy
`
		);
	});

	it('merges printings and finishes of one card into a single line', () => {
		const iono = lines[1].card;
		const reprint = makeCard({
			name: 'Iono',
			localId: '254',
			supertype: 'Trainer',
			set: makeSet({ id: 'sv08', name: 'Surging Sparks', ptcglCode: 'SSP' })
		});

		expect(
			toCardmarketText([
				{ quantity: 2, card: iono },
				{ quantity: 1, card: iono, variant: 'reverse' },
				{ quantity: 1, card: reprint }
			])
		).toBe('4x Iono\n');
	});

	it('leaves out rows with nothing to buy, and writes nothing for an empty list', () => {
		expect(toCardmarketText([{ quantity: 0, card: lines[1].card }])).toBe('');
		expect(toCardmarketText([])).toBe('');
	});
});
