/**
 * Two decks side by side: what came in, what went out, and what stayed.
 *
 * Cards are matched by NAME, not by printing — the same rule the buylist and deck
 * requirements use. Two versions of one archetype often differ only in where a card was
 * pulled from ("4 Iono PAL 185" vs "4 Iono PAF 80"), and calling that a change would
 * bury the real differences. A name both decks run in the same count but from different
 * printings is still flagged (`reprintOnly`), because regulation marks matter.
 *
 * Pure functions over the same `DeckEntry[]` the legality check and the stats work on.
 */
import type { Card, Supertype } from '$lib/types';
import { deckStats, type DeckStats } from './deck-stats';
import type { DeckEntry } from './legality';
import { normalizeName } from './normalize';

/** Which side of the comparison a row belongs to, read from left (A) to right (B). */
export type DiffStatus =
	/** Only B runs it. */
	| 'added'
	/** Only A runs it. */
	| 'removed'
	/** Both run it, in different counts. */
	| 'changed'
	/** Both run the same number of copies. */
	| 'same';

export type DeckDiffRow = {
	/** As spelled by whichever deck has it (B wins, so a rename reads forwards). */
	name: string;
	nameNormalized: string;
	supertype: Supertype;
	status: DiffStatus;
	/** Copies in the left deck and in the right deck. */
	a: number;
	b: number;
	/** `b - a`: positive came in, negative went out. */
	delta: number;
	/** A printing to show the art of — B's if it has one, else A's. */
	card: Card;
	/** The printings each side runs, so a reprint swap can be spelled out. */
	printings: { a: Card[]; b: Card[] };
	/** Same count on both sides, but not the same printing. */
	reprintOnly: boolean;
};

/** One decklist section, both sides of it. */
export type DeckDiffGroup = {
	supertype: Supertype;
	label: string;
	a: number;
	b: number;
	delta: number;
};

export type DeckDiff = {
	/** Every name either deck runs, differences first within each section. */
	rows: DeckDiffRow[];
	totals: { a: number; b: number };
	/** How many names differ in count — the headline "N changes". */
	changes: number;
	/** Names both decks run in the same count from different printings. */
	reprints: number;
	/** Copies both decks run (Σ min), and the copies each side has to itself. */
	shared: number;
	added: number;
	removed: number;
	/**
	 * Σ min / Σ max over every name, 0–1. 1 means the lists are identical; two builds of
	 * one archetype usually land somewhere in the 0.8s. Two empty decks count as identical.
	 */
	similarity: number;
	groups: DeckDiffGroup[];
	stats: { a: DeckStats; b: DeckStats };
};

const SECTION_ORDER: Supertype[] = ['Pokemon', 'Trainer', 'Energy'];

const SECTION_LABEL: Record<Supertype, string> = {
	Pokemon: 'Pokémon',
	Trainer: 'Trainer',
	Energy: 'Energy'
};

type Side = { quantity: number; cards: Card[] };

function byName(entries: DeckEntry[]): Map<string, Side> {
	const sides = new Map<string, Side>();
	for (const { card, quantity } of entries) {
		const key = card.nameNormalized || normalizeName(card.name);
		const side = sides.get(key);
		if (side) {
			side.quantity += quantity;
			if (!side.cards.some((existing) => existing.id === card.id)) side.cards.push(card);
		} else {
			sides.set(key, { quantity, cards: [card] });
		}
	}
	return sides;
}

const samePrintings = (a: Card[], b: Card[]) =>
	a.length === b.length && a.every((card) => b.some((other) => other.id === card.id));

/**
 * Differences first, then reprint swaps, then the untouched cards — so the top of every
 * section is what actually changed. Within a tier the biggest swing leads.
 */
const tierOf = (row: DeckDiffRow) => (row.status === 'same' ? (row.reprintOnly ? 1 : 2) : 0);

export function diffDecks(a: DeckEntry[], b: DeckEntry[]): DeckDiff {
	const left = byName(a);
	const right = byName(b);

	const rows: DeckDiffRow[] = [];
	for (const key of new Set([...left.keys(), ...right.keys()])) {
		const from = left.get(key);
		const to = right.get(key);
		const card = to?.cards[0] ?? from?.cards[0];
		if (!card) continue; // unreachable: a key exists only because a side had a card

		const countA = from?.quantity ?? 0;
		const countB = to?.quantity ?? 0;
		const printings = { a: from?.cards ?? [], b: to?.cards ?? [] };

		const status: DiffStatus =
			countA === countB ? 'same' : countA === 0 ? 'added' : countB === 0 ? 'removed' : 'changed';

		rows.push({
			name: card.name,
			nameNormalized: key,
			supertype: card.supertype,
			status,
			a: countA,
			b: countB,
			delta: countB - countA,
			card,
			printings,
			reprintOnly:
				status === 'same' &&
				printings.a.length > 0 &&
				printings.b.length > 0 &&
				!samePrintings(printings.a, printings.b)
		});
	}

	rows.sort(
		(x, y) =>
			SECTION_ORDER.indexOf(x.supertype) - SECTION_ORDER.indexOf(y.supertype) ||
			tierOf(x) - tierOf(y) ||
			Math.abs(y.delta) - Math.abs(x.delta) ||
			x.name.localeCompare(y.name)
	);

	const statsA = deckStats(a);
	const statsB = deckStats(b);

	let shared = 0;
	let union = 0;
	let added = 0;
	let removed = 0;
	for (const row of rows) {
		shared += Math.min(row.a, row.b);
		union += Math.max(row.a, row.b);
		if (row.delta > 0) added += row.delta;
		else removed -= row.delta;
	}

	return {
		rows,
		totals: { a: statsA.total, b: statsB.total },
		changes: rows.filter((row) => row.status !== 'same').length,
		reprints: rows.filter((row) => row.reprintOnly).length,
		shared,
		added,
		removed,
		similarity: union === 0 ? 1 : shared / union,
		groups: SECTION_ORDER.map((supertype) => {
			const countA = statsA.groups.find((group) => group.supertype === supertype)?.count ?? 0;
			const countB = statsB.groups.find((group) => group.supertype === supertype)?.count ?? 0;
			return { supertype, label: SECTION_LABEL[supertype], a: countA, b: countB, delta: countB - countA };
		}),
		stats: { a: statsA, b: statsB }
	};
}

/**
 * The changes as text, in the shorthand players use when they talk about a list:
 * `-2 Iono` / `+2 Professor's Research`. Copy-paste fodder for a chat or a note.
 */
export function diffToText(diff: DeckDiff): string {
	const lines = diff.rows
		.filter((row) => row.delta !== 0)
		.sort((x, y) => y.delta - x.delta || x.name.localeCompare(y.name))
		.map((row) => `${row.delta > 0 ? '+' : '-'}${Math.abs(row.delta)} ${row.name}`);
	return lines.length ? lines.join('\n') + '\n' : 'The two lists are identical.\n';
}
