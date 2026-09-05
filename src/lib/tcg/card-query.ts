/**
 * What a search box does with a query that is a set code and a collector number rather
 * than a card name: "MEG 21", "meg21", "pr-sw 92", "sv03 125", "SVI TG05".
 *
 * Looser than `parseQuickAddLine` on purpose. Quick add reads pasted stacks, so it wants
 * an unambiguous grammar; a search box gets one card at a time and should understand the
 * shorthand people actually type, space or no space. Since the space is optional, "meg21"
 * has several possible splits ("meg2"+"1", "meg"+"21", "me"+"g21") and the catalogue is
 * what decides: the longest prefix that is a real set code and holds that number wins.
 */
import type { Catalogue } from '../catalogue-index';
import type { Card, CardSet } from '../types';
import { normalizeName } from './normalize';
import { findByNumber, setForCode } from './resolver';
import { PTCGL_CODE_OVERRIDES } from './set-code-overrides';

const CODE = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)?$/;
/** With a space the number may be lettered, as printed: "SVI TG05", "PR-SW SWSH092". */
const NUMBER = /^[A-Za-z]{0,5}\d+[A-Za-z]?$/;
/**
 * Without one it may not. "Porygon2" would otherwise split into POR + "ygon2", whose
 * digits match Perfect Order #002 — a card name must not be read as a code that way.
 */
const BARE_NUMBER = /^\d+[A-Za-z]?$/;

export type CardCodeMatch = {
	set: CardSet;
	number: string;
	/** Printings carrying that number, best first. Empty when the set has no such card. */
	cards: Card[];
};

/** Every way the text could split into code + number, most specific code first. */
function splitCandidates(text: string): Array<[code: string, number: string]> {
	const trimmed = text.trim();

	const spaced = trimmed.match(/^(\S+)\s+(\S+)$/);
	if (spaced) {
		return CODE.test(spaced[1]) && NUMBER.test(spaced[2]) ? [[spaced[1], spaced[2]]] : [];
	}
	if (/\s/.test(trimmed)) return []; // three or more words is a name, not a code

	const candidates: Array<[string, string]> = [];
	for (let cut = trimmed.length - 1; cut >= 1; cut -= 1) {
		const code = trimmed.slice(0, cut);
		const number = trimmed.slice(cut);
		if (CODE.test(code) && BARE_NUMBER.test(number)) candidates.push([code, number]);
	}
	return candidates;
}

/** `setForCode`, plus a punctuation-blind pass so "prsw" finds the "PR-SW" set. */
function setForQueryCode(catalogue: Catalogue, code: string): CardSet | undefined {
	const { set } = setForCode(catalogue, code);
	if (set) return set;

	const stripped = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
	if (!stripped) return undefined;

	const bare = (known: string) => known.replace(/[^A-Z0-9]/g, '') === stripped;
	for (const [known, candidate] of catalogue.setsByCode) {
		if (bare(known)) return candidate;
	}
	for (const [known, setId] of Object.entries(PTCGL_CODE_OVERRIDES)) {
		if (bare(known)) return catalogue.setsById.get(setId);
	}
	return undefined;
}

/**
 * The printing a code-and-number query names, or null when the text is not one. A match
 * with an empty `cards` means the set exists but has no such number — worth telling the
 * user, since it is usually a typo rather than a name search.
 */
export function lookupCardCode(catalogue: Catalogue, text: string): CardCodeMatch | null {
	let emptySet: CardCodeMatch | null = null;

	for (const [code, number] of splitCandidates(text)) {
		const set = setForQueryCode(catalogue, code);
		if (!set) continue;

		const cards = findByNumber(catalogue.cardsBySet.get(set.id) ?? [], number);
		if (cards.length) return { set, number, cards };
		emptySet ??= { set, number, cards: [] };
	}

	return emptySet;
}

export type CardQuery = {
	/** True for cards the query should show. Always true for an empty query. */
	matches: (card: Card) => boolean;
	/** Set + number reading of the query, when it has one. Those cards sort first. */
	code: CardCodeMatch | null;
};

/**
 * One reading of a search box: name substring plus, when the text looks like a set code
 * and number, the exact printing it names. Both are kept — "meg21" is a code to us but
 * could still be part of a name we have not thought of.
 */
export function cardQuery(catalogue: Catalogue, text: string): CardQuery {
	const needle = normalizeName(text ?? '');
	if (!needle) return { matches: () => true, code: null };

	const code = lookupCardCode(catalogue, text);
	const ids = new Set(code?.cards.map((card) => card.id));

	return {
		matches: (card) => ids.has(card.id) || card.nameNormalized.includes(needle),
		code
	};
}
