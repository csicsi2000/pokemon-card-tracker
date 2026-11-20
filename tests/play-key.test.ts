import { describe, expect, it } from 'vitest';
import type { CardDetailRow } from '../src/lib/catalogue-format';
import { playKey, pokemonTextKey } from '../src/lib/tcg/play-key';
import { toCardRow, type GqlCard } from '../src/lib/tcg/tcgdex';
import { makeCard } from './helpers';

const ember: CardDetailRow = {
	localId: '1',
	attacks: [{ name: 'Ember', cost: ['Fire'], damage: '30', effect: 'Discard an Energy from this Pokémon.' }]
};

describe('pokemonTextKey', () => {
	it('matches reprints whose wording differs only in punctuation, case or accents', () => {
		const reprint: CardDetailRow = {
			localId: '99',
			illustrator: 'someone else',
			attacks: [{ name: 'EMBER', cost: ['Fire'], damage: '30', effect: 'Discard an Energy from this Pokemon' }]
		};
		expect(pokemonTextKey(60, reprint)).toBe(pokemonTextKey(60, ember));
	});

	it('tells apart different damage, cost, HP or abilities', () => {
		const base = pokemonTextKey(60, ember);
		const withAttack = (attack: Partial<NonNullable<CardDetailRow['attacks']>[number]>) =>
			pokemonTextKey(60, { localId: '1', attacks: [{ ...ember.attacks![0], ...attack }] });

		expect(withAttack({ damage: '40' })).not.toBe(base);
		expect(withAttack({ cost: ['Fire', 'Colorless'] })).not.toBe(base);
		expect(pokemonTextKey(70, ember)).not.toBe(base);
		expect(
			pokemonTextKey(60, { ...ember, abilities: [{ type: 'Ability', name: 'Blaze', effect: 'x' }] })
		).not.toBe(base);
	});

	it('is null when there is no text to compare', () => {
		expect(pokemonTextKey(60, null)).toBeNull();
		expect(pokemonTextKey(60, { localId: '1', illustrator: 'x' })).toBeNull();
	});

	it('is written to Pokémon rows only', () => {
		const gql = (category: string): GqlCard => ({
			id: 's-1',
			localId: '1',
			name: 'Card',
			category,
			hp: 60,
			attacks: ember.attacks
		});
		expect(toCardRow(gql('Pokemon'), 0)[13]).toBe(pokemonTextKey(60, ember));
		expect(toCardRow(gql('Trainer'), 0)).toHaveLength(13);
	});
});

describe('playKey', () => {
	it('is the name for Trainers and Energy, whatever the printing or character', () => {
		const oak = makeCard({ name: "Professor's Research (Professor Oak)", supertype: 'Trainer' });
		const turo = makeCard({ name: "Professor's Research (Professor Turo)", supertype: 'Trainer' });
		expect(playKey(oak)).toBe(playKey(turo));
	});

	it('is name plus text for Pokémon', () => {
		const a = makeCard({ name: 'Pikachu', textKey: 'k1' });
		const b = makeCard({ name: 'Pikachu', textKey: 'k1' });
		const c = makeCard({ name: 'Pikachu', textKey: 'k2' });
		expect(playKey(a)).toBe(playKey(b));
		expect(playKey(a)).not.toBe(playKey(c));
		expect(playKey(makeCard({ name: 'Raichu', textKey: 'k1' }))).not.toBe(playKey(a));
	});

	it('falls back to the printing itself for a Pokémon with no known text', () => {
		const a = makeCard({ name: 'Mew' });
		const b = makeCard({ name: 'Mew' });
		expect(playKey(a)).not.toBe(playKey(b));
	});
});
