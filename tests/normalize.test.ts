import { describe, expect, it } from 'vitest';
import { deckDisplayName, deckNameKey, normalizeName } from '../src/lib/tcg/normalize';

describe('normalizeName', () => {
	it('keeps Nidoran♂ and Nidoran♀ apart', () => {
		expect(normalizeName('Nidoran♂')).not.toBe(normalizeName('Nidoran♀'));
		expect(normalizeName('Nidoran♂')).toBe(normalizeName('Nidoran ♂'));
		expect(normalizeName('Nidoran♀')).toBe(normalizeName('Nidoran F'));
	});

	it('still folds accents and punctuation', () => {
		expect(normalizeName('Pokémon Catcher')).toBe('pokemon catcher');
		expect(normalizeName('Boss’s Orders')).toBe(normalizeName("Boss's Orders"));
	});
});

describe('deckNameKey', () => {
	it("drops the character TCGdex adds to a reprint's name", () => {
		expect(deckNameKey("Professor's Research (Professor Oak)")).toBe(deckNameKey("Professor's Research"));
		expect(deckNameKey("Boss's Orders (Giovanni)")).toBe(deckNameKey("Boss’s Orders (Lysandre)"));
		expect(deckDisplayName("Professor's Research (Professor Magnolia)")).toBe("Professor's Research");
	});

	it('keeps a parenthetical that is part of the card', () => {
		expect(deckNameKey('PokéDex (HANDY909)')).not.toBe(deckNameKey('Pokédex'));
	});
});
