import { describe, expect, it } from 'vitest';
import { deckStats, deckTips, isBasicPokemon, MIN_TIP_SIZE } from '../src/lib/tcg/deck-stats';
import { parseRules } from '../src/lib/tcg/format-rules';
import type { DeckEntry } from '../src/lib/tcg/legality';
import { makeCard } from './helpers';

const pokemon = (name: string, subtypes: string[], extra = {}) =>
	makeCard({ name, supertype: 'Pokemon', subtypes, ...extra });
const trainer = (name: string, subtypes: string[]) =>
	makeCard({ name, supertype: 'Trainer', subtypes });
const energy = (name: string, subtypes: string[]) =>
	makeCard({ name, supertype: 'Energy', subtypes });

const group = (entries: DeckEntry[], supertype: string) =>
	deckStats(entries).groups.find((g) => g.supertype === supertype)!;

describe('deckStats', () => {
	it('counts each supertype and its share of the deck', () => {
		const entries: DeckEntry[] = [
			{ card: pokemon('Charmander', ['Basic']), quantity: 4 },
			{ card: trainer('Iono', ['Supporter']), quantity: 4 },
			{ card: energy('Fire Energy', ['Normal']), quantity: 2 }
		];

		const stats = deckStats(entries);

		expect(stats.total).toBe(10);
		expect(stats.groups.map((g) => [g.label, g.count])).toEqual([
			['Pokémon', 4],
			['Trainer', 4],
			['Energy', 2]
		]);
		expect(stats.groups[2].share).toBeCloseTo(0.2);
	});

	it('breaks Pokémon down by stage and drops the empty buckets', () => {
		const entries: DeckEntry[] = [
			{ card: pokemon('Charmander', ['Basic']), quantity: 4 },
			{ card: pokemon('Charmeleon', ['Stage1'], { evolvesFrom: 'Charmander' }), quantity: 2 },
			{
				card: pokemon('Charizard ex', ['Stage2', 'ex'], { evolvesFrom: 'Charmeleon' }),
				quantity: 3
			}
		];

		expect(group(entries, 'Pokemon').breakdown).toEqual([
			{ label: 'Basic', count: 4 },
			{ label: 'Stage 1', count: 2 },
			{ label: 'Stage 2', count: 3 }
		]);
	});

	it('breaks Trainers down by kind in decklist order', () => {
		const entries: DeckEntry[] = [
			{ card: trainer('Area Zero Underdepths', ['Stadium']), quantity: 2 },
			{ card: trainer('Ultra Ball', ['Item']), quantity: 4 },
			{ card: trainer('Iono', ['Supporter']), quantity: 3 },
			{ card: trainer('Bravery Charm', ['Tool']), quantity: 1 },
			{ card: trainer('Bill', []), quantity: 1 }
		];

		expect(group(entries, 'Trainer').breakdown).toEqual([
			{ label: 'Supporter', count: 3 },
			{ label: 'Item', count: 4 },
			{ label: 'Tool', count: 1 },
			{ label: 'Stadium', count: 2 },
			{ label: 'Other', count: 1 }
		]);
	});

	it('splits basic energy from special energy', () => {
		const entries: DeckEntry[] = [
			{ card: energy('Fire Energy', ['Basic', 'Normal']), quantity: 8 },
			{ card: energy('Double Turbo Energy', ['Special']), quantity: 4 }
		];

		expect(group(entries, 'Energy').breakdown).toEqual([
			{ label: 'Basic', count: 8 },
			{ label: 'Special', count: 4 }
		]);
	});

	it('counts the energy types the Pokémon ask for, ignoring Colorless', () => {
		const entries: DeckEntry[] = [
			{ card: pokemon('Charmander', ['Basic'], { types: ['Fire'] }), quantity: 4 },
			{ card: pokemon('Squirtle', ['Basic'], { types: ['Water'] }), quantity: 1 },
			{ card: pokemon('Pidove', ['Basic'], { types: ['Colorless'] }), quantity: 3 }
		];

		expect(deckStats(entries).types).toEqual([
			{ type: 'Fire', count: 4 },
			{ type: 'Water', count: 1 }
		]);
	});

	it('counts names across printings, and one-ofs excluding basic energy', () => {
		const entries: DeckEntry[] = [
			{ card: pokemon('Charmander', ['Basic']), quantity: 2 },
			{ card: pokemon('Charmander', ['Basic']), quantity: 2 }, // a second printing
			{ card: trainer('Boss’s Orders', ['Supporter']), quantity: 1 },
			{ card: energy('Fire Energy', ['Normal']), quantity: 1 }
		];

		const stats = deckStats(entries);

		expect(stats.distinctNames).toBe(3);
		expect(stats.singleCopyNames).toBe(1);
	});

	it('is empty-safe', () => {
		const stats = deckStats([]);
		expect(stats.total).toBe(0);
		expect(stats.groups.map((g) => g.count)).toEqual([0, 0, 0]);
		expect(stats.groups.every((g) => g.share === 0)).toBe(true);
	});
});

describe('isBasicPokemon', () => {
	it('reads the subtype when there is one', () => {
		expect(isBasicPokemon(pokemon('Charmander', ['Basic']))).toBe(true);
		expect(isBasicPokemon(pokemon('Charmeleon', ['Stage1'], { evolvesFrom: 'Charmander' }))).toBe(
			false
		);
	});

	it('falls back to "nothing evolves into it" for cards printed before subtypes', () => {
		expect(isBasicPokemon(pokemon('Pikachu', []))).toBe(true);
		expect(isBasicPokemon(pokemon('M Rayquaza EX', ['MEGA'], { evolvesFrom: 'Rayquaza EX' }))).toBe(
			false
		);
	});

	it('does not count V-UNION, which is assembled from the discard', () => {
		expect(isBasicPokemon(pokemon('Mewtwo V-UNION', ['V-UNION']))).toBe(false);
	});

	it('is false for anything that is not a Pokémon', () => {
		expect(isBasicPokemon(energy('Fire Energy', ['Basic']))).toBe(false);
	});
});

/** A serviceable 60-card list, so each tip test only has to break one thing. */
function healthyDeck(): DeckEntry[] {
	return [
		{ card: pokemon('Charmander', ['Basic'], { types: ['Fire'] }), quantity: 4 },
		{ card: pokemon('Fezandipiti ex', ['Basic'], { types: ['Darkness'] }), quantity: 1 },
		{ card: pokemon('Pidgey', ['Basic'], { types: ['Colorless'] }), quantity: 5 },
		{
			card: pokemon('Charizard ex', ['Stage2'], { evolvesFrom: 'Charmeleon', types: ['Fire'] }),
			quantity: 3
		},
		{ card: trainer('Iono', ['Supporter']), quantity: 10 },
		{ card: trainer('Ultra Ball', ['Item']), quantity: 20 },
		{ card: energy('Fire Energy', ['Normal']), quantity: 17 }
	];
}

describe('deckTips', () => {
	const ids = (entries: DeckEntry[], rules = parseRules({})) =>
		deckTips(deckStats(entries), rules).map((tip) => tip.id);

	it('says nothing about a deck that is still being assembled', () => {
		const stub: DeckEntry[] = [{ card: pokemon('Charmander', ['Stage1']), quantity: 12 }];
		expect(deckStats(stub).total).toBeLessThan(MIN_TIP_SIZE);
		expect(ids(stub)).toEqual([]);
	});

	it('finds nothing to flag in a reasonable list', () => {
		expect(ids(healthyDeck())).toEqual([]);
	});

	it('flags a deck with no Basic Pokémon as unplayable', () => {
		const entries = healthyDeck().map((entry) =>
			isBasicPokemon(entry.card) ? { ...entry, card: pokemon('Charmeleon', ['Stage1']) } : entry
		);

		const tips = deckTips(deckStats(entries), parseRules({}));
		expect(tips[0]).toMatchObject({ id: 'no-basics', tone: 'warn' });
	});

	it('warns about a thin Basic count and puts warnings before hints', () => {
		const entries: DeckEntry[] = [
			{ card: pokemon('Charmander', ['Basic'], { types: ['Fire'] }), quantity: 3 },
			{
				card: pokemon('Charizard ex', ['Stage2'], { evolvesFrom: 'Charmeleon', types: ['Fire'] }),
				quantity: 7
			},
			{ card: trainer('Iono', ['Supporter']), quantity: 10 },
			{ card: trainer('Ultra Ball', ['Item']), quantity: 25 },
			{ card: energy('Fire Energy', ['Normal']), quantity: 15 }
		];

		const tips = deckTips(deckStats(entries), parseRules({}));
		expect(tips.map((tip) => tip.id)).toContain('few-basics');
		expect(tips[0].tone).toBe('warn');
		expect(tips[0].message).toContain('3 Basic Pokémon');
	});

	it('warns when there are no Supporters at all', () => {
		const entries = healthyDeck().map((entry) =>
			entry.card.subtypes.includes('Supporter')
				? { ...entry, card: trainer('Nest Ball', ['Item']) }
				: entry
		);

		expect(ids(entries)).toContain('no-supporters');
	});

	it('scales its thresholds to the size of the deck', () => {
		// The same shape at 40 cards: two thirds of everything, so nothing should fire.
		const forty: DeckEntry[] = [
			{ card: pokemon('Charmander', ['Basic'], { types: ['Fire'] }), quantity: 7 },
			{
				card: pokemon('Charizard ex', ['Stage2'], { evolvesFrom: 'Charmeleon', types: ['Fire'] }),
				quantity: 2
			},
			{ card: trainer('Iono', ['Supporter']), quantity: 7 },
			{ card: trainer('Ultra Ball', ['Item']), quantity: 13 },
			{ card: energy('Fire Energy', ['Normal']), quantity: 11 }
		];

		expect(ids(forty, parseRules({ deckSize: { min: 40, max: 40 } }))).toEqual([]);
	});

	it('does not tell a singleton format to play more copies', () => {
		const singles: DeckEntry[] = Array.from({ length: 40 }, (_, index) => ({
			card:
				index < 12
					? pokemon(`Mon ${index}`, ['Basic'], { types: ['Fire'] })
					: trainer(`Item ${index}`, ['Item']),
			quantity: 1
		}));
		singles.push({ card: trainer('Iono', ['Supporter']), quantity: 6 });
		singles.push({ card: energy('Fire Energy', ['Normal']), quantity: 8 });

		expect(ids(singles, parseRules({ singleton: true, maxCopiesPerName: 1 }))).not.toContain(
			'many-singles'
		);
		expect(ids(singles)).toContain('many-singles');
	});

	it('mentions the deck size only when no format is checking it', () => {
		const entries = [...healthyDeck(), { card: trainer('Nest Ball', ['Item']), quantity: 2 }];

		expect(deckTips(deckStats(entries), null).map((tip) => tip.id)).toContain('not-sixty');
		expect(ids(entries)).not.toContain('not-sixty');
	});
});
