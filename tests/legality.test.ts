import { describe, expect, it } from 'vitest';
import { checkLegality } from '../src/lib/tcg/legality';
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

	it('respects standard set legality', () => {
		const rules = parseRules({ deckSize: { min: 1, max: 1 }, pool: { type: 'standard' } });
		const rotated = makeCard({
			name: 'Old Card',
			set: makeSet({
				id: 'swsh1',
				name: 'Sword & Shield',
				ptcglCode: 'SSH',
				legalStandard: false
			})
		});

		expect(checkLegality([{ card: rotated, quantity: 1 }], rules).legal).toBe(false);
	});
});
