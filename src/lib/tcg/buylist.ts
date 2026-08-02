/**
 * "What do I still need to buy?" — the reason this app exists alongside a spreadsheet.
 *
 * Requirements are per card NAME (any Charmander printing satisfies "4 Charmander"),
 * and ownership sums every printing and variant the user has. The result is the
 * shortfall, plus the cheapest printing we know of as a suggestion.
 */
import type { CardWithSet } from '$lib/database.types';
import { normalizeName } from './normalize';

export type Requirement = { card: CardWithSet; quantity: number };
export type OwnedRow = { card_id: string; quantity: number; name: string };

export type BuylistRow = {
	name: string;
	needed: number;
	owned: number;
	missing: number;
	/** A printing to buy — the one the deck/pool referenced. */
	suggestion: CardWithSet;
};

export type Buylist = {
	rows: BuylistRow[];
	totalMissing: number;
	/** How much of the requirement is already covered, 0–1. */
	coverage: number;
};

/**
 * @param requirements what the deck or format pool asks for
 * @param owned collection rows (any number of printings/variants per name)
 */
export function buildBuylist(requirements: Requirement[], owned: OwnedRow[]): Buylist {
	const ownedByName = new Map<string, number>();
	for (const row of owned) {
		const key = normalizeName(row.name);
		ownedByName.set(key, (ownedByName.get(key) ?? 0) + row.quantity);
	}

	const neededByName = new Map<string, { name: string; needed: number; suggestion: CardWithSet }>();
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
