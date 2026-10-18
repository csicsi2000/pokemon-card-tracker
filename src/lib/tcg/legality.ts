/**
 * Deck legality against a format. Pure functions — everything they need is passed in.
 *
 * Copy limits count by card NAME, not by printing: four Charmander from four
 * different sets is still four Charmander.
 */
import type { Card } from '$lib/types';
import type { FormatRules } from './format-rules';
import { deckDisplayName, deckNameKey, normalizeName } from './normalize';

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

/** "Fire Energy", "Basic Fire Energy", "Basic {R} Energy" — the nine basic types only. */
const BASIC_ENERGY_NAME =
	/^(?:basic )?(?:grass|fire|water|lightning|psychic|fighting|darkness|metal|fairy|[grwlpfdmy]) energy$/;

/**
 * Basic energy is exempt from copy limits, so a special one must never pass. TCGdex tags
 * many specials 'Normal' (Reversal, Prism, Team Rocket's, the typed Mega Evolution ones),
 * so the name decides; the subtype still catches the old Special Darkness and Metal
 * Energy, which share a basic's name.
 */
export const isBasicEnergy = (card: Card) =>
	card.supertype === 'Energy' &&
	!card.subtypes.includes('Special') &&
	BASIC_ENERGY_NAME.test(normalizeName(card.name));

/**
 * Regulation marks legal in Standard. TCGdex's per-set `legal.standard` flag is false for
 * every set, so Standard goes by the mark printed on the card instead.
 *
 * UPDATE AT EACH ROTATION: drop the mark that rotates out, add the newest. Current as of
 * the April 2026 rotation (G out), which leaves H, I and J.
 */
export const STANDARD_REGULATION_MARKS: ReadonlySet<string> = new Set(['H', 'I', 'J']);

/** Standard-legal: a current regulation mark, or basic energy, which never rotates. */
export const isStandardLegal = (card: Card) =>
	isBasicEnergy(card) || STANDARD_REGULATION_MARKS.has(card.regulationMark?.toUpperCase() ?? '');

/** Sums quantities per card name — the unit every copy rule works in. */
export function countByName(entries: DeckEntry[]) {
	const counts = new Map<string, { name: string; quantity: number; basicEnergy: boolean }>();

	for (const { card, quantity } of entries) {
		const key = deckNameKey(card.name);
		const existing = counts.get(key);
		if (existing) existing.quantity += quantity;
		else counts.set(key, { name: deckDisplayName(card.name), quantity, basicEnergy: isBasicEnergy(card) });
	}

	return counts;
}

/**
 * Black & White's ACE SPECs, which TCGdex files as plain 'Rare'. Scoped to the bw sets:
 * Computer Search and Master Ball were ordinary Trainers before then.
 */
const BW_ACE_SPECS = new Set(
	[
		'Computer Search',
		'Crystal Edge',
		'Crystal Wall',
		'Gold Potion',
		'Dowsing Machine',
		'Scramble Switch',
		'Victory Piece',
		'Life Dew',
		'Rock Guard',
		'Master Ball',
		'G Booster',
		'G Scope'
	].map(normalizeName)
);

export const isAceSpec = (card: Card) =>
	card.rarity === 'ACE SPEC Rare' ||
	(card.set.id.startsWith('bw') && BW_ACE_SPECS.has(normalizeName(card.name)));

export const isRadiant = (card: Card) =>
	card.supertype === 'Pokemon' && card.name.startsWith('Radiant ');

/**
 * Rules printed on the cards themselves, so they hold in every format — a cube that
 * wants two ACE SPECs is a house rule this does not model.
 */
const ONE_PER_DECK: { label: string; test: (card: Card) => boolean }[] = [
	{ label: 'ACE SPEC cards', test: isAceSpec },
	{ label: 'Radiant Pokémon', test: isRadiant }
];

export function isInPool(card: Card, rules: FormatRules, poolCardIds?: Set<string>) {
	switch (rules.pool.type) {
		case 'all':
			return true;
		case 'sets':
			return rules.pool.setIds.includes(card.set.id);
		case 'explicit':
			return poolCardIds?.has(card.id) ?? false;
		case 'standard':
			return isStandardLegal(card);
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

	for (const { label, test } of ONE_PER_DECK) {
		const count = entries.reduce((sum, { card, quantity }) => sum + (test(card) ? quantity : 0), 0);
		if (count > 1) {
			issues.push({ kind: 'copies', message: `Deck has ${count} ${label}; only one is allowed.` });
		}
	}

	// One issue per name (banned) or name and set (pool), however many printings the deck holds.
	const reported = new Set<string>();
	const report = (issue: LegalityIssue) => {
		if (reported.has(issue.message)) return;
		reported.add(issue.message);
		issues.push(issue);
	};

	const banned = new Set(rules.bannedNames.map(deckNameKey));
	for (const { card } of entries) {
		if (banned.has(deckNameKey(card.name))) {
			const name = deckDisplayName(card.name);
			report({ kind: 'banned', cardName: name, message: `${name} is banned.` });
		}
	}

	for (const { card } of entries) {
		if (!isInPool(card, rules, poolCardIds)) {
			report({
				kind: 'pool',
				cardName: card.name,
				message: `${card.name} (${card.set.ptcglCode ?? card.set.id}) is outside the card pool.`
			});
		}
	}

	return { legal: issues.length === 0, total, issues };
}
