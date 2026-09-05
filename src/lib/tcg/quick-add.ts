/**
 * "Quick add": the set code and collector number printed on a card, nothing more.
 *
 *   MEG 21            one Mega Evolution #021
 *   3 PAL 188 rh      three reverse-holo Paldea Evolved #188
 *   meg 021 x2        case and zero-padding do not matter
 *   PR-SW 92          promo sets by their PTCGL code
 *   sv03 125          a raw TCGdex set id also works
 *
 * One entry per line, so a whole stack can be pasted at once. Pure; the UI decides what
 * to do with the resolved cards.
 */
import type { Catalogue } from '$lib/catalogue';
import { plainestVariant, type Card, type CardSet, type CardVariant } from '$lib/types';
import { findByNumber, setForCode } from './resolver';

export type QuickAddEntry = {
	quantity: number;
	setCode: string;
	number: string;
	/** A finish marker, when the line had one. */
	variant: CardVariant | null;
	lineNumber: number;
	raw: string;
};

export type QuickAddResolution = {
	entry: QuickAddEntry;
	card: Card | null;
	set: CardSet | null;
	note: string | null;
};

const VARIANT_MARKERS: Record<string, CardVariant> = {
	n: 'normal',
	normal: 'normal',
	r: 'reverse',
	rh: 'reverse',
	reverse: 'reverse',
	h: 'holo',
	holo: 'holo',
	'1st': 'firstEdition',
	first: 'firstEdition',
	promo: 'promo',
	p: 'promo'
};

/**
 * [qty[x]] CODE NUMBER [xQTY] [finish]
 * The code is letters and digits with an optional dash group (PR-SW); the number is
 * digits with an optional letter prefix or suffix (SWSH092, TG05, 21a).
 */
const LINE =
	/^(?:(\d+)\s*[x×]?\s+)?([A-Za-z][A-Za-z0-9]{0,4}(?:-[A-Za-z0-9]{1,4})?)\s+([A-Za-z]{0,5}\d+[A-Za-z]?)(?:\s*[x×]\s*(\d+))?(?:\s+([A-Za-z0-9]+))?$/;

export function parseQuickAddLine(line: string, lineNumber = 1): QuickAddEntry | null {
	const trimmed = line.trim();
	const match = trimmed.match(LINE);
	if (!match) return null;

	const [, leading, code, number, trailing, marker] = match;
	let variant: CardVariant | null = null;
	if (marker) {
		variant = VARIANT_MARKERS[marker.toLowerCase()] ?? null;
		if (!variant) return null; // an unknown trailing word means this is not a quick-add line
	}

	const quantity = Number(trailing ?? leading ?? 1);
	if (!Number.isFinite(quantity) || quantity < 1) return null;

	return { quantity, setCode: code.toUpperCase(), number, variant, lineNumber, raw: trimmed };
}

export function parseQuickAdd(text: string): { entries: QuickAddEntry[]; warnings: string[] } {
	const entries: QuickAddEntry[] = [];
	const warnings: string[] = [];

	text.split(/\r?\n/).forEach((line, index) => {
		if (!line.trim()) return;
		const entry = parseQuickAddLine(line, index + 1);
		if (entry) entries.push(entry);
		else warnings.push(`Line ${index + 1}: could not read "${line.trim()}"`);
	});

	return { entries, warnings };
}

/** True when the text is a code + number rather than a card name to search for. */
export const looksLikeQuickAdd = (text: string) => parseQuickAddLine(text) !== null;

export function resolveQuickAdd(catalogue: Catalogue, entry: QuickAddEntry): QuickAddResolution {
	const { set } = setForCode(catalogue, entry.setCode);
	if (!set) {
		return { entry, card: null, set: null, note: `Unknown set code ${entry.setCode}` };
	}

	const card = findByNumber(catalogue.cardsBySet.get(set.id) ?? [], entry.number)[0] ?? null;
	return {
		entry,
		card,
		set,
		note: card ? null : `${set.name} has no card #${entry.number}`
	};
}

export const resolveQuickAddAll = (catalogue: Catalogue, entries: QuickAddEntry[]) =>
	entries.map((entry) => resolveQuickAdd(catalogue, entry));

/**
 * The finish to record: the marker if the printing exists in it, else the plainest finish
 * it does exist in — holo for a rare that comes as holo + reverse, normal for a common.
 */
export function pickVariant(
	card: Card,
	requested: CardVariant | null,
	fallback: CardVariant
): CardVariant {
	const wanted = requested ?? fallback;
	if (card.variants.includes(wanted)) return wanted;
	return plainestVariant(card.variants);
}
