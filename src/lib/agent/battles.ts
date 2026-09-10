/**
 * Battle logs for the CLI and the MCP server: a deck's record, one game's replay as text,
 * and saving a pasted log.
 *
 * A coach reading a collection cares about two things a decklist cannot tell it — whether
 * the deck wins, and what it loses to — so these read the same records the app's Battles
 * tab shows, through the same parser.
 */
import type { Clock } from '$lib/data/clock';
import { battleLogsFor, type BattleLog, type BattleResult, type UserData } from '$lib/data/model';
import * as mutate from '$lib/data/mutations';
import { buildReplay, parseBattleLog } from '$lib/tcg/battle-log';
import { packLogText, unpackLogText } from '$lib/tcg/battle-log/storage';
import { battleRecord, matchups, recordLabel, type BattleRecord } from '$lib/tcg/battle-log/record';
import { detectPlayer, summarize, type BattleSummary } from '$lib/tcg/battle-log/summary';
import { AgentError, findDeck } from './api';

export type BattleLogView = { log: BattleLog; text: string; summary: BattleSummary };

export type BattlesView = {
	deck: { id: string; name: string };
	record: BattleRecord;
	label: string;
	matchups: ReturnType<typeof matchups>;
	games: BattleLogView[];
};

/** Logs are stored compressed, so reading one is asynchronous all the way up. */
async function view(log: BattleLog): Promise<BattleLogView> {
	const text = await unpackLogText(log);
	return { log, text, summary: summarize(buildReplay(parseBattleLog(text)), log.player) };
}

/** One deck's games, newest first, each parsed for its turn count and prize score. */
export async function battlesView(data: UserData, ref: string): Promise<BattlesView> {
	const deck = findDeck(data, ref);
	const logs = battleLogsFor(data, deck.id);
	const record = battleRecord(logs);
	return {
		deck: { id: deck.id, name: deck.name },
		record,
		label: recordLabel(record),
		matchups: matchups(logs),
		games: await Promise.all(logs.map(view))
	};
}

/** A log by id, or the deck's most recent game when given a deck. */
export function findBattleLog(data: UserData, ref: string): Promise<BattleLogView> {
	const byId = data.battleLogs.find((log) => log.id === ref.trim());
	if (byId) return view(byId);

	const logs = battleLogsFor(data, findDeck(data, ref).id);
	if (!logs.length) throw new AgentError(`No battle logs saved for "${ref}"`);
	return view(logs[0]);
}

/**
 * The game as a readable transcript: one line per turn with what it did, so an agent can
 * read a match without replaying it board by board. Bookkeeping lines are left out.
 */
export function battleTranscript(entry: BattleLogView): string[] {
	const replay = buildReplay(parseBattleLog(entry.text));
	const out: string[] = [];
	let section = '';

	for (const step of replay.steps) {
		const action = step.event.action;
		// Only the lines that move the game: what was used, what died, who took prizes.
		if (!['use', 'knockout', 'prizes', 'evolve', 'promote', 'win'].includes(action.kind)) continue;
		if (step.section !== section) {
			section = step.section;
			out.push('');
			out.push(section);
		}
		const prizes = Object.values(step.state.sides)
			.map((side) => `${side.player} ${side.prizesLeft}`)
			.join(' / ');
		out.push(`  ${step.event.text}   [prizes left: ${prizes}]`);
	}
	return out;
}

export type SaveBattleLogInput = {
	text: string;
	/** The handle that is the user's. Guessed from the deck's list when left out. */
	player?: string;
	result?: BattleResult;
	playedOn?: string;
	opponentDeck?: string;
	note?: string;
};

/**
 * Save a pasted log against a deck. Which side is the user's is guessed from the deck's
 * own list, and refusing rather than guessing wrong is the right call: a log filed under
 * the wrong side reports every win as a loss.
 */
export async function saveBattleLog(
	ctx: { data: UserData; clock: Clock; catalogue: { byId: Map<string, { name: string }> } },
	ref: string,
	input: SaveBattleLogInput
): Promise<{ data: UserData; log: BattleLog; summary: BattleSummary }> {
	const deck = findDeck(ctx.data, ref);
	const text = input.text.trim();
	if (!text) throw new AgentError('The log is empty');

	const parsed = parseBattleLog(text);
	if (parsed.players.length < 2) {
		throw new AgentError(
			'That does not look like a Pokémon TCG Live log — no turns naming two players.'
		);
	}

	const names = deck.cards.flatMap((row) => {
		const card = ctx.catalogue.byId.get(row.cardId);
		return card ? [card.name] : [];
	});
	const guess = detectPlayer(parsed, names);
	const player = input.player?.trim() || guess.player;

	if (!player) {
		throw new AgentError(
			`Could not tell which side of the log is yours from "${deck.name}". Pass --player with one of: ${parsed.players.join(', ')}`
		);
	}
	if (!parsed.players.includes(player)) {
		throw new AgentError(`"${player}" does not play in this log. Players: ${parsed.players.join(', ')}`);
	}

	const summary = summarize(buildReplay(parsed), player);
	const { data, log } = mutate.createBattleLog(ctx.data, ctx.clock, {
		deckId: deck.id,
		...(await packLogText(text)),
		player,
		opponent: parsed.players.find((name) => name !== player) ?? '',
		result: input.result ?? summary.outcome,
		playedOn: input.playedOn ?? undefined,
		opponentDeck: input.opponentDeck ?? null,
		note: input.note ?? null
	});
	// createBattleLog only returns null for a deck that does not exist, and findDeck found it.
	return { data, log: log!, summary };
}

export function deleteBattleLog(ctx: { data: UserData; clock: Clock }, id: string) {
	const log = ctx.data.battleLogs.find((item) => item.id === id.trim());
	if (!log) throw new AgentError(`No battle log with id "${id}"`);
	return { data: mutate.deleteBattleLog(ctx.data, ctx.clock, log.id), log };
}
