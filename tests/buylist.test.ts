import { describe, expect, it } from 'vitest';
import { buildBuylist } from '../src/lib/tcg/buylist';
import { makeCard } from './helpers';

describe('buildBuylist', () => {
	it('subtracts what is owned across every printing and variant', () => {
		const charmander = makeCard({ id: 'obf-26', name: 'Charmander' });

		const list = buildBuylist(
			[{ card: charmander, quantity: 4 }],
			[
				{ name: 'Charmander', quantity: 1 }, // a different printing
				{ name: 'Charmander', quantity: 1 } // a reverse holo copy
			]
		);

		expect(list.rows).toEqual([
			{ name: 'Charmander', needed: 4, owned: 2, missing: 2, suggestion: charmander }
		]);
		expect(list.totalMissing).toBe(2);
		expect(list.coverage).toBeCloseTo(0.5);
	});

	it('omits cards that are fully owned', () => {
		const list = buildBuylist(
			[{ card: makeCard({ name: 'Iono' }), quantity: 2 }],
			[{ name: 'Iono', quantity: 3 }]
		);

		expect(list.rows).toEqual([]);
		expect(list.coverage).toBe(1);
	});

	it('merges duplicate requirements for the same name', () => {
		const list = buildBuylist(
			[
				{ card: makeCard({ id: 'a-1', name: 'Ultra Ball' }), quantity: 2 },
				{ card: makeCard({ id: 'b-2', name: 'Ultra Ball' }), quantity: 2 }
			],
			[]
		);

		expect(list.rows).toHaveLength(1);
		expect(list.rows[0]).toMatchObject({ needed: 4, owned: 0, missing: 4 });
	});

	it("lets any professor's Professor's Research cover another", () => {
		const oak = makeCard({ name: "Professor's Research (Professor Oak)" });
		const magnolia = makeCard({ name: "Professor's Research (Professor Magnolia)" });

		const list = buildBuylist(
			[
				{ card: oak, quantity: 2 },
				{ card: magnolia, quantity: 2 }
			],
			[{ name: "Professor's Research (Professor Juniper)", quantity: 1 }]
		);

		expect(list.rows).toEqual([
			{ name: "Professor's Research", needed: 4, owned: 1, missing: 3, suggestion: oak }
		]);
	});

	it('keeps the full name when only one character is asked for', () => {
		const giovanni = makeCard({ name: "Boss's Orders (Giovanni)" });
		const list = buildBuylist([{ card: giovanni, quantity: 2 }], [{ name: "Boss's Orders (Lysandre)", quantity: 1 }]);

		expect(list.rows[0]).toMatchObject({ name: "Boss's Orders (Giovanni)", owned: 1, missing: 1 });
	});

	it('sorts the biggest gaps first', () => {
		const list = buildBuylist(
			[
				{ card: makeCard({ name: 'Iono' }), quantity: 1 },
				{ card: makeCard({ name: 'Ultra Ball' }), quantity: 4 }
			],
			[]
		);

		expect(list.rows.map((r) => r.name)).toEqual(['Ultra Ball', 'Iono']);
	});
});
