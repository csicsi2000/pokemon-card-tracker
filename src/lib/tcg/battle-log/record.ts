/**
 * A deck's match record, over the logs saved against it.
 *
 * Games whose result was never recorded — a log pasted before the game ended, a
 * disconnect — count as played but sit outside the win rate, so a deck's percentage does
 * not sag because of games nobody knows the outcome of.
 */
import type { BattleLog, BattleResult } from '$lib/types';

export type BattleRecord = {
	wins: number;
	losses: number;
	ties: number;
	unknown: number;
	played: number;
	/** Wins over decided games, or null when none are decided. */
	winRate: number | null;
};

export function battleRecord(logs: { result: BattleResult }[]): BattleRecord {
	const count = (result: BattleResult) => logs.filter((log) => log.result === result).length;
	const wins = count('win');
	const losses = count('loss');
	const ties = count('tie');
	const decided = wins + losses + ties;

	return {
		wins,
		losses,
		ties,
		unknown: count('unknown'),
		played: logs.length,
		winRate: decided > 0 ? wins / decided : null
	};
}

/** "3–1–1" — the shorthand players write, ties dropped when there are none. */
export const recordLabel = (record: BattleRecord) =>
	record.ties > 0
		? `${record.wins}–${record.losses}–${record.ties}`
		: `${record.wins}–${record.losses}`;

/**
 * How each opponent deck has gone, worst matchup first — the question a match log is
 * actually kept to answer. Logs with no opponent deck named are left out; the label is
 * the user's own free text, so it is grouped case-insensitively and shown as first typed.
 */
export function matchups(logs: BattleLog[]) {
	const groups = new Map<string, { label: string; logs: BattleLog[] }>();
	for (const log of logs) {
		const name = log.opponentDeck?.trim();
		if (!name) continue;
		const key = name.toLocaleLowerCase();
		const group = groups.get(key);
		if (group) group.logs.push(log);
		else groups.set(key, { label: name, logs: [log] });
	}

	return [...groups.values()]
		.map((group) => ({ label: group.label, record: battleRecord(group.logs) }))
		.sort(
			(a, b) =>
				(a.record.winRate ?? 1) - (b.record.winRate ?? 1) || b.record.played - a.record.played
		);
}
