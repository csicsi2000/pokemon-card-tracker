/**
 * Deck legality against a format. Pure functions — everything they need is passed in.
 *
 * Copy limits count by card NAME, not by printing: four Charmander from four
 * different sets is still four Charmander.
 */
import type { Card } from '$lib/types';
import type { FormatRules } from './format-rules';
import { normalizeName } from './normalize';

export type DeckEntry = { card: Card; quantity: number };

export type LegalityIssue = {
	kind: 'deck-size' | 'copies' | 'banned' | 'pool';
	message: string;
	cardName?: string;
};

export type LegalityReport = {
	legal: boolean;
	total: number;
	issues: LegalityIssue[];
};

export const isBasicEnergy = (card: Card) =>
	card.supertype === 'Energy' && !card.subtypes.includes('Special');

/** Sums quantities per card name — the unit every copy rule works in. */
export function countByName(entries: DeckEntry[]) {
	const counts = new Map<string, { name: string; quantity: number; basicEnergy: boolean }>();

	for (const { card, quantity } of entries) {
		const key = normalizeName(card.name);
		const existing = counts.get(key);
		if (existing) existing.quantity += quantity;
		else counts.set(key, { name: card.name, quantity, basicEnergy: isBasicEnergy(card) });
	}

	return counts;
}

export function isInPool(card: Card, rules: FormatRules, poolCardIds?: Set<string>) {
	switch (rules.pool.type) {
		case 'all':
			return true;
		case 'sets':
			return rules.pool.setIds.includes(card.set.id);
		case 'explicit':
			return poolCardIds?.has(card.id) ?? false;
		case 'standard':
			return card.set.legalStandard;
		case 'expanded':
			return card.set.legalExpanded;
	}
}

export function checkLegality(
	entries: DeckEntry[],
	rules: FormatRules,
	/** Card ids in the format's explicit pool — only needed for pool type 'explicit'. */
	poolCardIds?: Set<string>
): LegalityReport {
	const issues: LegalityIssue[] = [];
	const total = entries.reduce((sum, entry) => sum + entry.quantity, 0);

	if (total < rules.deckSize.min || total > rules.deckSize.max) {
		const range =
			rules.deckSize.min === rules.deckSize.max
				? `${rules.deckSize.min}`
				: `${rules.deckSize.min}–${rules.deckSize.max}`;
		issues.push({ kind: 'deck-size', message: `Deck has ${total} cards, format wants ${range}.` });
	}

	const limit = rules.singleton ? 1 : rules.maxCopiesPerName;
	for (const { name, quantity, basicEnergy } of countByName(entries).values()) {
		if (basicEnergy && rules.basicEnergyExempt) continue;
		if (quantity > limit) {
			issues.push({
				kind: 'copies',
				cardName: name,
				message: `${quantity}× ${name} exceeds the limit of ${limit}.`
			});
		}
	}

	const banned = new Set(rules.bannedNames.map(normalizeName));
	for (const { card } of entries) {
		if (banned.has(normalizeName(card.name))) {
			issues.push({ kind: 'banned', cardName: card.name, message: `${card.name} is banned.` });
		}
	}

	for (const { card } of entries) {
		if (!isInPool(card, rules, poolCardIds)) {
			issues.push({
				kind: 'pool',
				cardName: card.name,
				message: `${card.name} (${card.set.ptcglCode ?? card.set.id}) is outside the card pool.`
			});
		}
	}

	return { legal: issues.length === 0, total, issues };
}
