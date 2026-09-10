/**
 * What a battle log says about the match, once it has been parsed and replayed: who won,
 * how long it ran, what each player showed, and which handle belongs to the user.
 *
 * The deck list is the only way to tell which side of a log is yours — TCG Live does not
 * mark it — so `detectPlayer` scores each handle by how much of what it played appears in
 * the deck. It is a guess, and the import screen shows it as one.
 */
import { normalizeName } from '../normalize';
import type { ParsedLog } from './parse';
import { buildReplay, finalState, type Replay, type SideState } from './replay';

export type BattleOutcome = 'win' | 'loss' | 'unknown';

/** How confident `detectPlayer` is, so the import screen can say "probably". */
export type PlayerGuess = {
	player: string | null;
	opponent: string | null;
	/** Matching cards for the winning handle, and for the other one. */
	scores: { player: string; matched: number; played: number }[];
	confident: boolean;
};

export type SideSummary = {
	player: string;
	prizesTaken: number;
	/** Pokémon this player put into play, most-played first. */
	pokemon: { name: string; count: number }[];
	/** Everything they played, in the same order — the scouting list. */
	cards: { name: string; count: number }[];
	knockedOut: string[];
};

export type BattleSummary = {
	players: string[];
	winner: string | null;
	/** From the point of view of `player`; unknown when the log stops before the end. */
	outcome: BattleOutcome;
	turns: number;
	wentFirst: string | null;
	you: SideSummary | null;
	them: SideSummary | null;
	/** Steps worth a marker on the scrub bar: knockouts and prizes taken. */
	highlights: { step: number; label: string; player: string | null }[];
	/** Lines the parser did not understand, as a share of the whole log. */
	unrecognized: number;
};

/** A Pokémon name is one the log ever put in play; anything else played is a trainer or energy. */
function sideSummary(side: SideState, pokemonNames: Set<string>): SideSummary {
	const byCount = <T extends { count: number }>(items: T[]) => [...items].sort((a, b) => b.count - a.count);
	return {
		player: side.player,
		prizesTaken: side.prizesTaken,
		pokemon: byCount(side.seen.filter((entry) => pokemonNames.has(normalizeName(entry.name)))),
		cards: byCount(side.seen),
		knockedOut: side.knockedOut
	};
}

/**
 * Names that were in play at some point during the game — the only reliable way to tell a
 * Pokémon from a trainer without the catalogue, which this module deliberately does not read.
 */
function pokemonSeen(replay: Replay): Set<string> {
	const names = new Set<string>();
	for (const step of replay.steps) {
		for (const side of Object.values(step.state.sides)) {
			for (const mon of [side.active, ...side.bench]) {
				for (const card of mon?.stack ?? []) names.add(normalizeName(card));
			}
			for (const name of side.knockedOut) names.add(normalizeName(name));
		}
	}
	return names;
}

export function summarize(replay: Replay, you: string | null): BattleSummary {
	const log = replay.log;
	const final = finalState(replay);
	const names = pokemonSeen(replay);

	const them = you ? (log.players.find((name) => name !== you) ?? null) : null;
	const side = (name: string | null) =>
		name && final.sides[name] ? sideSummary(final.sides[name], names) : null;

	const highlights = replay.steps.flatMap((step, index) => {
		const action = step.event.action;
		if (action.kind === 'knockout') {
			return [{ step: index, label: `${action.target.name} knocked out`, player: action.target.player }];
		}
		if (action.kind === 'prizes') {
			return [
				{
					step: index,
					label: `${action.player} took ${action.count} prize${action.count === 1 ? '' : 's'}`,
					player: action.player
				}
			];
		}
		return [];
	});

	return {
		players: log.players,
		winner: log.winner,
		outcome: !log.winner || !you ? 'unknown' : log.winner === you ? 'win' : 'loss',
		turns: log.sections.filter((section) => section.kind === 'turn').length,
		wentFirst: log.firstPlayer,
		you: side(you),
		them: side(them),
		highlights,
		unrecognized: log.unrecognized
	};
}

/**
 * Which handle in the log is the user's, judged by how much of what each side played is
 * in the deck the log is being filed under. A deck of 60 shares almost nothing with the
 * opponent's beyond staples, so the gap between the two scores is usually decisive; when
 * it is not, `confident` is false and the import screen makes the user choose.
 */
export function detectPlayer(log: ParsedLog, deckCardNames: string[]): PlayerGuess {
	const deck = new Set(deckCardNames.map(normalizeName));
	const replay = buildReplay(log);
	const final = finalState(replay);

	const scores = log.players.map((player) => {
		const seen = final.sides[player]?.seen ?? [];
		return {
			player,
			matched: seen.filter((entry) => deck.has(normalizeName(entry.name))).length,
			played: seen.length
		};
	});

	const ranked = [...scores].sort((a, b) => b.matched - a.matched);
	const best = ranked[0];
	const runnerUp = ranked[1];
	// One clear winner, or none at all: an empty deck matches nobody and stays a question.
	const confident = Boolean(best && best.matched > 0 && (!runnerUp || best.matched > runnerUp.matched));

	return {
		player: confident ? best.player : null,
		opponent: confident ? (log.players.find((name) => name !== best.player) ?? null) : null,
		scores,
		confident
	};
}
