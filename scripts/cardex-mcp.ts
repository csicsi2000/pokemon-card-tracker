/**
 * MCP server exposing the collection to Claude, Codex, Gemini or any MCP client.
 *
 * Reads and writes the same data file as the CLI (see agent-io.ts) through the same
 * agent API, so a model can inspect the collection, build a deck, and adjust it — each
 * write timestamped so the app merges it on its next Google Drive sync.
 *
 *   claude mcp add cardex -e CARDEX_DATA=/path/to/cardex-data.json -- npm run mcp --prefix /path/to/repo
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as api from '../src/lib/agent/api';
import * as battles from '../src/lib/agent/battles';
import { toReadableJson, toReadableMarkdown } from '../src/lib/agent/readable';
import { diffToText } from '../src/lib/tcg/deck-diff';
import { BATTLE_RESULTS, type BattleResult } from '../src/lib/data/model';
import { CARD_VARIANTS, type CardVariant } from '../src/lib/types';
import { loadCatalogueFromDisk, openData, resolveDataPath, saveData } from './agent-io';

const dataPath = resolveDataPath(process.env.CARDEX_DATA);
const catalogue = loadCatalogueFromDisk();

const server = new McpServer({ name: 'cardex', version: '0.2.0' });

/** Fresh read per call: the app or Drive may have changed the file in between. */
const context = (): api.AgentContext => {
	const file = openData(dataPath);
	return { data: file.data, catalogue, clock: file.clock };
};

const text = (value: unknown) => ({
	content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
});

const failure = (error: unknown) => ({
	content: [{ type: 'text' as const, text: (error as Error).message }],
	isError: true
});

const guarded =
	<A>(fn: (args: A) => unknown) =>
	async (args: A) => {
		try {
			return text(await fn(args));
		} catch (error) {
			return failure(error);
		}
	};

const cardSummary = (card: api.CardMatch['card']) =>
	card && { id: card.id, name: card.name, set: card.set.ptcglCode ?? card.set.id, setName: card.set.name, number: card.localId, supertype: card.supertype, subtypes: card.subtypes, types: card.types, hp: card.hp, rarity: card.rarity, regulationMark: card.regulationMark, standardLegal: card.set.legalStandard };

const finishSchema = z.enum(CARD_VARIANTS as [CardVariant, ...CardVariant[]]);

server.registerTool(
	'get_overview',
	{
		title: 'Collection overview',
		description: 'Counts of cards, printings, lots, decks and formats, plus where the data file lives.',
		inputSchema: {}
	},
	guarded(() => {
		const ctx = context();
		const rows = api.collectionRows(ctx.data, ctx.catalogue);
		return {
			dataFile: dataPath,
			cards: rows.reduce((sum, row) => sum + row.quantity, 0),
			printings: new Set(rows.map((row) => row.card.id)).size,
			lots: ctx.data.lots.map((lot) => lot.name),
			decks: ctx.data.decks.map((deck) => deck.name),
			formats: ctx.data.formats.map((format) => format.name),
			catalogueGeneratedAt: ctx.catalogue.generatedAt
		};
	})
);

server.registerTool(
	'get_collection',
	{
		title: 'Get collection',
		description:
			'Every card the user owns with name, set code, collector number, finish, quantity and lot. Optionally only one lot ("unsorted" for cards in no lot).',
		inputSchema: { lot: z.string().optional().describe('Lot name or id; omit for everything') }
	},
	guarded(({ lot }) => {
		const ctx = context();
		return api.collectionRows(ctx.data, ctx.catalogue, lot).map((row) => ({
			quantity: row.quantity,
			finish: row.finish,
			lot: row.lot?.name ?? 'Unsorted',
			...cardSummary(row.card)
		}));
	})
);

server.registerTool(
	'export_readable',
	{
		title: 'Export everything as Markdown',
		description:
			'The whole collection, lots, decks (as PTCGL decklists with missing cards) and formats as one Markdown document. Best first call for deck-building advice.',
		inputSchema: { format: z.enum(['markdown', 'json']).optional() }
	},
	guarded(({ format }) => {
		const ctx = context();
		return format === 'json' ? toReadableJson(ctx.data, ctx.catalogue) : toReadableMarkdown(ctx.data, ctx.catalogue);
	})
);

server.registerTool(
	'get_decks',
	{ title: 'List decks', description: 'Every deck with folder path, format, size and how much of it is owned.', inputSchema: {} },
	guarded(() => {
		const ctx = context();
		return ctx.data.decks.map((deck) => {
			const view = api.deckView(ctx.data, ctx.catalogue, deck.id);
			return { id: deck.id, name: deck.name, folder: view.path, format: view.format, cards: view.total, ownedCoverage: view.buylist.coverage, missing: view.buylist.totalMissing, description: deck.description };
		});
	})
);

server.registerTool(
	'get_deck',
	{
		title: 'Get one deck',
		description: 'A deck in full: each card with quantity and how many the user owns (by name, any printing), plus the buylist of what is missing.',
		inputSchema: { deck: z.string().describe('Deck name or id') }
	},
	guarded(({ deck }) => {
		const ctx = context();
		const view = api.deckView(ctx.data, ctx.catalogue, deck);
		return {
			id: view.deck.id,
			name: view.deck.name,
			folder: view.path,
			format: view.format,
			description: view.deck.description,
			total: view.total,
			ownedCoverage: view.buylist.coverage,
			cards: view.entries.map((entry) => ({ quantity: entry.quantity, owned: entry.owned, ...cardSummary(entry.card) })),
			missing: view.buylist.rows.map((row) => ({ name: row.name, needed: row.needed, owned: row.owned, missing: row.missing, suggestion: api.describeCard(row.suggestion) })),
			decklist: view.entries.map((entry) => `${entry.quantity} ${api.describeCard(entry.card)}`).join('\n')
		};
	})
);

server.registerTool(
	'diff_decks',
	{
		title: 'Compare two decks',
		description:
			'Two decks side by side — what came in, what went out, what stayed, and how similar the lists are. Cards are matched by name, so a different printing of the same card is not a change (those are reported separately as reprint swaps). Use it to compare two versions of one archetype.',
		inputSchema: { a: z.string().describe('The deck to compare from — name or id'), b: z.string().describe('The deck to compare to — name or id') }
	},
	guarded(({ a, b }) => {
		const ctx = context();
		const view = api.deckDiffView(ctx.data, ctx.catalogue, a, b);
		const { diff } = view;
		return {
			a: view.a,
			b: view.b,
			similarity: diff.similarity,
			changes: diff.changes,
			reprintSwaps: diff.reprints,
			copiesIn: diff.added,
			copiesOut: diff.removed,
			sections: diff.groups,
			cards: diff.rows.map((row) => ({
				name: row.name,
				supertype: row.supertype,
				status: row.status,
				inA: row.a,
				inB: row.b,
				delta: row.delta,
				reprintOnly: row.reprintOnly,
				printings: { a: row.printings.a.map(api.describeCard), b: row.printings.b.map(api.describeCard) }
			})),
			changesAsText: diffToText(diff),
			toBuy: view.toBuy.rows.map((row) => ({ name: row.name, needed: row.needed, owned: row.owned, missing: row.missing, suggestion: api.describeCard(row.suggestion) })),
			toBuyTotal: view.toBuy.totalMissing
		};
	})
);

server.registerTool(
	'check_legality',
	{ title: 'Check deck legality', description: "Check a deck against its format's rules (deck size, copy limits, bans, pool). Null when the deck has no format.", inputSchema: { deck: z.string() } },
	guarded(({ deck }) => api.deckLegality(context().data, catalogue, deck) ?? { legal: null, note: 'This deck has no format assigned.' })
);

server.registerTool(
	'search_cards',
	{
		title: 'Search the card catalogue',
		description: 'Find printings by (partial) name, optionally within one set code such as OBF or MEG. Newest sets first.',
		inputSchema: { query: z.string(), set: z.string().optional(), limit: z.number().int().min(1).max(100).optional() }
	},
	guarded(({ query, set, limit }) => api.search(catalogue, query, set, limit ?? 30).map(cardSummary))
);

server.registerTool(
	'resolve_card',
	{
		title: 'Resolve a card reference',
		description: 'What "MEG 21", "me01-021" or "Charizard ex" points to in the catalogue.',
		inputSchema: { spec: z.string() }
	},
	guarded(({ spec }) => {
		const match = api.resolveCardSpec(catalogue, spec);
		return { ...match, card: cardSummary(match.card) };
	})
);

server.registerTool(
	'quick_add',
	{
		title: 'Add cards to the collection',
		description:
			'Add owned cards by set code and number, one per line: "MEG 21", "3 PAL 188 rh" (rh = reverse holo, h = holo). Optionally into a lot; createLot makes the lot if it does not exist.',
		inputSchema: {
			lines: z.string().describe('One card per line'),
			lot: z.string().optional(),
			createLot: z.boolean().optional(),
			finish: finishSchema.optional()
		}
	},
	guarded(({ lines, lot, createLot, finish }) => {
		const ctx = context();
		const result = api.quickAdd(ctx, lines, { lot, createLot, finish });
		if (result.added.length) saveData(dataPath, api.finalize(result.data));
		return {
			added: result.added.map((a) => ({ quantity: a.quantity, finish: a.finish, ...cardSummary(a.card) })),
			failed: result.failed,
			warnings: result.warnings
		};
	})
);

server.registerTool(
	'create_deck',
	{
		title: 'Create a deck',
		description:
			'Create a deck, optionally from a PTCGL decklist ("4 Charizard ex OBF 125" per line, section headers allowed) and into a folder path like "Standard/2026" (created if missing).',
		inputSchema: {
			name: z.string(),
			decklist: z.string().optional(),
			folder: z.string().optional(),
			format: z.string().optional().describe('Format name or id')
		}
	},
	guarded(({ name, decklist, folder, format }) => {
		const ctx = context();
		const { data, deck, list } = api.createDeck(ctx, { name, list: decklist, folder, format });
		saveData(dataPath, api.finalize(data));
		return {
			id: deck.id,
			name: deck.name,
			cards: deck.cards.reduce((sum, card) => sum + card.quantity, 0),
			unresolvedLines: list?.unresolved.map((row) => ({ line: row.entry.raw, note: row.note })) ?? [],
			guessedByName: list?.resolved.filter((row) => row.card && row.match !== 'exact').map((row) => ({ line: row.entry.raw, used: api.describeCard(row.card!) })) ?? [],
			warnings: list?.warnings ?? []
		};
	})
);

server.registerTool(
	'replace_deck_list',
	{ title: 'Replace a deck list', description: 'Replace every card in an existing deck with a PTCGL decklist.', inputSchema: { deck: z.string(), decklist: z.string() } },
	guarded(({ deck, decklist }) => {
		const ctx = context();
		const { data, deck: target, list } = api.replaceDeckList(ctx, deck, decklist);
		saveData(dataPath, api.finalize(data));
		return { id: target.id, cards: list.cards.reduce((sum, card) => sum + card.quantity, 0), unresolvedLines: list.unresolved.map((row) => row.entry.raw), warnings: list.warnings };
	})
);

server.registerTool(
	'set_deck_card',
	{
		title: 'Set a card count in a deck',
		description: 'Set how many copies of one card a deck runs; 0 removes it. Card is "SET NUMBER", a TCGdex id, or a name.',
		inputSchema: { deck: z.string(), card: z.string(), quantity: z.number().int().min(0) }
	},
	guarded(({ deck, card, quantity }) => {
		const ctx = context();
		const result = api.setDeckCard(ctx, deck, card, quantity);
		saveData(dataPath, api.finalize(result.data));
		return { deck: result.deck.name, card: api.describeCard(result.card), quantity };
	})
);

server.registerTool(
	'update_deck',
	{
		title: 'Rename, describe or move a deck',
		description: 'Change a deck\'s name, description, or folder path (folders are created as needed; empty folder means top level).',
		inputSchema: { deck: z.string(), name: z.string().optional(), description: z.string().nullable().optional(), folder: z.string().nullable().optional() }
	},
	guarded(({ deck, name, description, folder }) => {
		const ctx = context();
		const result = api.renameDeck(ctx, deck, { name, description, folder });
		saveData(dataPath, api.finalize(result.data));
		return { id: result.deck.id, updated: true };
	})
);

server.registerTool(
	'delete_deck',
	{ title: 'Delete a deck', description: 'Delete a deck. This is remembered as a deletion so it syncs to other devices.', inputSchema: { deck: z.string() } },
	guarded(({ deck }) => {
		const ctx = context();
		const result = api.deleteDeck(ctx, deck);
		saveData(dataPath, api.finalize(result.data));
		return { deleted: result.deck.name };
	})
);

server.registerTool(
	'create_lot',
	{ title: 'Create a lot', description: 'A lot is a batch of cards acquired together; cards can then be quick-added into it.', inputSchema: { name: z.string(), acquiredOn: z.string().optional().describe('YYYY-MM-DD'), note: z.string().optional(), folder: z.string().optional().describe('Lot folder path like "2026/eBay"; missing folders are created') } },
	guarded(({ name, acquiredOn, note, folder }) => {
		const ctx = context();
		const { data, lot } = api.createLot(ctx, { name, acquiredOn: acquiredOn ?? null, note: note ?? null, folder: folder ?? null });
		saveData(dataPath, api.finalize(data));
		return lot;
	})
);

server.registerTool(
	'move_lot',
	{ title: 'Move a lot', description: 'File a lot under a lot folder path like "2026/eBay"; missing folders are created. An empty path puts it at the top level. Lot folders are separate from deck folders.', inputSchema: { lot: z.string(), folder: z.string().describe('Path like "2026/eBay", or "" for the top level') } },
	guarded(({ lot, folder }) => {
		const ctx = context();
		const result = api.moveLot(ctx, lot, folder);
		saveData(dataPath, api.finalize(result.data));
		return { lot: result.lot.name, folder: result.folder?.name ?? null };
	})
);

server.registerTool(
	'get_battles',
	{
		title: "A deck's match record",
		description:
			'How a deck has actually performed: its win-loss record, how it has gone against each opponent deck the owner named, and one row per saved game. Read this before suggesting changes — a deck losing to one archetype needs different advice from one that is simply short of cards.',
		inputSchema: { deck: z.string() }
	},
	guarded(async ({ deck }) => {
		const view = await battles.battlesView(context().data, deck);
		return {
			deck: view.deck,
			record: { ...view.record, label: view.label },
			matchups: view.matchups,
			games: view.games.map((game) => ({
				id: game.log.id,
				playedOn: game.log.playedOn,
				result: game.log.result,
				opponent: game.log.opponent,
				opponentDeck: game.log.opponentDeck,
				turns: game.summary.turns,
				wentFirst: game.summary.wentFirst,
				prizesTaken: game.summary.you?.prizesTaken ?? 0,
				prizesGiven: game.summary.them?.prizesTaken ?? 0,
				note: game.log.note
			}))
		};
	})
);

server.registerTool(
	'get_battle_log',
	{
		title: 'Read one game',
		description:
			"One saved game replayed as text: the result, every card the opponent put into play, and a turn-by-turn transcript of the attacks, knockouts and prizes. Takes a log id, or a deck name for that deck's most recent game.",
		inputSchema: { log: z.string().describe('A battle log id, or a deck name for its latest game') }
	},
	guarded(async ({ log }) => {
		const game = await battles.findBattleLog(context().data, log);
		return {
			id: game.log.id,
			playedOn: game.log.playedOn,
			result: game.log.result,
			player: game.log.player,
			opponent: game.log.opponent,
			opponentDeck: game.log.opponentDeck,
			note: game.log.note,
			summary: {
				turns: game.summary.turns,
				wentFirst: game.summary.wentFirst,
				prizes: {
					taken: game.summary.you?.prizesTaken ?? 0,
					given: game.summary.them?.prizesTaken ?? 0
				},
				yourPokemon: game.summary.you?.pokemon ?? [],
				theirPokemon: game.summary.them?.pokemon ?? [],
				theirCards: game.summary.them?.cards ?? []
			},
			transcript: battles.battleTranscript(game)
		};
	})
);

server.registerTool(
	'save_battle_log',
	{
		title: 'Save a battle log',
		description:
			"Save a game the owner played, pasted straight out of Pokémon TCG Live. Which side of the log is theirs is worked out from the deck's list; pass `player` only if that fails. The result is read from the log unless given.",
		inputSchema: {
			deck: z.string(),
			text: z.string().describe('The whole log, from "Setup" to the last line'),
			player: z.string().optional().describe("The owner's handle in the log, if the guess is wrong"),
			result: z.enum(BATTLE_RESULTS as [BattleResult, ...BattleResult[]]).optional(),
			playedOn: z.string().optional().describe('YYYY-MM-DD; defaults to today'),
			opponentDeck: z.string().optional().describe('What the opponent was playing — drives the matchup table'),
			note: z.string().optional()
		}
	},
	guarded(async ({ deck, text: log, player, result, playedOn, opponentDeck, note }) => {
		const ctx = context();
		const saved = await battles.saveBattleLog(ctx, deck, {
			text: log,
			player,
			result,
			playedOn,
			opponentDeck,
			note
		});
		saveData(dataPath, api.finalize(saved.data));
		return {
			id: saved.log.id,
			result: saved.log.result,
			player: saved.log.player,
			opponent: saved.log.opponent,
			turns: saved.summary.turns,
			theirPokemon: saved.summary.them?.pokemon.map((entry) => entry.name) ?? []
		};
	})
);

server.registerTool(
	'delete_battle_log',
	{
		title: 'Delete a battle log',
		description: 'Delete one saved game by id. Remembered as a deletion so it syncs to other devices.',
		inputSchema: { log: z.string().describe('The battle log id') }
	},
	guarded(({ log }) => {
		const ctx = context();
		const result = battles.deleteBattleLog(ctx, log);
		saveData(dataPath, api.finalize(result.data));
		return { deleted: result.log.id };
	})
);

await server.connect(new StdioServerTransport());
