import { describe, expect, it } from 'vitest';
import { energyArt, energyType, ENERGY_TYPES } from '../src/lib/tcg/energy';
import { makeCard } from './helpers';

const energy = (name: string, extra: { types?: string[]; subtypes?: string[] } = {}) =>
	makeCard({ name, supertype: 'Energy', subtypes: extra.subtypes ?? ['Basic'], types: extra.types });

describe('energyType', () => {
	it('reads the type out of a basic energy name', () => {
		expect(energyType(energy('Fire Energy'))).toBe('Fire');
		expect(energyType(energy('Basic Darkness Energy'))).toBe('Darkness');
		expect(energyType(energy('Lightning Energy'))).toBe('Lightning');
	});

	it('covers every printed type', () => {
		for (const type of ENERGY_TYPES) {
			expect(energyType(energy(`${type} Energy`))).toBe(type);
		}
	});

	it('reads the flavoured basics the newer sets print', () => {
		expect(energyType(energy('Nitro Fire Energy'))).toBe('Fire');
		expect(energyType(energy('Growing Grass Energy'))).toBe('Grass');
		expect(energyType(energy('Telepathic Psychic Energy'))).toBe('Psychic');
		expect(energyType(energy('Voltaic Lightning Energy'))).toBe('Lightning');
	});

	it('understands the PTCGL symbol spelling', () => {
		expect(energyType(energy('Basic {R} Energy'))).toBe('Fire');
		expect(energyType(energy('Basic {W} Energy'))).toBe('Water');
		expect(energyType(energy('Basic {D} Energy'))).toBe('Darkness');
	});

	it('prefers what the catalogue tagged, when it tagged one type', () => {
		expect(energyType(energy('Fairy Energy', { types: ['Fairy'] }))).toBe('Fairy');
	});

	it('falls back to the name when the tags say several things', () => {
		expect(energyType(energy('Fire Energy', { types: ['Fire', 'Water'] }))).toBe('Fire');
	});

	it('gives up on an energy that names no type', () => {
		// Specials TCGdex does not always tag as special, so they reach the same fallback.
		expect(energyType(energy('Rainbow Energy'))).toBeNull();
		expect(energyType(energy('Prism Energy'))).toBeNull();
		expect(energyType(energy("Team Rocket's Energy"))).toBeNull();
		expect(energyType(energy('Reversal Energy'))).toBeNull();
	});

	it('gives up on an energy that names several types', () => {
		expect(energyType(energy('Blend Energy Grass Fire Psychic Darkness'))).toBeNull();
		expect(energyType(energy('Unit Energy GrassFireWater'))).toBeNull();
	});

	it('still types the specials that name exactly one', () => {
		expect(energyType(energy('Double Colorless Energy', { subtypes: ['Special'] }))).toBe(
			'Colorless'
		);
		expect(energyType(energy('Double Dragon Energy', { subtypes: ['Special'] }))).toBe('Dragon');
	});

	it('ignores anything that is not an energy card', () => {
		expect(energyType(makeCard({ name: 'Charizard ex', supertype: 'Pokemon', types: ['Fire'] }))).toBeNull();
		expect(energyType(makeCard({ name: 'Fire Reading', supertype: 'Trainer' }))).toBeNull();
	});
});

describe('energyArt', () => {
	it('has a card picture for every type that was printed as a basic energy', () => {
		const printed = ENERGY_TYPES.filter((type) => type !== 'Dragon' && type !== 'Colorless');
		for (const type of printed) {
			expect(energyArt(type), type).toMatch(/^https:\/\/images\.pokemontcg\.io\/.+\.png$/);
		}
	});

	it('has none for the two types never printed as a basic energy', () => {
		// Both fall through to the drawn pip instead.
		expect(energyArt('Dragon')).toBeNull();
		expect(energyArt('Colorless')).toBeNull();
	});

	it('points each type at its own card', () => {
		const urls = ENERGY_TYPES.map(energyArt).filter(Boolean);
		expect(new Set(urls).size).toBe(urls.length);
		expect(energyArt('Fire')).toBe('https://images.pokemontcg.io/sve/2.png');
	});
});
