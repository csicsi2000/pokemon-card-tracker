/**
 * `cardex` — the collection from the command line, for people and for coding agents.
 *
 *   npm run cardex -- collection [--lot "july.2 lot"]
 *   npm run cardex -- add "3 MEG 21 rh" --lot "july.2 lot" --create-lot
 *   npm run cardex -- decks
 *   npm run cardex -- deck show "Zard test"
 *   npm run cardex -- deck create "Lost Zone Box" --from list.txt --folder Standard/2026
 *   npm run cardex -- deck set "Zard test" "MEG 21" 2
 *   npm run cardex -- deck diff "Zard test" "Zard v2"
 *   npm run cardex -- buylist "Zard test"
 *   npm run cardex -- search charizard --set OBF
 *   npm run cardex -- export --json > readable.json
 *
 * Every command takes --file <path> (or CARDEX_DATA) and --json for machine output.
 * Run with no arguments for the full list.
 */
import { readFileSync } from 'node:fs';
import * as api from '../src/lib/agent/api';
import * as battles from '../src/lib/agent/battles';
import { recordLabel } from '../src/lib/tcg/battle-log/record';
import { folderPath } from '../src/lib/data/folders';
import { toReadableJson, toReadableMarkdown } from '../src/lib/agent/readable';
import { VARIANT_LABELS, type BattleResult, type CardVariant } from '../src/lib/types';
import { loadCatalogueFromDisk, openData, resolveDataPath, saveData } from './agent-io';

// -- tiny argv parser ---------------------------------------------------------

type Args = { positional: string[]; flags: Record<string, string | boolean> };

function parseArgs(argv: string[]): Args {
	const positional: string[] = [];
	const flags: Record<string, string | boolean> = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg.startsWith('--')) {
			const key = arg.slice(2);
			const next = argv[i + 1];
			if (next !== undefined && !next.startsWith('--')) {
				flags[key] = next;
				i++;
			} else flags[key] = true;
		} else positional.push(arg);
	}
	return { positional, flags };
}

const flagString = (args: Args, key: string) =>
	typeof args.flags[key] === 'string' ? (args.flags[key] as string) : undefined;

const HELP = `cardex — Pokémon TCG collection & decks from the command line

Usage: npm run cardex -- <command> [options]

Reading
  overview                         counts of everything
  collection [--lot NAME]          what you own (all lots, or one; "unsorted" for no lot)
  lots                             the lots, their folder and their sizes
  decks                            every deck with its folder path and owned %
  deck show <deck>                 one deck: list with owned/needed, missing cards
  deck diff <deck> <deck>          two decks side by side: what came in, what went out
  buylist <deck>                   what to buy to complete a deck
  legality <deck>                  check the deck against its format (if it has one)
  battles <deck>                   the deck's match record, matchups and saved games
  battle show <deck|logId>         one game: summary, what the opponent showed, transcript
  search <query> [--set CODE]      find printings by name (up to 30)
  resolve <spec>                   what "MEG 21", "me01-021" or "Charizard ex" points to
  export [--json]                  the whole collection in readable Markdown (or JSON)

Writing (every write is timestamped and merges cleanly into the app on next sync)
  add <lines> [--lot NAME] [--create-lot] [--finish normal|reverse|holo]
                                   quick add: "MEG 21", "3 PAL 188 rh" — several lines OK
  lot create <name> [--date YYYY-MM-DD] [--note TEXT] [--folder A/B]
  lot move <lot> --folder A/B      file a lot (folders created as needed; "" = top level)
  deck create <name> [--from FILE|-] [--folder A/B] [--format NAME]
                                   FILE is a PTCGL decklist; "-" reads stdin
  deck replace <deck> --from FILE|-   replace a deck's list
  deck set <deck> <spec> <qty>     set one card's count (0 removes it)
  deck move <deck> --folder A/B    move a deck (folders are created as needed)
  deck rename <deck> <new name>
  deck delete <deck>
  battle add <deck> --from FILE|-  save a TCG Live battle log ("-" reads stdin)
                                   [--player HANDLE] [--result win|loss|tie] [--date YYYY-MM-DD]
                                   [--opponent-deck TEXT] [--note TEXT]
  battle delete <logId>

Options
  --file PATH   data file (default: $CARDEX_DATA or ./cardex-data.json)
  --json        machine-readable output

<deck> and NAME accept an id or a unique name. <spec> is "SET NUMBER", a TCGdex id, or a name.`;

// -- output helpers -----------------------------------------------------------

const say = (text: string) => process.stdout.write(text + '\n');
const emit = (args: Args, json: unknown, text: () => string) =>
	say(args.flags.json ? JSON.stringify(json, null, 2) : text());

const pad = (value: string | number, width: number) => String(value).padEnd(width);

/** "+2" / "-2" / "0" — a delta you can read at a glance in a column. */
const signed = (delta: number) => (delta > 0 ? `+${delta}` : String(delta));

function readListSource(source: string | undefined): string {
	if (!source) throw new api.AgentError('Give a decklist with --from FILE or --from - (stdin).');
	if (source === '-') return readFileSync(0, 'utf8');
	return readFileSync(source, 'utf8');
}

function describeList(list: api.ListResult | null): string {
	if (!list) return '';
	const lines: string[] = [];
	const total = list.resolved.reduce((sum, row) => sum + (row.card ? row.entry.quantity : 0), 0);
	lines.push(`${total} cards resolved on ${list.resolved.length - list.unresolved.length} lines.`);
	for (const row of list.resolved) {
		if (row.card && row.match !== 'exact') {
			lines.push(`  ~ ${row.entry.raw}  →  ${api.describeCard(row.card)} (${row.match}${row.note ? `: ${row.note}` : ''})`);
		}
	}
	for (const row of list.unresolved) lines.push(`  ✗ ${row.entry.raw}  (${row.note ?? 'not found'})`);
	for (const warning of list.warnings) lines.push(`  ! ${warning}`);
	return lines.join('\n');
}

// -- commands -----------------------------------------------------------------

async function main(argv: string[]) {
	const args = parseArgs(argv);
	const [command, sub, ...rest] = args.positional;
	if (!command || command === 'help' || args.flags.help) return say(HELP);

	const catalogue = loadCatalogueFromDisk();
	const path = resolveDataPath(flagString(args, 'file'));
	const file = openData(path);
	const ctx: api.AgentContext = { data: file.data, catalogue, clock: file.clock };

	const commit = (data: typeof ctx.data) => saveData(path, api.finalize(data));

	switch (command) {
		case 'overview': {
			const rows = api.collectionRows(ctx.data, catalogue);
			const summary = {
				file: path,
				cards: rows.reduce((sum, row) => sum + row.quantity, 0),
				printings: new Set(rows.map((row) => row.card.id)).size,
				wants: ctx.data.wants.length,
				forTrade: ctx.data.trades.length,
				lots: ctx.data.lots.length,
				decks: ctx.data.decks.length,
				folders: ctx.data.folders.length,
				formats: ctx.data.formats.length,
				catalogueGeneratedAt: catalogue.generatedAt
			};
			return emit(args, summary, () =>
				Object.entries(summary)
					.map(([key, value]) => `${pad(key, 22)}${value}`)
					.join('\n')
			);
		}

		case 'collection': {
			const rows = api.collectionRows(ctx.data, catalogue, flagString(args, 'lot'));
			return emit(
				args,
				rows.map((row) => ({
					quantity: row.quantity,
					name: row.card.name,
					set: row.card.set.ptcglCode ?? row.card.set.id,
					number: row.card.localId,
					finish: row.finish,
					lot: row.lot?.name ?? 'Unsorted',
					id: row.card.id
				})),
				() =>
					rows.length
						? rows
								.map(
									(row) =>
										`${pad(row.quantity + '×', 5)}${pad(row.card.name, 32)}${pad(`${row.card.set.ptcglCode ?? row.card.set.id} ${row.card.localId}`, 14)}${pad(VARIANT_LABELS[row.finish], 14)}${row.lot?.name ?? 'Unsorted'}`
								)
								.join('\n')
						: 'Nothing here yet.'
			);
		}

		case 'lots': {
			const counts = new Map<string | null, number>();
			for (const row of ctx.data.collection) counts.set(row.lotId, (counts.get(row.lotId) ?? 0) + row.quantity);
			const lots = [
				{ id: null as string | null, name: 'Unsorted', acquiredOn: null as string | null, note: null as string | null, folderId: null as string | null },
				...ctx.data.lots
			].map((lot) => ({
				...lot,
				cards: counts.get(lot.id) ?? 0,
				folder: folderPath(ctx.data.lotFolders, lot.folderId).map((f) => f.name).join('/')
			}));
			return emit(args, lots, () =>
				lots.map((lot) => `${pad(lot.cards + ' cards', 12)}${pad(lot.name, 28)}${pad(lot.folder, 20)}${lot.acquiredOn ?? ''}${lot.note ? `  ${lot.note}` : ''}`).join('\n')
			);
		}

		case 'decks': {
			const views = ctx.data.decks.map((deck) => api.deckView(ctx.data, catalogue, deck.id));
			return emit(
				args,
				views.map((v) => ({
					id: v.deck.id,
					name: v.deck.name,
					folder: v.path,
					format: v.format,
					cards: v.total,
					ownedCoverage: v.buylist.coverage,
					missing: v.buylist.totalMissing
				})),
				() =>
					views.length
						? views
								.map(
									(v) =>
										`${pad(v.deck.name, 30)}${pad(v.path.join('/') || '(top level)', 28)}${pad(v.total + ' cards', 10)}${pad(Math.round(v.buylist.coverage * 100) + '% owned', 12)}${v.format ?? ''}`
								)
								.join('\n')
						: 'No decks yet.'
			);
		}

		case 'battles': {
			if (!sub) throw new api.AgentError('Usage: battles <deck>');
			const view = battles.battlesView(ctx.data, [sub, ...rest].join(' '));
			return emit(
				args,
				{
					deck: view.deck,
					record: view.record,
					matchups: view.matchups,
					games: view.games.map((game) => ({
						id: game.log.id,
						playedOn: game.log.playedOn,
						result: game.log.result,
						opponent: game.log.opponent,
						opponentDeck: game.log.opponentDeck,
						turns: game.summary.turns,
						prizesTaken: game.summary.you?.prizesTaken ?? 0,
						prizesGiven: game.summary.them?.prizesTaken ?? 0,
						note: game.log.note
					}))
				},
				() =>
					[
						`${view.deck.name}: ${view.label} over ${view.record.played} game${view.record.played === 1 ? '' : 's'}`,
						...(view.matchups.length
							? ['', 'By opponent deck:', ...view.matchups.map((m) => `  ${pad(m.label, 30)}${recordLabel(m.record)}`)]
							: []),
						'',
						...(view.games.length
							? view.games.map(
									(game) =>
										`${pad(game.log.playedOn ?? game.log.createdAt.slice(0, 10), 12)}${pad(game.log.result, 8)}${pad(`vs ${game.log.opponentDeck ?? game.log.opponent}`, 28)}${pad(`${game.summary.turns} turns`, 10)}${pad(`prizes ${game.summary.you?.prizesTaken ?? 0}-${game.summary.them?.prizesTaken ?? 0}`, 14)}${game.log.id}`
								)
							: ['No games saved for this deck yet.'])
					].join('\n')
			);
		}

		case 'battle': {
			switch (sub) {
				case 'show': {
					if (!rest[0]) throw new api.AgentError('Usage: battle show <deck|logId>');
					const game = battles.findBattleLog(ctx.data, rest.join(' '));
					const transcript = battles.battleTranscript(game);
					return emit(
						args,
						{ log: { ...game.log, text: undefined }, summary: game.summary, transcript },
						() =>
							[
								`${game.log.player} vs ${game.log.opponentDeck ?? game.log.opponent} — ${game.log.result}`,
								`${game.summary.turns} turns · prizes ${game.summary.you?.prizesTaken ?? 0}-${game.summary.them?.prizesTaken ?? 0}${game.summary.wentFirst ? ` · ${game.summary.wentFirst} went first` : ''}`,
								...(game.log.note ? ['', `Note: ${game.log.note}`] : []),
								'',
								`They showed: ${game.summary.them?.cards.map((entry) => (entry.count > 1 ? `${entry.name} x${entry.count}` : entry.name)).join(', ') ?? '(unknown)'}`,
								...transcript
							].join('\n')
					);
				}
				case 'add': {
					if (!rest[0]) throw new api.AgentError('Usage: battle add <deck> --from FILE|-');
					const from = flagString(args, 'from');
					if (!from) throw new api.AgentError('battle add needs --from FILE (or "-" for stdin)');
					const text = from === '-' ? readFileSync(0, 'utf8') : readFileSync(from, 'utf8');
					const result = flagString(args, 'result');
					const { data, log, summary } = battles.saveBattleLog(ctx, rest.join(' '), {
						text,
						player: flagString(args, 'player'),
						result: result as BattleResult | undefined,
						playedOn: flagString(args, 'date'),
						opponentDeck: flagString(args, 'opponent-deck'),
						note: flagString(args, 'note')
					});
					commit(data);
					return emit(args, { log: { ...log, text: undefined }, summary }, () =>
						`Saved a ${log.result} against ${log.opponentDeck ?? log.opponent} — ${summary.turns} turns, prizes ${summary.you?.prizesTaken ?? 0}-${summary.them?.prizesTaken ?? 0} (${log.id})`
					);
				}
				case 'delete': {
					if (!rest[0]) throw new api.AgentError('Usage: battle delete <logId>');
					const { data, log } = battles.deleteBattleLog(ctx, rest[0]);
					commit(data);
					return emit(args, { deleted: log.id }, () => `Deleted the game against ${log.opponent}.`);
				}
				default:
					throw new api.AgentError('Usage: battle show|add|delete …');
			}
		}

		case 'buylist':
		case 'legality': {
			if (!sub) throw new api.AgentError(`Usage: ${command} <deck>`);
			if (command === 'legality') {
				const report = api.deckLegality(ctx.data, catalogue, sub);
				if (!report) return say('This deck has no format, so there is nothing to check against.');
				return emit(args, report, () =>
					report.legal ? 'Legal.' : report.issues.map((issue) => `- ${issue.message}`).join('\n')
				);
			}
			const view = api.deckView(ctx.data, catalogue, sub);
			return emit(args, view.buylist, () =>
				view.buylist.rows.length
					? [
							`${view.buylist.totalMissing} cards to buy · ${Math.round(view.buylist.coverage * 100)}% owned`,
							...view.buylist.rows.map(
								(row) => `${pad(row.missing + '×', 5)}${pad(row.name, 32)}need ${row.needed}, own ${row.owned}  e.g. ${api.describeCard(row.suggestion)}`
							)
						].join('\n')
					: 'You own everything in this deck.'
			);
		}

		case 'search': {
			if (!sub) throw new api.AgentError('Usage: search <query> [--set CODE]');
			const cards = api.search(catalogue, [sub, ...rest].join(' '), flagString(args, 'set'));
			return emit(
				args,
				cards.map((card) => ({ id: card.id, name: card.name, set: card.set.ptcglCode ?? card.set.id, setName: card.set.name, number: card.localId, supertype: card.supertype, rarity: card.rarity, standard: card.set.legalStandard })),
				() => (cards.length ? cards.map((card) => `${pad(api.describeCard(card), 48)}${card.set.name}`).join('\n') : 'Nothing found.')
			);
		}

		case 'resolve': {
			if (!sub) throw new api.AgentError('Usage: resolve <spec>');
			const match = api.resolveCardSpec(catalogue, [sub, ...rest].join(' '));
			return emit(args, { ...match, card: match.card && { id: match.card.id, name: match.card.name, set: match.card.set.ptcglCode, number: match.card.localId } }, () =>
				match.card ? `${api.describeCard(match.card)} (${match.card.id}, by ${match.how})${match.note ? `\n${match.note}` : ''}` : (match.note ?? 'No match')
			);
		}

		case 'export': {
			if (args.flags.json) return say(JSON.stringify(toReadableJson(ctx.data, catalogue), null, 2));
			return say(toReadableMarkdown(ctx.data, catalogue));
		}

		case 'add': {
			const text = [sub, ...rest].filter(Boolean).join('\n');
			if (!text.trim()) throw new api.AgentError('Usage: add "3 MEG 21 rh" ["PAL 188" ...] [--lot NAME]');
			const result = api.quickAdd(ctx, text, {
				lot: flagString(args, 'lot'),
				createLot: Boolean(args.flags['create-lot']),
				finish: flagString(args, 'finish') as CardVariant | undefined
			});
			if (result.added.length) commit(result.data);
			return emit(
				args,
				{ added: result.added.map((a) => ({ id: a.card.id, name: a.card.name, quantity: a.quantity, finish: a.finish })), failed: result.failed, warnings: result.warnings },
				() =>
					[
						...result.added.map((a) => `+ ${a.quantity}× ${api.describeCard(a.card)} (${VARIANT_LABELS[a.finish]})`),
						...result.failed.map((f) => `✗ ${f.line}: ${f.note}`),
						...result.warnings.map((w) => `! ${w}`)
					].join('\n') || 'Nothing added.'
			);
		}

		case 'lot': {
			if (sub === 'create' && rest[0]) {
				const { data, lot } = api.createLot(ctx, { name: rest.join(' '), acquiredOn: flagString(args, 'date') ?? null, note: flagString(args, 'note') ?? null, folder: flagString(args, 'folder') ?? null });
				commit(data);
				return emit(args, lot, () => `Created lot "${lot.name}" (${lot.id})`);
			}
			if (sub === 'move' && rest[0]) {
				const { data, lot, folder } = api.moveLot(ctx, rest.join(' '), flagString(args, 'folder') ?? null);
				commit(data);
				const where = folder ? folderPath(data.lotFolders, folder.id).map((f) => f.name).join('/') : 'the top level';
				return emit(args, { id: lot.id, name: lot.name, folder: where }, () => `Moved "${lot.name}" to ${where}`);
			}
			throw new api.AgentError('Usage: lot create <name> [--date YYYY-MM-DD] [--note TEXT] [--folder A/B]  |  lot move <lot> --folder A/B');
		}

		case 'deck': {
			switch (sub) {
				case 'show': {
					if (!rest[0]) throw new api.AgentError('Usage: deck show <deck>');
					const view = api.deckView(ctx.data, catalogue, rest.join(' '));
					return emit(
						args,
						{ id: view.deck.id, name: view.deck.name, folder: view.path, format: view.format, total: view.total, cards: view.entries.map((e) => ({ quantity: e.quantity, owned: e.owned, name: e.card.name, set: e.card.set.ptcglCode ?? e.card.set.id, number: e.card.localId, id: e.card.id })), missing: view.buylist.rows },
						() =>
							[
								`${view.deck.name} — ${view.total} cards · ${view.path.join('/') || 'top level'}${view.format ? ` · ${view.format}` : ''} · ${Math.round(view.buylist.coverage * 100)}% owned`,
								...view.entries.map((e) => `${pad(e.quantity + '×', 5)}${pad(api.describeCard(e.card), 44)}own ${e.owned}${e.owned < e.quantity ? '  ← short' : ''}`)
							].join('\n')
					);
				}
				case 'diff': {
					if (!rest[0] || !rest[1]) {
						throw new api.AgentError('Usage: deck diff <deck> <deck>  (quote names containing spaces)');
					}
					const view = api.deckDiffView(ctx.data, catalogue, rest[0], rest[1]);
					const { diff } = view;
					return emit(
						args,
						{
							a: view.a,
							b: view.b,
							similarity: diff.similarity,
							changes: diff.changes,
							reprints: diff.reprints,
							copiesIn: diff.added,
							copiesOut: diff.removed,
							sections: diff.groups,
							rows: diff.rows
								.filter((row) => row.delta !== 0 || row.reprintOnly)
								.map((row) => ({
									name: row.name,
									supertype: row.supertype,
									status: row.status,
									a: row.a,
									b: row.b,
									delta: row.delta,
									reprintOnly: row.reprintOnly,
									printings: {
										a: row.printings.a.map(api.describeCard),
										b: row.printings.b.map(api.describeCard)
									}
								})),
							toBuy: view.toBuy
						},
						() => {
							const lines = [
								`${view.a.name}  →  ${view.b.name}`,
								`${view.a.total} → ${view.b.total} cards · ${Math.round(diff.similarity * 100)}% the same list · ${diff.added} in, ${diff.removed} out${diff.reprints ? ` · ${diff.reprints} reprint swap${diff.reprints === 1 ? '' : 's'}` : ''}`,
								'',
								...diff.groups.map(
									(group) => `${pad(group.label, 12)}${pad(`${group.a} → ${group.b}`, 12)}${signed(group.delta)}`
								)
							];
							for (const supertype of ['Pokemon', 'Trainer', 'Energy'] as const) {
								const rows = diff.rows.filter(
									(row) => row.supertype === supertype && (row.delta !== 0 || row.reprintOnly)
								);
								if (!rows.length) continue;
								lines.push('', diff.groups.find((g) => g.supertype === supertype)!.label);
								for (const row of rows) {
									const printings = row.reprintOnly
										? `  (${row.printings.a.map(api.describeCard).join(', ')} → ${row.printings.b.map(api.describeCard).join(', ')})`
										: '';
									lines.push(
										`  ${pad(row.delta === 0 ? '  =' : signed(row.delta), 5)}${pad(row.name, 34)}${row.a} → ${row.b}${printings}`
									);
								}
							}
							if (diff.changes === 0 && diff.reprints === 0) lines.push('', 'The two lists are identical.');
							lines.push(
								'',
								view.toBuy.totalMissing
									? `Switching to "${view.b.name}" needs ${view.toBuy.totalMissing} card${view.toBuy.totalMissing === 1 ? '' : 's'} you do not own: ${view.toBuy.rows.map((row) => `${row.missing}× ${row.name}`).join(', ')}`
									: 'You own every card the switch would need.'
							);
							return lines.join('\n');
						}
					);
				}
				case 'create': {
					if (!rest[0]) throw new api.AgentError('Usage: deck create <name> [--from FILE|-] [--folder A/B]');
					const from = flagString(args, 'from');
					const { data, deck, list } = api.createDeck(ctx, { name: rest.join(' '), list: from ? readListSource(from) : undefined, folder: flagString(args, 'folder'), format: flagString(args, 'format') });
					commit(data);
					return emit(args, { id: deck.id, name: deck.name, cards: deck.cards.reduce((s, c) => s + c.quantity, 0), unresolved: list?.unresolved.map((r) => r.entry.raw) ?? [] }, () => `Created deck "${deck.name}" (${deck.id})\n${describeList(list)}`);
				}
				case 'replace': {
					if (!rest[0]) throw new api.AgentError('Usage: deck replace <deck> --from FILE|-');
					const { data, deck, list } = api.replaceDeckList(ctx, rest.join(' '), readListSource(flagString(args, 'from')));
					commit(data);
					return emit(args, { id: deck.id, unresolved: list.unresolved.map((r) => r.entry.raw) }, () => `Replaced the list of "${deck.name}"\n${describeList(list)}`);
				}
				case 'set': {
					const quantity = Number(rest.at(-1));
					const deckRef = rest[0];
					const spec = rest.slice(1, -1).join(' ');
					if (!deckRef || !spec || !Number.isFinite(quantity)) throw new api.AgentError('Usage: deck set <deck> <spec> <qty>');
					const { data, deck, card } = api.setDeckCard(ctx, deckRef, spec, quantity);
					commit(data);
					return emit(args, { deck: deck.id, card: card.id, quantity }, () => `${deck.name}: ${api.describeCard(card)} → ${quantity}`);
				}
				case 'move':
				case 'rename': {
					if (!rest[0]) throw new api.AgentError(`Usage: deck ${sub} <deck> ...`);
					const changes = sub === 'move' ? { folder: flagString(args, 'folder') ?? null } : { name: rest.slice(1).join(' ') };
					const { data, deck } = api.renameDeck(ctx, rest[0], changes);
					commit(data);
					return emit(args, { id: deck.id, ...changes }, () => `Updated "${deck.name}".`);
				}
				case 'delete': {
					if (!rest[0]) throw new api.AgentError('Usage: deck delete <deck>');
					const { data, deck } = api.deleteDeck(ctx, rest.join(' '));
					commit(data);
					return emit(args, { deleted: deck.id }, () => `Deleted "${deck.name}".`);
				}
				default:
					throw new api.AgentError('Usage: deck show|diff|create|replace|set|move|rename|delete …');
			}
		}

		default:
			throw new api.AgentError(`Unknown command "${command}". Run without arguments for help.`);
	}
}

main(process.argv.slice(2)).catch((error: Error) => {
	process.stderr.write(`${error.name === 'AgentError' ? '' : `${error.name}: `}${error.message}\n`);
	process.exit(1);
});
