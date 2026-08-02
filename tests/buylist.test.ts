import { describe, expect, it } from 'vitest';
import { buildBuylist } from '../src/lib/tcg/buylist';
import { makeCard } from './helpers';

describe('buildBuylist', () => {
	it('subtracts what is owned across every printing and variant', () => {
		const charmander = makeCard({ id: 'obf-26', name: 'Charmander' });

		const list = buildBuylist(
			[{ card: charmander, quantity: 4 }],
			[
				{ card_id: 'mew-4', quantity: 1, name: 'Charmander' }, // different printing
				{ card_id: 'obf-26', quantity: 1, name: 'Charmander' } // reverse holo copy
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
			[{ card_id: 'x', quantity: 3, name: 'Iono' }]
		);

		expect(list.rows).toEqual([]);
		expect(list.coverage).toBe(1);
	});

	it('merges duplicate requirements for the same name', () => {
		const list = buildBuylist(
			[
				{ card: makeCard({ id: 'a-1', name: 'Ultra Ball' }), quantity: 2 },
				{ card: makeCard({ id: 'b-1', name: 'Ultra Ball' }), quantity: 2 }
			],
			[]
		);

		expect(list.rows).toHaveLength(1);
		expect(list.rows[0]).toMatchObject({ needed: 4, owned: 0, missing: 4 });
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
