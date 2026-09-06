/**
 * The user's data as something a language model can read without the catalogue:
 * names, set codes and numbers instead of TCGdex ids, grouped the way a person thinks
 * about it (by lot, by folder). Every card line is in PTCGL format, so a model can quote
 * lines back and the importer will accept them.
 */
import type { Catalogue } from '$lib/catalogue-index';
import type { Card, CardVariant, Deck, UserData, WantPriority } from '$lib/types';
import { folderPath } from '$lib/data/folders';
import { buildBuylist } from '$lib/tcg/buylist';
import { exportSetCode } from '$lib/tcg/set-code-overrides';

export type ReadableRow = {
	quantity: number;
	name: string;
	set: string;
	number: string;
	finish: CardVariant;
	supertype: Card['supertype'];
};

const FINISH_MARKER: Partial<Record<CardVariant, string>> = { reverse: 'rh', holo: 'h' };

/** "2 Numel MEG 021" plus a finish marker the importer strips ("rh", "h"). */
export const cardLine = (quantity: number, card: Card, finish?: CardVariant) => {
	const marker = finish ? FINISH_MARKER[finish] : undefined;
	return `${quantity} ${card.name} ${exportSetCode(card.set) ?? 'null'} ${card.localId}${marker ? ` ${marker}` : ''}`;
};

const SECTION_ORDER: Card['supertype'][] = ['Pokemon', 'Trainer', 'Energy'];
const SECTION_LABEL: Record<Card['supertype'], string> = {
	Pokemon: 'Pokémon',
	Trainer: 'Trainer',
	Energy: 'Energy'
};

function joinedRows(data: UserData, catalogue: Catalogue) {
	return data.collection
		.flatMap((row) => {
			const card = catalogue.byId.get(row.cardId);
			return card ? [{ row, card }] : [];
		})
		.sort((a, b) => a.card.name.localeCompare(b.card.name) || a.card.id.localeCompare(b.card.id));
}

function deckLines(deck: Deck, catalogue: Catalogue): string[] {
	const entries = deck.cards
		.flatMap((row) => {
			const card = catalogue.byId.get(row.cardId);
			return card ? [{ card, quantity: row.quantity }] : [];
		})
		.sort((a, b) => a.card.name.localeCompare(b.card.name));

	const lines: string[] = [];
	for (const supertype of SECTION_ORDER) {
		const section = entries.filter((entry) => entry.card.supertype === supertype);
		if (!section.length) continue;
		lines.push(`${SECTION_LABEL[supertype]}: ${section.reduce((sum, e) => sum + e.quantity, 0)}`);
		for (const entry of section) lines.push(cardLine(entry.quantity, entry.card));
		lines.push('');
	}
	lines.push(`Total Cards: ${entries.reduce((sum, e) => sum + e.quantity, 0)}`);
	return lines;
}

const WANT_RANK: Record<WantPriority, number> = { high: 0, normal: 1, low: 2 };

/** Every wants list, the unnamed default one first — the same order the app shows. */
const wantLists = (data: UserData) => [
	{ id: null as string | null, name: 'Main list', note: null as string | null },
	...[...data.wantLists].sort((a, b) => a.name.localeCompare(b.name))
];

/**
 * The wants list, joined to the catalogue and to what is already owned. A want is for
 * one finish, so only copies in that finish count towards it.
 */
function wantRows(data: UserData, catalogue: Catalogue) {
	return data.wants
		.flatMap((want) => {
			const card = catalogue.byId.get(want.cardId);
			if (!card) return [];
			const owned = data.collection
				.filter((row) => row.cardId === want.cardId && row.variant === want.variant)
				.reduce((sum, row) => sum + row.quantity, 0);
			return [{ want, card, owned, missing: Math.max(0, want.quantity - owned) }];
		})
		.sort(
			(a, b) =>
				WANT_RANK[a.want.priority] - WANT_RANK[b.want.priority] ||
				a.card.name.localeCompare(b.card.name)
		);
}

/** The trade binder joined to the catalogue and to how many copies are actually owned. */
function tradeRows(data: UserData, catalogue: Catalogue) {
	return data.trades
		.flatMap((trade) => {
			const card = catalogue.byId.get(trade.cardId);
			if (!card) return [];
			const owned = data.collection
				.filter((row) => row.cardId === trade.cardId && row.variant === trade.variant)
				.reduce((sum, row) => sum + row.quantity, 0);
			return [{ trade, card, owned }];
		})
		.sort((a, b) => a.card.name.localeCompare(b.card.name) || a.card.id.localeCompare(b.card.id));
}

/** Owned copies by card name — any printing counts towards a deck. */
function ownedRows(data: UserData, catalogue: Catalogue) {
	return data.collection.flatMap((row) => {
		const card = catalogue.byId.get(row.cardId);
		return card ? [{ name: card.name, quantity: row.quantity }] : [];
	});
}

export function toReadableMarkdown(
	data: UserData,
	catalogue: Catalogue,
	options: { generatedAt?: string; title?: string } = {}
): string {
	const out: string[] = [];
	const rows = joinedRows(data, catalogue);
	const totalCards = rows.reduce((sum, { row }) => sum + row.quantity, 0);

	out.push(`# ${options.title ?? 'Cardex collection'}`);
	out.push('');
	out.push(
		`Generated ${options.generatedAt ?? new Date().toISOString()}. ` +
			`${totalCards} cards, ${new Set(rows.map((r) => r.card.id)).size} printings, ` +
			`${data.lots.length} lots, ${data.decks.length} decks, ${data.formats.length} formats, ` +
			`${data.wants.length} wants, ${data.trades.length} printings in the trade binder.`
	);
	out.push('');
	out.push(
		'Card lines use the PTCGL format `<qty> <name> <SET CODE> <number>`; a trailing `rh` means ' +
			'reverse holo and `h` means holo. Lines in this format can be pasted straight back into ' +
			'Cardex (Import / Export → Import). Deck requirements count by card name, so any printing ' +
			'of a name the owner has satisfies a deck line.'
	);
	out.push('');

	// -- collection by lot ---------------------------------------------------
	out.push('## Collection');
	out.push('');
	const lots = [
		{
			id: null as string | null,
			name: 'Unsorted',
			note: null as string | null,
			acquiredOn: null as string | null,
			folderId: null as string | null
		},
		...[...data.lots].sort((a, b) =>
			(b.acquiredOn ?? b.createdAt).localeCompare(a.acquiredOn ?? a.createdAt)
		)
	];
	for (const lot of lots) {
		const inLot = rows.filter(({ row }) => row.lotId === lot.id);
		if (!inLot.length && lot.id !== null) {
			out.push(`### Lot: ${lot.name}${lot.acquiredOn ? ` (${lot.acquiredOn})` : ''}`);
			out.push('');
			if (lot.note) out.push(`${lot.note}`), out.push('');
			out.push('_Empty._');
			out.push('');
			continue;
		}
		if (!inLot.length) continue;
		const count = inLot.reduce((sum, { row }) => sum + row.quantity, 0);
		out.push(`### Lot: ${lot.name}${lot.acquiredOn ? ` (${lot.acquiredOn})` : ''} — ${count} cards`);
		out.push('');
		const where = folderPath(data.lotFolders, lot.folderId).map((f) => f.name);
		if (where.length) out.push(`Folder: ${where.join(' / ')}`), out.push('');
		if (lot.note) out.push(lot.note), out.push('');
		out.push('```');
		for (const { row, card } of inLot) out.push(cardLine(row.quantity, card, row.variant));
		out.push('```');
		out.push('');
	}

	// -- wants, by list ------------------------------------------------------
	const wants = wantRows(data, catalogue);
	if (wants.length) {
		out.push('## Wants');
		out.push('');
		out.push(
			'Cards the owner is hunting for, grouped by wants list. The quantity is how many they ' +
				'want to end up with; "still N" is what is missing after counting the copies already ' +
				'owned in that finish.'
		);
		out.push('');
		for (const list of wantLists(data)) {
			const inList = wants.filter(({ want }) => want.listId === list.id);
			if (!inList.length) continue;
			out.push(`### Wants list: ${list.name}`);
			out.push('');
			if (list.note) out.push(list.note), out.push('');
			for (const { want, card, missing } of inList) {
				out.push(
					`- ${cardLine(want.quantity, card, want.variant)} — ${want.priority} priority, still ${missing}` +
						(want.note ? ` — ${want.note}` : '')
				);
			}
			out.push('');
		}
	}

	// -- trade binder --------------------------------------------------------
	const trades = tradeRows(data, catalogue);
	if (trades.length) {
		out.push('## Trade binder');
		out.push('');
		out.push(
			'Copies the owner does not need and would trade away. They are still counted in the ' +
				'collection above; the quantity is how many are spare, "owns N" how many of that finish ' +
				'they hold in total. Do not suggest these for decks the owner wants to keep.'
		);
		out.push('');
		for (const { trade, card, owned } of trades) {
			out.push(
				`- ${cardLine(trade.quantity, card, trade.variant)} — owns ${owned}` +
					(trade.note ? ` — ${trade.note}` : '')
			);
		}
		out.push('');
	}

	// -- decks by folder -----------------------------------------------------
	out.push('## Decks');
	out.push('');
	if (!data.decks.length) out.push('_No decks yet._'), out.push('');
	const owned = ownedRows(data, catalogue);
	const decks = [...data.decks].sort((a, b) => {
		const pa = folderPath(data.folders, a.folderId).map((f) => f.name).join('/');
		const pb = folderPath(data.folders, b.folderId).map((f) => f.name).join('/');
		return pa.localeCompare(pb) || a.name.localeCompare(b.name);
	});
	for (const deck of decks) {
		const path = folderPath(data.folders, deck.folderId).map((f) => f.name);
		const format = deck.formatId ? data.formats.find((f) => f.id === deck.formatId) : null;
		const entries = deck.cards.flatMap((row) => {
			const card = catalogue.byId.get(row.cardId);
			return card ? [{ card, quantity: row.quantity }] : [];
		});
		const buylist = buildBuylist(entries, owned);
		const total = entries.reduce((sum, e) => sum + e.quantity, 0);

		out.push(`### Deck: ${deck.name}`);
		out.push('');
		out.push(
			[
				path.length ? `Folder: ${path.join(' / ')}` : 'Folder: (top level)',
				format ? `Format: ${format.name}` : null,
				`${total} cards`,
				`${Math.round(buylist.coverage * 100)}% owned`,
				`id: ${deck.id}`
			]
				.filter(Boolean)
				.join(' · ')
		);
		if (deck.description) out.push(''), out.push(deck.description);
		out.push('');
		out.push('```');
		out.push(...deckLines(deck, catalogue));
		out.push('```');
		if (buylist.rows.length) {
			out.push('');
			out.push('Missing (need / own):');
			for (const row of buylist.rows) {
				out.push(`- ${row.name}: ${row.missing} missing (need ${row.needed}, own ${row.owned})`);
			}
		}
		out.push('');
	}

	// -- formats -----------------------------------------------------------------
	if (data.formats.length) {
		out.push('## Formats');
		out.push('');
		for (const format of data.formats) {
			out.push(`### Format: ${format.name}`);
			out.push('');
			if (format.description) out.push(format.description), out.push('');
			out.push('```json');
			out.push(JSON.stringify(format.rules));
			out.push('```');
			if (format.pool.length) {
				out.push('');
				out.push(`Pool: ${format.pool.length} printings`);
			}
			out.push('');
		}
	}

	return out.join('\n');
}

/** The same content as structured JSON, for tools rather than chat. */
export function toReadableJson(data: UserData, catalogue: Catalogue) {
	const rows = joinedRows(data, catalogue);
	const owned = ownedRows(data, catalogue);
	const describe = (card: Card): Omit<ReadableRow, 'quantity' | 'finish'> => ({
		name: card.name,
		set: exportSetCode(card.set) ?? card.set.id,
		number: card.localId,
		supertype: card.supertype
	});

	return {
		generatedAt: new Date().toISOString(),
		lots: [
			{ id: null, name: 'Unsorted', acquiredOn: null, note: null, folder: [] as string[] },
			...data.lots.map((lot) => ({
				id: lot.id,
				name: lot.name,
				acquiredOn: lot.acquiredOn,
				note: lot.note,
				folder: folderPath(data.lotFolders, lot.folderId).map((f) => f.name)
			}))
		].map((lot) => ({
			...lot,
			cards: rows
				.filter(({ row }) => row.lotId === lot.id)
				.map(({ row, card }) => ({ quantity: row.quantity, finish: row.variant, ...describe(card) }))
		})),
		wantLists: wantLists(data).map((list) => ({
			id: list.id,
			name: list.name,
			note: list.note,
			cards: wantRows(data, catalogue)
				.filter(({ want }) => want.listId === list.id)
				.map(({ want, card, owned, missing }) => ({
					quantity: want.quantity,
					owned,
					missing,
					finish: want.variant,
					priority: want.priority,
					note: want.note,
					...describe(card)
				}))
		})),
		trades: tradeRows(data, catalogue).map(({ trade, card, owned }) => ({
			quantity: trade.quantity,
			owned,
			finish: trade.variant,
			note: trade.note,
			...describe(card)
		})),
		folders: data.folders.map((folder) => ({
			id: folder.id,
			name: folder.name,
			path: folderPath(data.folders, folder.id).map((f) => f.name)
		})),
		decks: data.decks.map((deck) => {
			const entries = deck.cards.flatMap((row) => {
				const card = catalogue.byId.get(row.cardId);
				return card ? [{ card, quantity: row.quantity }] : [];
			});
			const buylist = buildBuylist(entries, owned);
			return {
				id: deck.id,
				name: deck.name,
				folder: folderPath(data.folders, deck.folderId).map((f) => f.name),
				format: data.formats.find((f) => f.id === deck.formatId)?.name ?? null,
				description: deck.description,
				cards: entries.map(({ card, quantity }) => ({ quantity, ...describe(card) })),
				ownedCoverage: buylist.coverage,
				missing: buylist.rows.map((row) => ({
					name: row.name,
					needed: row.needed,
					owned: row.owned,
					missing: row.missing
				}))
			};
		}),
		formats: data.formats.map((format) => ({
			id: format.id,
			name: format.name,
			description: format.description,
			rules: format.rules,
			poolSize: format.pool.length
		}))
	};
}
