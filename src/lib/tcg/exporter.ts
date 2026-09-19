/**
 * Writes decks and collections back out. Three shapes:
 *   * PTCGL text — round-trips through parser.ts, and is what pkmn.gg / PTCGL /
 *     Limitless accept. Also the format Claude should reply in, so AI-generated
 *     decks can be pasted straight back into the importer.
 *   * Cardmarket text — what its "add a decklist to a wants list" box accepts.
 *   * AI JSON — flat and token-cheap, for pasting a whole collection into a chat.
 */
import type { Card, Supertype } from '$lib/types';
import { exportSetCode } from './set-code-overrides';

export type ExportLine = { quantity: number; card: Card; variant?: string };

const SECTION_ORDER: Supertype[] = ['Pokemon', 'Trainer', 'Energy'];
const SECTION_LABEL: Record<Supertype, string> = {
	Pokemon: 'Pokémon',
	Trainer: 'Trainer',
	Energy: 'Energy'
};

export function toPtcglText(lines: ExportLine[]): string {
	const blocks: string[] = [];

	for (const supertype of SECTION_ORDER) {
		const section = lines.filter((line) => line.card.supertype === supertype);
		if (section.length === 0) continue;

		const count = section.reduce((sum, line) => sum + line.quantity, 0);
		const body = section.map(
			({ quantity, card }) =>
				`${quantity} ${card.name} ${exportSetCode(card.set) ?? 'null'} ${card.localId}`
		);

		blocks.push([`${SECTION_LABEL[supertype]}: ${count}`, ...body].join('\n'));
	}

	const total = lines.reduce((sum, line) => sum + line.quantity, 0);
	return [...blocks, `Total Cards: ${total}`].join('\n\n') + '\n';
}

/**
 * The parts of a card's rules text Cardmarket's matcher needs; `CardText` from
 * card-details satisfies it, and keeping the shape structural keeps this module free
 * of anything that only exists in the browser.
 */
export type CardNaming = { abilities?: { name: string }[]; attacks?: { name: string }[] };

/**
 * Cardmarket identifies Pokémon by name *plus* their ability and attack names — its
 * help page is explicit that "2x Umbreon" matches nothing while
 * "2x Umbreon EX Moon Mirage Onyx" does. Trainers and Energy go in by name alone.
 * No set code or number: the importer takes any printing of the card.
 *
 * `textOf` is what supplies the ability/attack names — a Pokémon without them still
 * gets a line, it just risks matching nothing when the name is shared.
 */
export function toCardmarketText(
	lines: ExportLine[],
	textOf?: (card: Card) => CardNaming | undefined
): string {
	// Two printings — or a normal and a reverse — of one card are one Cardmarket line,
	// since the search behind it is by name and finds every version anyway.
	const merged = new Map<string, number>();

	for (const { quantity, card } of lines) {
		if (quantity <= 0) continue;
		const name = cardmarketName(card, textOf?.(card));
		merged.set(name, (merged.get(name) ?? 0) + quantity);
	}

	if (merged.size === 0) return '';
	return [...merged].map(([name, quantity]) => `${quantity}x ${name}`).join('\n') + '\n';
}

function cardmarketName(card: Card, text: CardNaming | undefined): string {
	const parts = [card.name];

	if (card.supertype === 'Pokemon') {
		for (const ability of text?.abilities ?? []) parts.push(ability.name);
		for (const attack of text?.attacks ?? []) parts.push(attack.name);
	}

	return parts
		.map((part) => part.trim())
		.filter(Boolean)
		.join(' ');
}

export type AiCardEntry = {
	name: string;
	set: string | null;
	number: string;
	qty: number;
	supertype: Supertype;
	subtypes: string[];
	types: string[];
	rarity: string | null;
	regulationMark: string | null;
	variant?: string;
};

export function toAiEntries(lines: ExportLine[]): AiCardEntry[] {
	return lines.map(({ quantity, card, variant }) => ({
		name: card.name,
		set: exportSetCode(card.set) ?? card.set.id,
		number: card.localId,
		qty: quantity,
		supertype: card.supertype,
		subtypes: card.subtypes,
		types: card.types,
		rarity: card.rarity,
		regulationMark: card.regulationMark,
		...(variant && variant !== 'normal' ? { variant } : {})
	}));
}

/**
 * Prepended to "Copy for AI" payloads so a model knows the schema and — importantly —
 * what format to answer in, since its answer goes straight back through the importer.
 */
export const AI_PREAMBLE = `This is a Pokémon TCG collection/deck export from my tracker.
Each entry: { name, set (PTCGL set code), number (collector number), qty, supertype, subtypes, types, rarity, regulationMark, variant? }.

When you propose a deck, reply in PTCGL decklist format so I can paste it straight back:

Pokémon: <count>
<qty> <name> <SET> <number>

Trainer: <count>
...

Energy: <count>
...

Total Cards: <n>
`;
