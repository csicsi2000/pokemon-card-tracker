/**
 * "What do I still need to buy?" — the reason this app exists alongside a spreadsheet.
 *
 * Requirements are per *playable* card (`playKey`): any printing of a Trainer or Energy
 * with that name — any professor's Professor's Research satisfies another — but only
 * Pokémon printings with the same game text, so a Charmander with different attacks does
 * not fill a slot. Ownership sums every such printing and finish the user has. The result
 * is the shortfall, plus the printing that was asked for as a suggestion of what to look for.
 */
import type { Card } from '$lib/types';
import { deckDisplayName } from './normalize';
import { playKey } from './play-key';

export type Requirement = { card: Card; quantity: number };
/** Owned copies of one printing; the card lets us aggregate across printings. */
export type OwnedRow = { card: Pick<Card, 'id' | 'name' | 'supertype' | 'textKey'>; quantity: number };

export type BuylistRow = {
	name: string;
	needed: number;
	owned: number;
	missing: number;
	suggestion: Card;
};

export type Buylist = {
	rows: BuylistRow[];
	totalMissing: number;
	/** How much of the requirement is already covered, 0–1. */
	coverage: number;
};

export function buildBuylist(requirements: Requirement[], owned: OwnedRow[]): Buylist {
	const ownedByName = new Map<string, number>();
	for (const row of owned) {
		const key = playKey(row.card);
		ownedByName.set(key, (ownedByName.get(key) ?? 0) + row.quantity);
	}

	const neededByName = new Map<string, { name: string; needed: number; suggestion: Card }>();
	for (const { card, quantity } of requirements) {
		const key = playKey(card);
		const existing = neededByName.get(key);
		if (existing) {
			existing.needed += quantity;
			// Two characters' Professor's Research: name the card, not either professor.
			if (existing.name !== card.name) existing.name = deckDisplayName(card.name);
		} else {
			neededByName.set(key, { name: card.name, needed: quantity, suggestion: card });
		}
	}

	const rows: BuylistRow[] = [];
	let totalNeeded = 0;
	let totalMissing = 0;

	for (const [key, { name, needed, suggestion }] of neededByName) {
		const owned = ownedByName.get(key) ?? 0;
		const missing = Math.max(0, needed - owned);
		totalNeeded += needed;
		totalMissing += missing;
		if (missing > 0) rows.push({ name, needed, owned, missing, suggestion });
	}

	rows.sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name));

	return {
		rows,
		totalMissing,
		coverage: totalNeeded === 0 ? 1 : (totalNeeded - totalMissing) / totalNeeded
	};
}
