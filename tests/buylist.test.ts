import { describe, expect, it } from 'vitest';
import { buildBuylist } from '../src/lib/tcg/buylist';
import type { Card } from '../src/lib/types';
import { makeCard } from './helpers';

const trainer = (name: string, extra: Partial<Card> = {}) =>
	makeCard({ name, supertype: 'Trainer', ...extra });
const mon = (name: string, textKey: string, extra: Partial<Card> = {}) =>
	makeCard({ name, supertype: 'Pokemon', textKey, ...extra });
const own = (card: Card, quantity = 1) => ({ card, quantity });

describe('buildBuylist', () => {
	it('subtracts what is owned across every printing and variant with the same text', () => {
		const charmander = mon('Charmander', 'ember', { id: 'obf-26' });

		const list = buildBuylist(
			[{ card: charmander, quantity: 4 }],
			[
				own(mon('Charmander', 'ember')), // a reprint with the same attacks
				own(charmander) // a reverse holo copy
			]
		);

		expect(list.rows).toEqual([
			{ name: 'Charmander', needed: 4, owned: 2, missing: 2, suggestion: charmander }
		]);
		expect(list.totalMissing).toBe(2);
		expect(list.coverage).toBeCloseTo(0.5);
	});

	it('does not count a same-name Pokémon whose text differs', () => {
		const charmander = mon('Charmander', 'ember');

		const list = buildBuylist(
			[{ card: charmander, quantity: 2 }],
			[own(mon('Charmander', 'flare'), 3)]
		);

		expect(list.rows).toEqual([
			{ name: 'Charmander', needed: 2, owned: 0, missing: 2, suggestion: charmander }
		]);
	});

	it('keeps two same-name Pokémon with different text as separate needs', () => {
		const list = buildBuylist(
			[
				{ card: mon('Pikachu', 'a'), quantity: 2 },
				{ card: mon('Pikachu', 'b'), quantity: 1 }
			],
			[own(mon('Pikachu', 'a'), 2)]
		);

		expect(list.rows).toHaveLength(1);
		expect(list.rows[0]).toMatchObject({ name: 'Pikachu', needed: 1, owned: 0, missing: 1 });
	});

	it('only counts the very printing when a Pokémon has no known text', () => {
		const known = mon('Mew', 'x', { id: 'a-1' });
		const unknown = makeCard({ id: 'b-1', name: 'Mew', supertype: 'Pokemon' });

		const list = buildBuylist([{ card: unknown, quantity: 1 }], [own(known)]);

		expect(list.rows[0]).toMatchObject({ owned: 0, missing: 1 });
		expect(buildBuylist([{ card: unknown, quantity: 1 }], [own(unknown)]).rows).toEqual([]);
	});

	it('omits cards that are fully owned', () => {
		const list = buildBuylist([{ card: trainer('Iono'), quantity: 2 }], [own(trainer('Iono'), 3)]);

		expect(list.rows).toEqual([]);
		expect(list.coverage).toBe(1);
	});

	it('merges duplicate requirements for the same Trainer, whatever the printing', () => {
		const list = buildBuylist(
			[
				{ card: trainer('Ultra Ball', { id: 'a-1' }), quantity: 2 },
				{ card: trainer('Ultra Ball', { id: 'b-2' }), quantity: 2 }
			],
			[]
		);

		expect(list.rows).toHaveLength(1);
		expect(list.rows[0]).toMatchObject({ needed: 4, owned: 0, missing: 4 });
	});

	it("lets any professor's Professor's Research cover another", () => {
		const oak = trainer("Professor's Research (Professor Oak)");
		const magnolia = trainer("Professor's Research (Professor Magnolia)");

		const list = buildBuylist(
			[
				{ card: oak, quantity: 2 },
				{ card: magnolia, quantity: 2 }
			],
			[own(trainer("Professor's Research (Professor Juniper)"))]
		);

		expect(list.rows).toEqual([
			{ name: "Professor's Research", needed: 4, owned: 1, missing: 3, suggestion: oak }
		]);
	});

	it('keeps the full name when only one character is asked for', () => {
		const giovanni = trainer("Boss's Orders (Giovanni)");
		const list = buildBuylist(
			[{ card: giovanni, quantity: 2 }],
			[own(trainer("Boss's Orders (Lysandre)"))]
		);

		expect(list.rows[0]).toMatchObject({ name: "Boss's Orders (Giovanni)", owned: 1, missing: 1 });
	});

	it('sorts the biggest gaps first', () => {
		const list = buildBuylist(
			[
				{ card: trainer('Iono'), quantity: 1 },
				{ card: trainer('Ultra Ball'), quantity: 4 }
			],
			[]
		);

		expect(list.rows.map((r) => r.name)).toEqual(['Ultra Ball', 'Iono']);
	});
});
