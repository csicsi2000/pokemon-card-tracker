import { describe, expect, it } from 'vitest';
import { diffDecks, diffToText } from '../src/lib/tcg/deck-diff';
import type { DeckEntry } from '../src/lib/tcg/legality';
import { makeCard, makeSet } from './helpers';

const pokemon = (name: string, extra = {}) =>
	makeCard({ name, supertype: 'Pokemon', subtypes: ['Basic'], ...extra });
const trainer = (name: string) => makeCard({ name, supertype: 'Trainer', subtypes: ['Supporter'] });
const energy = (name: string) => makeCard({ name, supertype: 'Energy', subtypes: ['Basic'] });

const row = (diff: ReturnType<typeof diffDecks>, name: string) =>
	diff.rows.find((r) => r.name === name)!;

describe('diffDecks', () => {
	it('splits the two lists into added, removed, changed and same', () => {
		const iono = trainer('Iono');
		const research = trainer("Professor's Research");
		const ball = trainer('Ultra Ball');
		const charmander = pokemon('Charmander');

		const a: DeckEntry[] = [
			{ card: charmander, quantity: 4 },
			{ card: iono, quantity: 4 },
			{ card: ball, quantity: 3 }
		];
		const b: DeckEntry[] = [
			{ card: charmander, quantity: 4 },
			{ card: iono, quantity: 2 },
			{ card: research, quantity: 2 }
		];

		const diff = diffDecks(a, b);

		expect(row(diff, 'Charmander')).toMatchObject({ status: 'same', a: 4, b: 4, delta: 0 });
		expect(row(diff, 'Iono')).toMatchObject({ status: 'changed', a: 4, b: 2, delta: -2 });
		expect(row(diff, 'Ultra Ball')).toMatchObject({ status: 'removed', a: 3, b: 0, delta: -3 });
		expect(row(diff, "Professor's Research")).toMatchObject({
			status: 'added',
			a: 0,
			b: 2,
			delta: 2
		});
		expect(diff.changes).toBe(3);
		expect(diff.totals).toEqual({ a: 11, b: 8 });
		expect(diff.added).toBe(2);
		expect(diff.removed).toBe(5);
		expect(diff.shared).toBe(6);
	});

	it('treats a different printing of the same card as the same card', () => {
		const pal = makeCard({ id: 'pal-185', name: 'Iono', set: makeSet({ id: 'pal' }), localId: '185' });
		const paf = makeCard({ id: 'paf-80', name: 'Iono', set: makeSet({ id: 'paf' }), localId: '80' });

		const diff = diffDecks([{ card: pal, quantity: 4 }], [{ card: paf, quantity: 4 }]);

		expect(diff.changes).toBe(0);
		expect(diff.similarity).toBe(1);
		expect(diff.reprints).toBe(1);
		expect(row(diff, 'Iono')).toMatchObject({ status: 'same', reprintOnly: true });
		// The row shows B's printing, so the diff reads left to right.
		expect(row(diff, 'Iono').card.id).toBe('paf-80');
		expect(row(diff, 'Iono').printings).toEqual({ a: [pal], b: [paf] });
	});

	it('does not flag a reprint when both decks run the same printings', () => {
		const iono = trainer('Iono');
		const diff = diffDecks([{ card: iono, quantity: 4 }], [{ card: iono, quantity: 4 }]);

		expect(diff.reprints).toBe(0);
		expect(row(diff, 'Iono').reprintOnly).toBe(false);
	});

	it('sums the copies when one deck spreads a name over several printings', () => {
		const first = makeCard({ id: 'sv-1', name: 'Ultra Ball', supertype: 'Trainer' });
		const second = makeCard({ id: 'sv-2', name: 'Ultra Ball', supertype: 'Trainer' });

		const diff = diffDecks(
			[
				{ card: first, quantity: 2 },
				{ card: second, quantity: 2 }
			],
			[{ card: first, quantity: 4 }]
		);

		expect(diff.rows).toHaveLength(1);
		expect(diff.rows[0]).toMatchObject({ a: 4, b: 4, status: 'same' });
		expect(diff.rows[0].printings.a).toHaveLength(2);
	});

	it('scores identical lists 1 and disjoint lists 0', () => {
		const iono = trainer('Iono');
		const ball = trainer('Ultra Ball');

		expect(diffDecks([{ card: iono, quantity: 4 }], [{ card: iono, quantity: 4 }]).similarity).toBe(
			1
		);
		expect(diffDecks([{ card: iono, quantity: 4 }], [{ card: ball, quantity: 4 }]).similarity).toBe(
			0
		);
		expect(diffDecks([], []).similarity).toBe(1);
	});

	it('scores a two-card swap in a sixty-card deck close to identical', () => {
		const shared: DeckEntry[] = [{ card: pokemon('Charmander'), quantity: 58 }];
		const diff = diffDecks(
			[...shared, { card: trainer('Iono'), quantity: 2 }],
			[...shared, { card: trainer("Professor's Research"), quantity: 2 }]
		);

		// 58 shared copies out of a 62-copy union.
		expect(diff.similarity).toBeCloseTo(58 / 62);
	});

	it('reports each section on both sides', () => {
		const diff = diffDecks(
			[
				{ card: pokemon('Charmander'), quantity: 4 },
				{ card: energy('Fire Energy'), quantity: 8 }
			],
			[
				{ card: pokemon('Charmander'), quantity: 3 },
				{ card: trainer('Iono'), quantity: 4 },
				{ card: energy('Fire Energy'), quantity: 6 }
			]
		);

		expect(diff.groups).toEqual([
			{ supertype: 'Pokemon', label: 'Pokémon', a: 4, b: 3, delta: -1 },
			{ supertype: 'Trainer', label: 'Trainer', a: 0, b: 4, delta: 4 },
			{ supertype: 'Energy', label: 'Energy', a: 8, b: 6, delta: -2 }
		]);
	});

	it('orders sections in decklist order, differences first, biggest swing on top', () => {
		const diff = diffDecks(
			[
				{ card: trainer('Iono'), quantity: 4 },
				{ card: pokemon('Pidgey'), quantity: 1 },
				{ card: energy('Fire Energy'), quantity: 4 }
			],
			[
				{ card: trainer('Iono'), quantity: 1 },
				{ card: trainer('Ultra Ball'), quantity: 1 },
				{ card: pokemon('Pidgey'), quantity: 1 },
				{ card: energy('Fire Energy'), quantity: 4 }
			]
		);

		expect(diff.rows.map((r) => r.name)).toEqual([
			'Pidgey', // Pokémon section, unchanged but first by supertype
			'Iono', // Trainer section: −3 leads
			'Ultra Ball', // then +1
			'Fire Energy'
		]);
	});

	it('carries the stats of both sides for a side-by-side summary', () => {
		const diff = diffDecks(
			[{ card: pokemon('Charmander'), quantity: 4 }],
			[{ card: pokemon('Charmander'), quantity: 6 }]
		);

		expect(diff.stats.a.basicPokemon).toBe(4);
		expect(diff.stats.b.basicPokemon).toBe(6);
	});
});

describe('diffToText', () => {
	it('writes the changes in +/- shorthand, additions first', () => {
		const diff = diffDecks(
			[
				{ card: trainer('Iono'), quantity: 4 },
				{ card: trainer('Ultra Ball'), quantity: 2 }
			],
			[
				{ card: trainer('Iono'), quantity: 2 },
				{ card: trainer('Ultra Ball'), quantity: 4 },
				{ card: trainer("Professor's Research"), quantity: 1 }
			]
		);

		expect(diffToText(diff)).toBe("+2 Ultra Ball\n+1 Professor's Research\n-2 Iono\n");
	});

	it('says so when nothing changed', () => {
		const iono = trainer('Iono');
		const diff = diffDecks([{ card: iono, quantity: 4 }], [{ card: iono, quantity: 4 }]);

		expect(diffToText(diff)).toBe('The two lists are identical.\n');
	});
});
