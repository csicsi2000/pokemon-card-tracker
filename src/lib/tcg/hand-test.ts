/**
 * Goldfishing a deck: shuffle it, deal an opening hand — mulligan or not — set six
 * prizes aside and draw turn by turn.
 *
 * Pure functions over the same `DeckEntry[]` the legality check and the summary work
 * on, with the shuffle's randomness injected so the tests can deal a known hand. Every
 * step returns a fresh `HandTest` rather than mutating one, so a component can keep the
 * previous hand around (the mulligans are exactly that) without copying it itself.
 *
 * The odds beside the sampled hands are hypergeometric — drawing without replacement —
 * which is why they are computed as a running product instead of with factorials: a
 * 60-card deck overflows a double long before the binomials cancel.
 */
import type { Card } from '$lib/types';
import { isBasicPokemon } from './deck-stats';
import type { DeckEntry } from './legality';

/** Cards dealt at the start of the game. */
export const HAND_SIZE = 7;

/** Prizes set aside before the first turn. */
export const PRIZE_COUNT = 6;

/** `Math.random`'s contract: a number in [0, 1). */
export type Rng = () => number;

export type HandTest = {
	/** The hand, in the order it was drawn, opening seven first. */
	hand: Card[];
	/** What has been drawn since the opening hand, oldest first. */
	drawn: Card[];
	/** Face down in a real game; here they are the answer to "was it prized?". */
	prizes: Card[];
	/** The rest of the deck, top card first. */
	library: Card[];
	/**
	 * No Basic Pokémon in the hand: in a game it would go back, the opponent would draw
	 * a card and you would deal again. Dealt and shown all the same — a hand you never
	 * see teaches you nothing about the list that produced it.
	 */
	mulligan: boolean;
	/**
	 * False only when the deck has no Basic Pokémon at all — then no shuffle can
	 * produce a hand you could start the game on, and every deal is a mulligan.
	 */
	keepable: boolean;
};

/** One entry per physical card, so the shuffle treats four copies as four cards. */
export function deckPile(entries: DeckEntry[]): Card[] {
	return entries.flatMap(({ card, quantity }) =>
		Array.from({ length: Math.max(0, Math.trunc(quantity)) }, () => card)
	);
}

/** Fisher–Yates over a copy: the caller's array is left alone. */
export function shuffle(cards: Card[], rng: Rng = Math.random): Card[] {
	const pile = [...cards];
	for (let i = pile.length - 1; i > 0; i -= 1) {
		const j = Math.floor(rng() * (i + 1));
		[pile[i], pile[j]] = [pile[j], pile[i]];
	}
	return pile;
}

/**
 * Shuffle, deal seven, set the prizes aside. Exactly one hand per call, mulligan or
 * not: a hand with no Basic Pokémon is flagged rather than thrown away, because the
 * rough hands are the ones worth looking at. Dealing again is the caller's to decide.
 *
 * A deck shorter than a full hand still deals — testing a list you are halfway through
 * writing is the point — it just deals everything it has and takes no prizes.
 */
export function openingHand(entries: DeckEntry[], rng: Rng = Math.random): HandTest {
	const pile = deckPile(entries);
	const shuffled = shuffle(pile, rng);
	const hand = shuffled.slice(0, HAND_SIZE);
	const rest = shuffled.slice(hand.length);

	return {
		hand,
		drawn: [],
		prizes: rest.slice(0, PRIZE_COUNT),
		library: rest.slice(PRIZE_COUNT),
		mulligan: !hand.some(isBasicPokemon),
		keepable: pile.some(isBasicPokemon)
	};
}

/**
 * Draw off the top, as a turn does. Drawing past the end of the deck stops at the last
 * card: losing the game there is a rule, not a shuffle, and this is practice.
 */
export function draw(test: HandTest, count = 1): HandTest {
	const taken = test.library.slice(0, Math.max(0, count));
	if (taken.length === 0) return test;
	return {
		...test,
		hand: [...test.hand, ...taken],
		drawn: [...test.drawn, ...taken],
		library: test.library.slice(taken.length)
	};
}

const SUPERTYPE_ORDER = { Pokemon: 0, Trainer: 1, Energy: 2 };

/**
 * A hand arrives in draw order, which tells you nothing; sorted the way a decklist is
 * written, you can read it at a glance. Display only — the test keeps the real order.
 */
export function sortHand(cards: Card[]): Card[] {
	return [...cards].sort(
		(a, b) =>
			SUPERTYPE_ORDER[a.supertype] - SUPERTYPE_ORDER[b.supertype] || a.name.localeCompare(b.name)
	);
}

/**
 * Chance that `draws` cards off the top of a `deckSize` deck include at least one of
 * the `copies` you care about. The complement — every draw missing them — is a short
 * product, so nothing here can overflow.
 */
export function chanceOfAtLeastOne(copies: number, deckSize: number, draws: number): number {
	if (deckSize <= 0 || draws <= 0 || copies <= 0) return 0;
	if (copies >= deckSize || draws >= deckSize) return 1;

	let miss = 1;
	for (let i = 0; i < draws; i += 1) {
		miss *= (deckSize - copies - i) / (deckSize - i);
		if (miss <= 0) return 1;
	}
	return 1 - miss;
}

export type OddsRow = {
	label: string;
	/** Copies in the deck — the chance means nothing without it. */
	copies: number;
	/** Chance a freshly dealt seven holds at least one, 0–1. */
	chance: number;
};

export type HandOdds = {
	deckSize: number;
	basicPokemon: number;
	/** Chance a freshly dealt seven holds no Basic Pokémon, 0–1. */
	mulligan: number;
	/** Mulligans to expect before a keepable hand — the mean of the geometric tail. */
	expectedMulligans: number;
	/** Chance any one given card sits in the six prizes, 0–1. */
	prized: number;
	/** The kinds of card whose absence stalls a turn one, in decklist order, empties dropped. */
	rows: OddsRow[];
};

const hasSubtype = (card: Card, subtype: string) => card.subtypes.includes(subtype);

/**
 * What to expect before you deal, so a run of rough hands can be read as luck or as the
 * list. Every figure is for a fresh seven, before any mulligan — after one, the chance
 * of a Basic Pokémon is 1 by definition and there is nothing to report.
 */
export function handOdds(entries: DeckEntry[]): HandOdds {
	const deckSize = entries.reduce((sum, entry) => sum + Math.max(0, Math.trunc(entry.quantity)), 0);

	let basicPokemon = 0;
	let supporters = 0;
	let items = 0;
	let energy = 0;

	for (const { card, quantity } of entries) {
		const copies = Math.max(0, Math.trunc(quantity));
		if (isBasicPokemon(card)) basicPokemon += copies;
		if (card.supertype === 'Trainer') {
			if (hasSubtype(card, 'Supporter')) supporters += copies;
			else if (hasSubtype(card, 'Item')) items += copies;
		}
		if (card.supertype === 'Energy') energy += copies;
	}

	const mulligan = 1 - chanceOfAtLeastOne(basicPokemon, deckSize, HAND_SIZE);

	const rows: OddsRow[] = [
		{ label: 'Basic Pokémon', copies: basicPokemon },
		{ label: 'Supporter', copies: supporters },
		{ label: 'Item', copies: items },
		{ label: 'Energy', copies: energy }
	]
		.filter((row) => row.copies > 0)
		.map((row) => ({ ...row, chance: chanceOfAtLeastOne(row.copies, deckSize, HAND_SIZE) }));

	return {
		deckSize,
		basicPokemon,
		mulligan,
		// Failures before the first success. A deck with no Basics never succeeds, and an
		// infinite expectation is not a number worth showing — the UI keys off `keepable`.
		expectedMulligans: mulligan >= 1 ? Infinity : mulligan / (1 - mulligan),
		prized: deckSize <= 0 ? 0 : Math.min(1, PRIZE_COUNT / deckSize),
		rows
	};
}

/** Kept by the component across hands, so a run of hands says more than one hand does. */
export type HandTally = { hands: number; mulligans: number };

export function tallyHand(tally: HandTally, test: HandTest): HandTally {
	return { hands: tally.hands + 1, mulligans: tally.mulligans + (test.mulligan ? 1 : 0) };
}
