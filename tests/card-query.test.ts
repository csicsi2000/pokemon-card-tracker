import { describe, expect, it } from 'vitest';
import { cardQuery, lookupCardCode } from '../src/lib/tcg/card-query';
import { searchCards } from '../src/lib/catalogue-index';
import { makeCard, makeCatalogue, makeSet } from './helpers';

const meg = makeSet({ id: 'me01', name: 'Mega Evolution', ptcglCode: 'MEG', releaseDate: '2025-09-26' });
const pal = makeSet({ id: 'sv02', name: 'Paldea Evolved', ptcglCode: 'PAL', releaseDate: '2023-06-09' });
const promo = makeSet({ id: 'swshp', name: 'SWSH Promos', ptcglCode: 'PR-SW', releaseDate: '2020-02-07' });

const numel = makeCard({ name: 'Numel', localId: '021', set: meg });
const bulbasaur = makeCard({ name: 'Bulbasaur', localId: '001', set: meg });
const pikachu = makeCard({ name: 'Pikachu', localId: '188', set: pal });
const charmander = makeCard({ name: 'Charmander', localId: 'SWSH092', set: promo });
const porygon = makeCard({ name: 'Porygon2', localId: '130', set: pal });
// Same prefix as the name "Porygon2", so a sloppy split would send that query here.
const por = makeSet({ id: 'me02', name: 'Perfect Order', ptcglCode: 'POR', releaseDate: '2026-02-06' });
const ariados = makeCard({ name: 'Ariados', localId: '002', set: por });

const catalogue = makeCatalogue([numel, bulbasaur, pikachu, charmander, porygon, ariados]);

describe('lookupCardCode', () => {
	it('reads a set code and number with or without a space', () => {
		expect(lookupCardCode(catalogue, 'MEG 21')?.cards[0]).toBe(numel);
		expect(lookupCardCode(catalogue, 'meg21')?.cards[0]).toBe(numel);
		expect(lookupCardCode(catalogue, ' meg 021 ')?.cards[0]).toBe(numel);
	});

	it('accepts raw set ids and punctuation-free promo codes', () => {
		expect(lookupCardCode(catalogue, 'sv02 188')?.cards[0]).toBe(pikachu);
		expect(lookupCardCode(catalogue, 'PR-SW 92')?.cards[0]).toBe(charmander);
		expect(lookupCardCode(catalogue, 'prsw92')?.cards[0]).toBe(charmander);
	});

	it('prefers the split that names a real set', () => {
		// "meg2" and "me" are not sets, so the reading has to be MEG #1.
		expect(lookupCardCode(catalogue, 'meg1')?.cards[0]).toBe(bulbasaur);
	});

	it('reports a known set with no such number', () => {
		const miss = lookupCardCode(catalogue, 'MEG 999');
		expect(miss?.set).toBe(meg);
		expect(miss?.cards).toEqual([]);
	});

	it('is null for names and unknown codes', () => {
		expect(lookupCardCode(catalogue, 'Pikachu')).toBeNull();
		expect(lookupCardCode(catalogue, 'Mega Venusaur ex')).toBeNull();
		expect(lookupCardCode(catalogue, 'zzz 21')).toBeNull();
	});

	it('does not read a name that ends in a digit as a code', () => {
		expect(lookupCardCode(catalogue, 'Porygon2')).toBeNull();
		expect(searchCards(catalogue, { query: 'porygon2' })).toEqual([porygon]);
	});

	it('takes a lettered number only when a space separates it', () => {
		expect(lookupCardCode(catalogue, 'PR-SW SWSH092')?.cards[0]).toBe(charmander);
		expect(lookupCardCode(catalogue, 'swsh092')).toBeNull();
	});
});

describe('cardQuery', () => {
	it('matches everything when the query is empty', () => {
		expect(cardQuery(catalogue, '').matches(pikachu)).toBe(true);
		expect(cardQuery(catalogue, '   ').matches(pikachu)).toBe(true);
	});

	it('still matches names', () => {
		const { matches } = cardQuery(catalogue, 'pika');
		expect(matches(pikachu)).toBe(true);
		expect(matches(numel)).toBe(false);
	});

	it('matches the printing a code names, and nothing else', () => {
		const { matches } = cardQuery(catalogue, 'meg21');
		expect(matches(numel)).toBe(true);
		expect(matches(bulbasaur)).toBe(false);
	});
});

describe('searchCards with a code query', () => {
	it('puts the named printing first', () => {
		expect(searchCards(catalogue, { query: 'meg21' })).toEqual([numel]);
		expect(searchCards(catalogue, { query: 'MEG 21' })).toEqual([numel]);
	});

	it('keeps honouring the other filters', () => {
		expect(searchCards(catalogue, { query: 'meg21', setId: pal.id })).toEqual([]);
		expect(searchCards(catalogue, { query: 'meg21', supertype: 'Trainer' })).toEqual([]);
	});

	it('leaves name search alone', () => {
		expect(searchCards(catalogue, { query: 'pika' })).toEqual([pikachu]);
		expect(searchCards(catalogue, {}).length).toBe(catalogue.cards.length);
	});
});
