import { describe, expect, it } from 'vitest';
import {
	chanceOfAtLeastOne,
	deckPile,
	draw,
	handOdds,
	HAND_SIZE,
	openingHand,
	PRIZE_COUNT,
	shuffle,
	sortHand,
	tallyHand,
	type Rng
} from '../src/lib/tcg/hand-test';
import type { DeckEntry } from '../src/lib/tcg/legality';
import { makeCard } from './helpers';

const pokemon = (name: string, subtypes: string[], extra = {}) =>
	makeCard({ name, supertype: 'Pokemon', subtypes, ...extra });
const trainer = (name: string, subtypes: string[]) =>
	makeCard({ name, supertype: 'Trainer', subtypes });
const energy = (name: string) => makeCard({ name, supertype: 'Energy', subtypes: ['Basic'] });

/** A shuffle that leaves the pile exactly as it was — Fisher–Yates swaps i with itself. */
const identity: Rng = () => 0.999999;

/**
 * Every swap takes j = 0, which rotates the pile one to the left: the top card goes to
 * the bottom and everything else shifts up. A different deal, deterministically.
 */
const rotate: Rng = () => 0;

/** Walks the list and then stays on its last value, so a test can script shuffle by shuffle. */
function scripted(values: number[]): Rng {
	let i = 0;
	return () => values[Math.min(i++, values.length - 1)];
}

const names = (cards: { name: string }[]) => cards.map((card) => card.name);

describe('deckPile', () => {
	it('expands quantities into one card each', () => {
		const pile = deckPile([
			{ card: pokemon('Pikachu', ['Basic']), quantity: 2 },
			{ card: energy('Lightning Energy'), quantity: 3 }
		]);

		expect(names(pile)).toEqual([
			'Pikachu',
			'Pikachu',
			'Lightning Energy',
			'Lightning Energy',
			'Lightning Energy'
		]);
	});

	it('ignores rows with no copies', () => {
		expect(deckPile([{ card: pokemon('Pikachu', ['Basic']), quantity: 0 }])).toEqual([]);
	});
});

describe('shuffle', () => {
	it('leaves the caller’s array untouched', () => {
		const cards = [pokemon('A', ['Basic']), pokemon('B', ['Basic'])];
		const before = [...cards];

		shuffle(cards, rotate);

		expect(cards).toEqual(before);
	});

	it('keeps every card', () => {
		const cards = Array.from({ length: 20 }, (_, i) => pokemon(`Card ${i}`, ['Basic']));

		const shuffled = shuffle(cards, scripted([0.1, 0.7, 0.3, 0.9, 0.5]));

		expect(names(shuffled).sort()).toEqual(names(cards).sort());
	});
});

/** 60 cards: `basics` Basic Pokémon, the rest basic energy, in that order. */
function deck(basics: number, size = 60): DeckEntry[] {
	return [
		{ card: pokemon('Pikachu', ['Basic']), quantity: basics },
		{ card: energy('Lightning Energy'), quantity: size - basics }
	];
}

describe('openingHand', () => {
	it('deals seven, sets six prizes aside and leaves the rest as the library', () => {
		const test = openingHand(deck(12), identity);

		expect(test.hand).toHaveLength(HAND_SIZE);
		expect(test.prizes).toHaveLength(PRIZE_COUNT);
		expect(test.library).toHaveLength(60 - HAND_SIZE - PRIZE_COUNT);
		expect(test.drawn).toEqual([]);
		expect(test.keepable).toBe(true);
	});

	it('mulligans a hand with no Basic Pokémon and keeps the one that has one', () => {
		// Seven energy and one Pikachu: the first shuffle leaves the pile alone, so the
		// hand is the seven energy; the second rotates the Pikachu up into it. A shuffle
		// of eight cards spends seven random numbers, hence where the script turns.
		const entries: DeckEntry[] = [
			{ card: energy('Lightning Energy'), quantity: 7 },
			{ card: pokemon('Pikachu', ['Basic']), quantity: 1 }
		];
		const rng = scripted([...Array(7).fill(0.999999), 0]);

		const test = openingHand(entries, rng);

		expect(test.mulligans).toHaveLength(1);
		expect(names(test.mulligans[0]).every((name) => name === 'Lightning Energy')).toBe(true);
		expect(test.hand.some((card) => card.name === 'Pikachu')).toBe(true);
	});

	it('deals a hand it cannot keep when the deck has no Basic Pokémon at all', () => {
		const entries: DeckEntry[] = [
			{ card: trainer('Iono', ['Supporter']), quantity: 30 },
			{ card: energy('Fire Energy'), quantity: 30 }
		];

		const test = openingHand(entries, identity);

		expect(test.keepable).toBe(false);
		expect(test.mulligans).toEqual([]);
		expect(test.hand).toHaveLength(HAND_SIZE);
	});

	it('deals what it has when the deck is shorter than a hand', () => {
		const test = openingHand(deck(2, 5), identity);

		expect(test.hand).toHaveLength(5);
		expect(test.prizes).toEqual([]);
		expect(test.library).toEqual([]);
	});

	it('never loses or invents a card', () => {
		const test = openingHand(deck(8), scripted([0.13, 0.81, 0.42, 0.66, 0.27, 0.95]));

		expect(test.hand.length + test.prizes.length + test.library.length).toBe(60);
	});
});

describe('draw', () => {
	it('moves cards from the top of the library into the hand and the drawn list', () => {
		const test = openingHand(deck(12), identity);
		const top = test.library[0];

		const after = draw(test);

		expect(after.hand).toHaveLength(HAND_SIZE + 1);
		expect(after.hand.at(-1)).toBe(top);
		expect(after.drawn).toEqual([top]);
		expect(after.library).toHaveLength(test.library.length - 1);
	});

	it('draws several at once and leaves the original test alone', () => {
		const test = openingHand(deck(12), identity);

		const after = draw(test, 3);

		expect(after.drawn).toHaveLength(3);
		expect(test.drawn).toEqual([]);
		expect(test.library).toHaveLength(60 - HAND_SIZE - PRIZE_COUNT);
	});

	it('stops at the last card rather than drawing from an empty deck', () => {
		const test = openingHand(deck(2, 14), identity);
		expect(test.library).toHaveLength(1);

		const emptied = draw(test, 5);

		expect(emptied.drawn).toHaveLength(1);
		expect(draw(emptied)).toBe(emptied);
	});
});

describe('sortHand', () => {
	it('sorts into decklist order by name without touching the hand', () => {
		const hand = [
			energy('Water Energy'),
			trainer('Ultra Ball', ['Item']),
			pokemon('Squirtle', ['Basic']),
			trainer('Iono', ['Supporter']),
			pokemon('Blastoise', ['Stage2'])
		];
		const before = names(hand);

		expect(names(sortHand(hand))).toEqual([
			'Blastoise',
			'Squirtle',
			'Iono',
			'Ultra Ball',
			'Water Energy'
		]);
		expect(names(hand)).toEqual(before);
	});
});

describe('chanceOfAtLeastOne', () => {
	it('matches the hypergeometric complement', () => {
		// 1 - C(56,7)/C(60,7): the standard "four-of in the opening hand" figure.
		expect(chanceOfAtLeastOne(4, 60, 7)).toBeCloseTo(0.3995, 4);
		expect(chanceOfAtLeastOne(1, 60, 7)).toBeCloseTo(7 / 60, 6);
	});

	it('is certain once the copies or the draws cover the deck', () => {
		expect(chanceOfAtLeastOne(60, 60, 7)).toBe(1);
		expect(chanceOfAtLeastOne(1, 7, 7)).toBe(1);
	});

	it('is impossible with no copies, no draws or no deck', () => {
		expect(chanceOfAtLeastOne(0, 60, 7)).toBe(0);
		expect(chanceOfAtLeastOne(4, 60, 0)).toBe(0);
		expect(chanceOfAtLeastOne(4, 0, 7)).toBe(0);
	});
});

describe('handOdds', () => {
	it('reports the mulligan chance and what it implies', () => {
		const odds = handOdds(deck(12));

		expect(odds.deckSize).toBe(60);
		expect(odds.basicPokemon).toBe(12);
		expect(odds.mulligan).toBeCloseTo(1 - chanceOfAtLeastOne(12, 60, 7), 10);
		expect(odds.mulligan).toBeCloseTo(0.1906, 4);
		expect(odds.expectedMulligans).toBeCloseTo(odds.mulligan / (1 - odds.mulligan), 10);
		expect(odds.prized).toBeCloseTo(0.1, 10);
	});

	it('is a certain mulligan with no Basic Pokémon', () => {
		const odds = handOdds([{ card: trainer('Iono', ['Supporter']), quantity: 60 }]);

		expect(odds.mulligan).toBe(1);
		expect(odds.expectedMulligans).toBe(Infinity);
	});

	it('lists the kinds of card in decklist order and drops the empty ones', () => {
		const odds = handOdds([
			{ card: pokemon('Pikachu', ['Basic']), quantity: 10 },
			{ card: pokemon('Raichu', ['Stage1'], { evolvesFrom: 'Pikachu' }), quantity: 4 },
			{ card: trainer('Iono', ['Supporter']), quantity: 8 },
			{ card: energy('Lightning Energy'), quantity: 38 }
		]);

		expect(odds.rows.map((row) => [row.label, row.copies])).toEqual([
			['Basic Pokémon', 10],
			['Supporter', 8],
			['Energy', 38]
		]);
		expect(odds.rows[1].chance).toBeCloseTo(chanceOfAtLeastOne(8, 60, 7), 10);
	});

	it('counts an evolution card as neither a Basic nor an opener', () => {
		const odds = handOdds([
			{ card: pokemon('Charmeleon', ['Stage1'], { evolvesFrom: 'Charmander' }), quantity: 60 }
		]);

		expect(odds.basicPokemon).toBe(0);
		expect(odds.rows).toEqual([]);
	});
});

describe('tallyHand', () => {
	it('adds a hand and its mulligans to the running count', () => {
		const test = openingHand(deck(4, 20), scripted([0.5, 0.2, 0.8]));

		expect(tallyHand({ hands: 2, mulligans: 1 }, test)).toEqual({
			hands: 3,
			mulligans: 1 + test.mulligans.length
		});
	});
});
