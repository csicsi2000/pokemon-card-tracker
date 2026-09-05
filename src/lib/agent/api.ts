/**
 * What an agent can do with the user's data, as plain functions over `UserData` and the
 * catalogue. The CLI (scripts/cardex.ts) and the MCP server (scripts/cardex-mcp.ts) are
 * thin wrappers over this file, so both expose exactly the same behaviour and every write
 * goes through the same mutations — with timestamps and tombstones — that the app uses.
 *
 * References are forgiving: a deck or lot can be named by id or by (unique) name, a card
 * by "MEG 21", by TCGdex id, or by name (newest printing wins).
 */
import type { Catalogue } from '$lib/catalogue-index';
import { searchCards } from '$lib/catalogue-index';
import type { Clock } from '$lib/data/clock';
import { folderPath } from '$lib/data/folders';
import * as mutate from '$lib/data/mutations';
import { repair } from '$lib/data/repair';
import type { Card, CardVariant, Deck, DeckFolder, Lot, UserData } from '$lib/types';
import { buildBuylist, type Buylist } from '$lib/tcg/buylist';
import { parseRules } from '$lib/tcg/format-rules';
import { checkLegality, type LegalityReport } from '$lib/tcg/legality';
import { normalizeName } from '$lib/tcg/normalize';
import { parseDecklist } from '$lib/tcg/parser';
import { parseQuickAdd, parseQuickAddLine, pickVariant, resolveQuickAdd } from '$lib/tcg/quick-add';
import { resolveEntries, type ResolvedEntry } from '$lib/tcg/resolver';
import { exportSetCode } from '$lib/tcg/set-code-overrides';

export class AgentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AgentError';
	}
}

export type AgentContext = { data: UserData; catalogue: Catalogue; clock: Clock };

// -- references -------------------------------------------------------------

function byIdOrName<T extends { id: string; name: string }>(items: T[], ref: string, kind: string): T {
	const trimmed = ref.trim();
	const byId = items.find((item) => item.id === trimmed);
	if (byId) return byId;
	const needle = normalizeName(trimmed);
	const matches = items.filter((item) => normalizeName(item.name) === needle);
	if (matches.length === 1) return matches[0];
	if (matches.length > 1) {
		throw new AgentError(
			`Several ${kind}s are called "${trimmed}"; use an id: ${matches.map((m) => m.id).join(', ')}`
		);
	}
	const partial = items.filter((item) => normalizeName(item.name).includes(needle));
	if (partial.length === 1) return partial[0];
	throw new AgentError(
		`No ${kind} matches "${trimmed}".${items.length ? ` Known: ${items.map((i) => i.name).join(', ')}` : ''}`
	);
}

export const findDeck = (data: UserData, ref: string): Deck => byIdOrName(data.decks, ref, 'deck');

/** `null`, "unsorted" or "" mean the Unsorted lot. */
export function findLotId(data: UserData, ref: string | null | undefined): string | null {
	if (ref == null || ref.trim() === '' || normalizeName(ref) === 'unsorted') return null;
	return byIdOrName(data.lots, ref, 'lot').id;
}

/** "Standard/2026" → the folder, or null for the top level. Missing segments can be created. */
export function findFolder(
	ctx: AgentContext,
	path: string | null | undefined,
	options: { create?: boolean } = {}
): { data: UserData; folder: DeckFolder | null } {
	if (!path || !path.trim()) return { data: ctx.data, folder: null };
	const segments = path
		.split(/[/›>]/)
		.map((segment) => segment.trim())
		.filter(Boolean);

	let data = ctx.data;
	let parent: DeckFolder | null = null;
	for (const segment of segments) {
		const needle = normalizeName(segment);
		let next = data.folders.find(
			(folder) => folder.parentId === (parent?.id ?? null) && normalizeName(folder.name) === needle
		);
		if (!next) {
			if (!options.create) throw new AgentError(`No folder "${path}". Known: ${describeFolders(data)}`);
			const created = mutate.createFolder(data, ctx.clock, segment, parent?.id ?? null);
			data = created.data;
			next = created.folder;
		}
		parent = next;
	}
	return { data, folder: parent };
}

export const describeFolders = (data: UserData) =>
	data.folders.length
		? data.folders.map((f) => folderPath(data.folders, f.id).map((p) => p.name).join('/')).join(', ')
		: '(none)';

// -- cards ------------------------------------------------------------------

export type CardMatch = { card: Card | null; how: 'code' | 'id' | 'name' | 'none'; note: string | null };

/** "MEG 21", "me01-021" or "Charizard ex" → one printing. */
export function resolveCardSpec(catalogue: Catalogue, spec: string): CardMatch {
	const trimmed = spec.trim();
	const quick = parseQuickAddLine(trimmed);
	if (quick) {
		const result = resolveQuickAdd(catalogue, quick);
		if (result.card) return { card: result.card, how: 'code', note: null };
		if (result.set) return { card: null, how: 'none', note: result.note };
	}
	const byId = catalogue.byId.get(trimmed) ?? catalogue.byId.get(trimmed.toLowerCase());
	if (byId) return { card: byId, how: 'id', note: null };

	const printings = catalogue.byName.get(normalizeName(trimmed));
	if (printings?.length) {
		const card = printings.find((p) => p.set.legalStandard) ?? printings[0];
		return {
			card,
			how: 'name',
			note: printings.length > 1 ? `${printings.length} printings; using ${describeCard(card)}` : null
		};
	}
	return { card: null, how: 'none', note: `No card matches "${trimmed}"` };
}

export const describeCard = (card: Card) =>
	`${card.name} ${exportSetCode(card.set) ?? card.set.id} ${card.localId}`;

export function search(catalogue: Catalogue, query: string, setCode?: string, limit = 30) {
	let setId: string | undefined;
	if (setCode) {
		const set =
			catalogue.setsByCode.get(setCode.toUpperCase()) ?? catalogue.setsById.get(setCode.toLowerCase());
		if (!set) throw new AgentError(`Unknown set code "${setCode}"`);
		setId = set.id;
	}
	return searchCards(catalogue, { query, setId }, limit);
}

// -- reading ----------------------------------------------------------------

export type CollectionRow = {
	card: Card;
	finish: CardVariant;
	quantity: number;
	lot: Lot | null;
};

export function collectionRows(data: UserData, catalogue: Catalogue, lotRef?: string | null): CollectionRow[] {
	const lotId = lotRef === undefined ? undefined : findLotId(data, lotRef);
	return data.collection
		.filter((row) => lotId === undefined || row.lotId === lotId)
		.flatMap((row) => {
			const card = catalogue.byId.get(row.cardId);
			if (!card) return [];
			return [
				{
					card,
					finish: row.variant,
					quantity: row.quantity,
					lot: row.lotId ? (data.lots.find((lot) => lot.id === row.lotId) ?? null) : null
				}
			];
		})
		.sort((a, b) => a.card.name.localeCompare(b.card.name));
}

export type DeckView = {
	deck: Deck;
	path: string[];
	format: string | null;
	entries: { card: Card; quantity: number; owned: number }[];
	total: number;
	buylist: Buylist;
};

export function deckView(data: UserData, catalogue: Catalogue, ref: string): DeckView {
	const deck = findDeck(data, ref);
	const owned = data.collection.flatMap((row) => {
		const card = catalogue.byId.get(row.cardId);
		return card ? [{ name: card.name, quantity: row.quantity }] : [];
	});
	const ownedByName = new Map<string, number>();
	for (const row of owned) {
		const key = normalizeName(row.name);
		ownedByName.set(key, (ownedByName.get(key) ?? 0) + row.quantity);
	}
	const order = { Pokemon: 0, Trainer: 1, Energy: 2 };
	const entries = deck.cards
		.flatMap((row) => {
			const card = catalogue.byId.get(row.cardId);
			return card
				? [{ card, quantity: row.quantity, owned: ownedByName.get(card.nameNormalized) ?? 0 }]
				: [];
		})
		.sort((a, b) => order[a.card.supertype] - order[b.card.supertype] || a.card.name.localeCompare(b.card.name));

	return {
		deck,
		path: folderPath(data.folders, deck.folderId).map((f) => f.name),
		format: deck.formatId ? (data.formats.find((f) => f.id === deck.formatId)?.name ?? null) : null,
		entries,
		total: entries.reduce((sum, e) => sum + e.quantity, 0),
		buylist: buildBuylist(entries, owned)
	};
}

export function deckLegality(data: UserData, catalogue: Catalogue, ref: string): LegalityReport | null {
	const deck = findDeck(data, ref);
	const format = deck.formatId ? data.formats.find((f) => f.id === deck.formatId) : undefined;
	if (!format) return null;
	const entries = deck.cards.flatMap((row) => {
		const card = catalogue.byId.get(row.cardId);
		return card ? [{ card, quantity: row.quantity }] : [];
	});
	return checkLegality(entries, parseRules(format.rules), new Set(format.pool.map((c) => c.cardId)));
}

// -- writing ----------------------------------------------------------------

export type ListResult = {
	resolved: ResolvedEntry[];
	unresolved: ResolvedEntry[];
	warnings: string[];
	cards: Deck['cards'];
};

/** Parse and resolve decklist text, merging duplicate printings. */
export function resolveList(catalogue: Catalogue, text: string): ListResult {
	const parsed = parseDecklist(text);
	const resolved = resolveEntries(catalogue, parsed.entries);
	const merged = new Map<string, number>();
	for (const row of resolved) {
		if (row.card) merged.set(row.card.id, (merged.get(row.card.id) ?? 0) + row.entry.quantity);
	}
	return {
		resolved,
		unresolved: resolved.filter((row) => !row.card),
		warnings: parsed.warnings,
		cards: [...merged].map(([cardId, quantity]) => ({ cardId, quantity }))
	};
}

export function createDeck(
	ctx: AgentContext,
	input: { name: string; list?: string; folder?: string | null; format?: string | null }
): { data: UserData; deck: Deck; list: ListResult | null } {
	const list = input.list?.trim() ? resolveList(ctx.catalogue, input.list) : null;
	const { data: withFolders, folder } = findFolder(ctx, input.folder, { create: true });
	const format = input.format ? byIdOrName(ctx.data.formats, input.format, 'format') : null;
	const { data, deck } = mutate.createDeck(withFolders, ctx.clock, {
		name: input.name.trim() || 'New deck',
		cards: list?.cards ?? [],
		folderId: folder?.id ?? null,
		formatId: format?.id ?? null
	});
	return { data, deck, list };
}

export function replaceDeckList(
	ctx: AgentContext,
	ref: string,
	text: string
): { data: UserData; deck: Deck; list: ListResult } {
	const deck = findDeck(ctx.data, ref);
	const list = resolveList(ctx.catalogue, text);
	return { data: mutate.updateDeck(ctx.data, ctx.clock, deck.id, { cards: list.cards }), deck, list };
}

export function setDeckCard(
	ctx: AgentContext,
	ref: string,
	spec: string,
	quantity: number
): { data: UserData; deck: Deck; card: Card } {
	const deck = findDeck(ctx.data, ref);
	const match = resolveCardSpec(ctx.catalogue, spec);
	if (!match.card) throw new AgentError(match.note ?? `No card matches "${spec}"`);
	return {
		data: mutate.setDeckQuantity(ctx.data, ctx.clock, deck.id, match.card.id, quantity),
		deck,
		card: match.card
	};
}

export function renameDeck(ctx: AgentContext, ref: string, changes: { name?: string; description?: string | null; folder?: string | null }) {
	const deck = findDeck(ctx.data, ref);
	let data = ctx.data;
	const patch: Partial<Deck> = {};
	if (changes.name?.trim()) patch.name = changes.name.trim();
	if (changes.description !== undefined) patch.description = changes.description;
	if (changes.folder !== undefined) {
		const result = findFolder({ ...ctx, data }, changes.folder, { create: true });
		data = result.data;
		patch.folderId = result.folder?.id ?? null;
	}
	return { data: mutate.updateDeck(data, ctx.clock, deck.id, patch), deck };
}

export function deleteDeck(ctx: AgentContext, ref: string) {
	const deck = findDeck(ctx.data, ref);
	return { data: mutate.deleteDeck(ctx.data, ctx.clock, deck.id), deck };
}

export type QuickAddResult = {
	data: UserData;
	added: { card: Card; quantity: number; finish: CardVariant }[];
	failed: { line: string; note: string }[];
	warnings: string[];
};

/** Lines like "3 MEG 21 rh" into the collection (into a lot when given). */
export function quickAdd(
	ctx: AgentContext,
	text: string,
	options: { lot?: string | null; finish?: CardVariant; createLot?: boolean } = {}
): QuickAddResult {
	let data = ctx.data;
	let lotId: string | null;
	try {
		lotId = findLotId(data, options.lot);
	} catch (error) {
		if (!options.createLot || !options.lot) throw error;
		const created = mutate.createLot(data, ctx.clock, { name: options.lot.trim() });
		data = created.data;
		lotId = created.lot.id;
	}

	const parsed = parseQuickAdd(text);
	const added: QuickAddResult['added'] = [];
	const failed: QuickAddResult['failed'] = [];
	const rows: mutate.RowInput[] = [];

	for (const entry of parsed.entries) {
		const result = resolveQuickAdd(ctx.catalogue, entry);
		if (!result.card) {
			failed.push({ line: entry.raw, note: result.note ?? 'not found' });
			continue;
		}
		const finish = pickVariant(result.card, entry.variant, options.finish ?? 'normal');
		rows.push({ cardId: result.card.id, variant: finish, quantity: entry.quantity, lotId });
		added.push({ card: result.card, quantity: entry.quantity, finish });
	}

	if (rows.length) data = mutate.addOwned(data, ctx.clock, rows, 'add');
	return { data, added, failed, warnings: parsed.warnings };
}

export function createLot(ctx: AgentContext, input: { name: string; acquiredOn?: string | null; note?: string | null }) {
	return mutate.createLot(ctx.data, ctx.clock, input);
}

/** Every write ends here so the file on disk is always consistent. */
export const finalize = (data: UserData) => repair(data, { now: new Date().toISOString() });
