import type { Catalogue } from '../src/lib/catalogue';
import type { Card, CardSet } from '../src/lib/types';
import { normalizeName } from '../src/lib/tcg/normalize';

let counter = 0;

export function makeSet(overrides: Partial<CardSet> & { id: string }): CardSet {
	return {
		name: overrides.id,
		series: null,
		ptcglCode: overrides.id.toUpperCase(),
		releaseDate: '2024-01-01',
		cardCount: null,
		imageBase: null,
		symbolUrl: null,
		legalStandard: true,
		legalExpanded: true,
		...overrides
	};
}

export function makeCard(overrides: Partial<Card> & { name: string }): Card {
	counter += 1;
	const set = overrides.set ?? makeSet({ id: `set${counter}` });
	const localId = overrides.localId ?? String(counter);

	return {
		id: overrides.id ?? `${set.id}-${localId}`,
		set,
		localId,
		name: overrides.name,
		nameNormalized: normalizeName(overrides.name),
		supertype: overrides.supertype ?? 'Pokemon',
		subtypes: overrides.subtypes ?? [],
		rarity: overrides.rarity ?? null,
		regulationMark: overrides.regulationMark ?? null,
		hp: overrides.hp ?? null,
		types: overrides.types ?? [],
		evolvesFrom: overrides.evolvesFrom ?? null,
		variants: overrides.variants ?? ['normal'],
		image: overrides.image ?? null
	};
}

/** An in-memory catalogue with the same indexes the real loader builds. */
export function makeCatalogue(cards: Card[]): Catalogue {
	const sets = [...new Map(cards.map((card) => [card.set.id, card.set])).values()];

	const byName = new Map<string, Card[]>();
	for (const card of cards) {
		const bucket = byName.get(card.nameNormalized);
		if (bucket) bucket.push(card);
		else byName.set(card.nameNormalized, [card]);
	}
	for (const bucket of byName.values()) {
		bucket.sort((a, b) => (b.set.releaseDate ?? '').localeCompare(a.set.releaseDate ?? ''));
	}

	const setsByCode = new Map<string, CardSet>();
	for (const set of sets) {
		if (set.ptcglCode) setsByCode.set(set.ptcglCode.toUpperCase(), set);
	}

	return {
		generatedAt: '2026-01-01',
		cards,
		sets,
		byId: new Map(cards.map((card) => [card.id, card])),
		byName,
		setsById: new Map(sets.map((set) => [set.id, set])),
		setsByCode
	};
}
