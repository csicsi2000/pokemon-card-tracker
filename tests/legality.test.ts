import { describe, expect, it } from 'vitest';
import { checkLegality, isBasicEnergy, isStandardLegal } from '../src/lib/tcg/legality';
import { parseRules } from '../src/lib/tcg/format-rules';
import { makeCard, makeSet } from './helpers';

const standard = parseRules({ pool: { type: 'all' } });

const filler = (count: number) =>
	Array.from({ length: count }, (_, i) => ({
		card: makeCard({ name: `Filler ${i}` }),
		quantity: 1
	}));

describe('checkLegality', () => {
	it('accepts a 60 card deck within the copy limit', () => {
		const report = checkLegality(filler(60), standard);
		expect(report.legal).toBe(true);
		expect(report.total).toBe(60);
	});

	it('flags the wrong deck size', () => {
		const report = checkLegality(filler(59), standard);
		expect(report.issues.map((i) => i.kind)).toContain('deck-size');
	});

	it('counts copies by name across different printings', () => {
		const entries = [
			{ card: makeCard({ id: 'a-1', name: 'Charmander' }), quantity: 3 },
			{ card: makeCard({ id: 'b-2', name: 'Charmander' }), quantity: 2 },
			...filler(55)
		];

		const report = checkLegality(entries, standard);
		const copies = report.issues.find((i) => i.kind === 'copies');
		expect(copies?.message).toMatch(/5× Charmander/);
	});

	it('exempts basic energy from the copy limit but not special energy', () => {
		const basic = makeCard({ name: 'Fire Energy', supertype: 'Energy' });
		const special = makeCard({ name: 'Double Turbo Energy', supertype: 'Energy', subtypes: ['Special'] });

		const report = checkLegality(
			[
				{ card: basic, quantity: 12 },
				{ card: special, quantity: 6 },
				...filler(42)
			],
			standard
		);

		const names = report.issues.filter((i) => i.kind === 'copies').map((i) => i.cardName);
		expect(names).toEqual(['Double Turbo Energy']);
	});

	it('enforces singleton for a cube', () => {
		const cube = parseRules({
			deckSize: { min: 2, max: 2 },
			singleton: true,
			pool: { type: 'explicit' }
		});
		const card = makeCard({ name: 'Rare Candy' });

		const report = checkLegality([{ card, quantity: 2 }], cube, new Set([card.id]));
		expect(report.issues.map((i) => i.kind)).toContain('copies');
	});

	it('rejects cards outside an explicit pool', () => {
		const cube = parseRules({ deckSize: { min: 1, max: 1 }, pool: { type: 'explicit' } });
		const inPool = makeCard({ name: 'Rare Candy' });
		const outside = makeCard({ name: 'Boss Orders' });

		const report = checkLegality([{ card: outside, quantity: 1 }], cube, new Set([inPool.id]));
		expect(report.issues.map((i) => i.kind)).toContain('pool');
	});

	it('bans every printing of a banned name', () => {
		const rules = parseRules({ deckSize: { min: 1, max: 1 }, bannedNames: ['Lysandre’s Trump Card'] });
		const card = makeCard({ name: "Lysandre's Trump Card" });

		const report = checkLegality([{ card, quantity: 1 }], rules);
		expect(report.issues.map((i) => i.kind)).toContain('banned');
	});

	it('reports a banned name once however many printings the deck holds', () => {
		const rules = parseRules({ deckSize: { min: 2, max: 2 }, bannedNames: ["Lysandre's Trump Card"] });
		const entries = [
			{ card: makeCard({ id: 'xy3-99', name: "Lysandre's Trump Card" }), quantity: 1 },
			{ card: makeCard({ id: 'xy3-118', name: "Lysandre's Trump Card" }), quantity: 1 }
		];

		const report = checkLegality(entries, rules);
		expect(report.issues.filter((i) => i.kind === 'banned')).toHaveLength(1);
	});

	it('decides Standard by regulation mark, not the set flag TCGdex never sets', () => {
		const rules = parseRules({ deckSize: { min: 1, max: 1 }, pool: { type: 'standard' } });
		// The real catalogue: every set says legalStandard false.
		const set = makeSet({ id: 'sv08', name: 'Surging Sparks', ptcglCode: 'SSP', legalStandard: false });
		const current = makeCard({ name: 'Pikachu ex', regulationMark: 'H', set });
		const rotated = makeCard({
			name: 'Old Card',
			regulationMark: 'G',
			set: makeSet({ id: 'sv01', name: 'Scarlet & Violet', ptcglCode: 'SVI', legalStandard: true })
		});
		const unmarked = makeCard({ name: 'Older Card', set: makeSet({ id: 'swsh1', legalStandard: true }) });

		expect(checkLegality([{ card: current, quantity: 1 }], rules).legal).toBe(true);
		expect(checkLegality([{ card: rotated, quantity: 1 }], rules).legal).toBe(false);
		expect(checkLegality([{ card: unmarked, quantity: 1 }], rules).legal).toBe(false);
	});

	it('keeps unmarked basic energy in Standard', () => {
		const rules = parseRules({ deckSize: { min: 1, max: 1 }, pool: { type: 'standard' } });
		const energy = makeCard({ name: 'Basic Fire Energy', supertype: 'Energy', subtypes: ['Normal'] });

		expect(checkLegality([{ card: energy, quantity: 1 }], rules).legal).toBe(true);
	});

	it('reports more than one ACE SPEC or Radiant Pokémon', () => {
		const rules = parseRules({ deckSize: { min: 4, max: 4 } });
		const report = checkLegality(
			[
				{ card: makeCard({ name: 'Prime Catcher', supertype: 'Trainer', rarity: 'ACE SPEC Rare' }), quantity: 1 },
				{ card: makeCard({ name: 'Master Ball', supertype: 'Trainer', rarity: 'ACE SPEC Rare' }), quantity: 1 },
				{ card: makeCard({ name: 'Radiant Greninja' }), quantity: 1 },
				{ card: makeCard({ name: 'Radiant Charizard' }), quantity: 1 }
			],
			rules
		);

		expect(report.issues.map((i) => i.message)).toEqual([
			'Deck has 2 ACE SPEC cards; only one is allowed.',
			'Deck has 2 Radiant Pokémon; only one is allowed.'
		]);
	});

	it("allows one ACE SPEC, and knows Black & White's untagged ones", () => {
		const rules = parseRules({ deckSize: { min: 2, max: 2 } });
		const bw7 = makeSet({ id: 'bw7', name: 'Boundaries Crossed', ptcglCode: 'BCR' });
		const computerSearch = makeCard({ name: 'Computer Search', supertype: 'Trainer', rarity: 'Rare', set: bw7 });
		const aceSpec = makeCard({ name: 'Prime Catcher', supertype: 'Trainer', rarity: 'ACE SPEC Rare' });
		const baseSearch = makeCard({ name: 'Computer Search', supertype: 'Trainer', rarity: 'Rare' });

		expect(checkLegality([{ card: aceSpec, quantity: 1 }, ...filler(1)], rules).legal).toBe(true);
		expect(checkLegality([{ card: computerSearch, quantity: 1 }, { card: aceSpec, quantity: 1 }], rules).legal).toBe(false);
		// Base Set's Computer Search predates ACE SPEC.
		expect(checkLegality([{ card: baseSearch, quantity: 1 }, { card: aceSpec, quantity: 1 }], rules).legal).toBe(true);
	});

	it('holds special energy TCGdex tags as Normal to the copy limit', () => {
		const reversal = makeCard({ name: 'Reversal Energy', supertype: 'Energy', subtypes: ['Normal'] });
		const basic = makeCard({ name: 'Basic Psychic Energy', supertype: 'Energy', subtypes: ['Normal'] });
		const report = checkLegality(
			[{ card: reversal, quantity: 5 }, { card: basic, quantity: 10 }, ...filler(45)],
			standard
		);

		expect(report.issues.filter((i) => i.kind === 'copies').map((i) => i.cardName)).toEqual(['Reversal Energy']);
	});

	it("counts every professor's Professor's Research as one name", () => {
		const entries = [
			{ card: makeCard({ name: "Professor's Research (Professor Oak)", supertype: 'Trainer' }), quantity: 3 },
			{ card: makeCard({ name: "Professor's Research (Professor Magnolia)", supertype: 'Trainer' }), quantity: 2 },
			...filler(55)
		];

		const copies = checkLegality(entries, standard).issues.filter((i) => i.kind === 'copies');
		expect(copies.map((i) => i.message)).toEqual(["5× Professor's Research exceeds the limit of 4."]);
	});
});

describe('isBasicEnergy', () => {
	const energy = (name: string, subtypes: string[]) => makeCard({ name, supertype: 'Energy', subtypes });

	it('goes by name, not the subtype TCGdex sets', () => {
		expect(isBasicEnergy(energy('Fire Energy', ['Basic', 'Normal']))).toBe(true);
		expect(isBasicEnergy(energy('Basic Fairy Energy', ['Normal']))).toBe(true);
		expect(isBasicEnergy(energy('Basic {R} Energy', []))).toBe(true);
		expect(isBasicEnergy(energy('Prism Energy', ['Normal']))).toBe(false);
		expect(isBasicEnergy(energy("Team Rocket's Energy", ['Normal']))).toBe(false);
		expect(isBasicEnergy(energy('Growing Grass Energy', ['Normal']))).toBe(false);
	});

	it('still trusts the Special subtype on the old Darkness and Metal Energy', () => {
		expect(isBasicEnergy(energy('Darkness Energy', ['Special']))).toBe(false);
	});
});

describe('isStandardLegal', () => {
	it('accepts the current marks in either case', () => {
		expect(isStandardLegal(makeCard({ name: 'Oshawott', regulationMark: 'j' }))).toBe(true);
		expect(isStandardLegal(makeCard({ name: 'Oshawott', regulationMark: 'I' }))).toBe(true);
		expect(isStandardLegal(makeCard({ name: 'Oshawott', regulationMark: 'G' }))).toBe(false);
	});
});
