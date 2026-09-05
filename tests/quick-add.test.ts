import { describe, expect, it } from 'vitest';
import { parseDecklist } from '../src/lib/tcg/parser';
import {
	looksLikeQuickAdd,
	parseQuickAdd,
	parseQuickAddLine,
	pickVariant,
	resolveQuickAdd
} from '../src/lib/tcg/quick-add';
import { resolveEntry } from '../src/lib/tcg/resolver';
import { plainestVariant, sortVariants, type CardVariant } from '../src/lib/types';
import { makeCard, makeCatalogue, makeSet } from './helpers';

const meg = makeSet({
	id: 'me01',
	name: 'Mega Evolution',
	ptcglCode: 'MEG',
	releaseDate: '2025-09-26'
});
const pal = makeSet({
	id: 'sv02',
	name: 'Paldea Evolved',
	ptcglCode: 'PAL',
	releaseDate: '2023-06-09'
});
const swshPromo = makeSet({
	id: 'swshp',
	name: 'SWSH Promos',
	ptcglCode: null,
	releaseDate: '2020-02-07'
});

const catalogue = makeCatalogue([
	makeCard({ name: 'Bulbasaur', localId: '001', set: meg }),
	makeCard({ name: 'Mega Venusaur ex', localId: '021', set: meg, variants: ['holo'] }),
	makeCard({ name: 'Pikachu', localId: '188', set: pal, variants: ['normal', 'reverse'] }),
	// A rare holo, in the catalogue's letter order (r before h).
	makeCard({ name: 'Tinkaton ex', localId: '105', set: pal, variants: ['reverse', 'holo'] }),
	makeCard({
		name: 'Charizard',
		localId: '004',
		set: pal,
		variants: ['reverse', 'holo', 'normal']
	}),
	makeCard({ name: 'Charmander', localId: 'SWSH092', set: swshPromo })
]);

describe('parseQuickAddLine', () => {
	it('reads the bare form', () => {
		expect(parseQuickAddLine('MEG 21')).toMatchObject({
			quantity: 1,
			setCode: 'MEG',
			number: '21',
			variant: null
		});
	});

	it('reads quantities before or after, in either spelling', () => {
		expect(parseQuickAddLine('3 PAL 188')).toMatchObject({
			quantity: 3,
			setCode: 'PAL',
			number: '188'
		});
		expect(parseQuickAddLine('3x PAL 188')).toMatchObject({ quantity: 3 });
		expect(parseQuickAddLine('PAL 188 x3')).toMatchObject({ quantity: 3 });
		expect(parseQuickAddLine('pal 188 ×2')).toMatchObject({ quantity: 2, setCode: 'PAL' });
	});

	it('reads finish markers and rejects unknown trailing words', () => {
		expect(parseQuickAddLine('2 PAL 188 rh')).toMatchObject({ quantity: 2, variant: 'reverse' });
		expect(parseQuickAddLine('MEG 21 h')).toMatchObject({ variant: 'holo' });
		expect(parseQuickAddLine('BS 4 1st')).toMatchObject({ variant: 'firstEdition' });
		expect(parseQuickAddLine('MEG 21 shiny')).toBeNull();
	});

	it('accepts dashed promo codes and alphanumeric numbers', () => {
		expect(parseQuickAddLine('PR-SW 92')).toMatchObject({ setCode: 'PR-SW', number: '92' });
		expect(parseQuickAddLine('PR-SW SWSH092')).toMatchObject({ number: 'SWSH092' });
		expect(parseQuickAddLine('SVI TG05')).toMatchObject({ number: 'TG05' });
	});

	it('does not mistake a card name for a code', () => {
		expect(parseQuickAddLine('Charizard')).toBeNull();
		expect(parseQuickAddLine('Charizard ex')).toBeNull();
		expect(looksLikeQuickAdd('pika')).toBe(false);
		expect(looksLikeQuickAdd('MEG 21')).toBe(true);
	});
});

describe('parseQuickAdd', () => {
	it('parses one entry per line and warns on the rest', () => {
		const result = parseQuickAdd('MEG 21\n\n3 PAL 188 rh\nnot a line');
		expect(result.entries.map((entry) => entry.lineNumber)).toEqual([1, 3]);
		expect(result.warnings).toEqual(['Line 4: could not read "not a line"']);
	});
});

describe('resolveQuickAdd', () => {
	const resolve = (line: string) => resolveQuickAdd(catalogue, parseQuickAddLine(line)!);

	it('finds a card ignoring zero padding and case', () => {
		expect(resolve('meg 21').card?.name).toBe('Mega Venusaur ex');
		expect(resolve('MEG 001').card?.name).toBe('Bulbasaur');
		expect(resolve('MEG 1').card?.name).toBe('Bulbasaur');
	});

	it('resolves promo sets through the override table and bare numbers', () => {
		expect(resolve('PR-SW 92').card?.name).toBe('Charmander');
		expect(resolve('PR-SW SWSH092').card?.name).toBe('Charmander');
	});

	it('accepts a raw TCGdex set id', () => {
		expect(resolve('sv02 188').card?.name).toBe('Pikachu');
	});

	it('explains unknown codes and missing numbers', () => {
		expect(resolve('ZZZ 1')).toMatchObject({ card: null, note: 'Unknown set code ZZZ' });
		expect(resolve('MEG 999')).toMatchObject({
			card: null,
			set: meg,
			note: 'Mega Evolution has no card #999'
		});
	});
});

describe('pickVariant', () => {
	const pikachu = catalogue.byName.get('pikachu')![0];
	const venusaur = catalogue.byName.get('mega venusaur ex')![0];

	it('uses the requested finish when the printing has it, else falls back sensibly', () => {
		expect(pickVariant(pikachu, 'reverse', 'normal')).toBe('reverse');
		expect(pickVariant(pikachu, null, 'normal')).toBe('normal');
		expect(pickVariant(venusaur, null, 'normal')).toBe('holo');
		expect(pickVariant(venusaur, 'reverse', 'normal')).toBe('holo');
	});

	it('defaults to the plainest finish the printing exists in, not the first listed', () => {
		const tinkaton = catalogue.byName.get('tinkaton ex')![0];
		const charizard = catalogue.byName.get('charizard')![0];
		// Rare holo: the holo is the regular printing, the reverse is the parallel one.
		expect(pickVariant(tinkaton, null, 'normal')).toBe('holo');
		expect(pickVariant(tinkaton, 'firstEdition', 'normal')).toBe('holo');
		expect(pickVariant(tinkaton, 'reverse', 'normal')).toBe('reverse');
		expect(pickVariant(charizard, null, 'normal')).toBe('normal');
		expect(pickVariant(charizard, null, 'promo')).toBe('normal');
	});
});

describe('variant ordering', () => {
	it('sorts plainest first and never mutates the input', () => {
		const input: CardVariant[] = ['reverse', 'firstEdition', 'holo', 'normal', 'promo'];
		expect(sortVariants(input)).toEqual(['normal', 'holo', 'reverse', 'firstEdition', 'promo']);
		expect(input[0]).toBe('reverse');
		expect(plainestVariant(['reverse', 'holo'])).toBe('holo');
		expect(plainestVariant(['holo', 'firstEdition'])).toBe('holo');
		expect(plainestVariant([])).toBe('normal');
	});
});

describe('name-less decklist lines', () => {
	it('the decklist parser reads "3 MEG 21" as set + number with no name', () => {
		const parsed = parseDecklist('3 MEG 21\n1 Pikachu 25');
		expect(parsed.entries[0]).toMatchObject({
			quantity: 3,
			name: '',
			setCode: 'MEG',
			number: '21'
		});
		expect(parsed.entries[1]).toMatchObject({ quantity: 1, name: 'Pikachu 25', setCode: null });
	});

	it('the resolver pins the printing for a name-less line', () => {
		const [entry] = parseDecklist('3 MEG 21').entries;
		const result = resolveEntry(catalogue, entry);
		expect(result.match).toBe('exact');
		expect(result.card?.name).toBe('Mega Venusaur ex');

		const missing = resolveEntry(catalogue, parseDecklist('1 MEG 999').entries[0]);
		expect(missing.match).toBe('unresolved');
	});
});
