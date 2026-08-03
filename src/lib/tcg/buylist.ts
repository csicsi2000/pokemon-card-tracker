/**
 * "What do I still need to buy?" — the reason this app exists alongside a spreadsheet.
 *
 * Requirements are per card NAME (any Charmander printing satisfies "4 Charmander"),
 * and ownership sums every printing and variant the user has. The result is the
 * shortfall, plus the printing that was asked for as a suggestion of what to look for.
 */
import type { Card } from '$lib/types';
import { normalizeName } from './normalize';

export type Requirement = { card: Card; quantity: number };
/** Owned copies of one printing; `name` lets us aggregate across printings. */
export type OwnedRow = { name: string; quantity: number };

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
		const key = normalizeName(row.name);
		ownedByName.set(key, (ownedByName.get(key) ?? 0) + row.quantity);
	}

	const neededByName = new Map<string, { name: string; needed: number; suggestion: Card }>();
	for (const { card, quantity } of requirements) {
		const key = normalizeName(card.name);
		const existing = neededByName.get(key);
		if (existing) existing.needed += quantity;
		else neededByName.set(key, { name: card.name, needed: quantity, suggestion: card });
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
