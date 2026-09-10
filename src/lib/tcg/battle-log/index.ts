/** Battle logs: parse the text, replay the board, summarise the match. */
export { findPlayers, parseBattleLog } from './parse';
export type { LogAction, LogEvent, LogSection, ParsedLog, Ref, SectionKind, Spot } from './parse';

export { buildReplay, finalState, findTarget, isBookkeeping } from './replay';
export type { BoardState, InPlay, Replay, ReplayStep, SideState } from './replay';

export { buildLogCardIndex, hpOf } from './artwork';
export type { LogCardIndex } from './artwork';

export { battleRecord, matchups, recordLabel } from './record';
export type { BattleRecord } from './record';

export { detectPlayer, summarize } from './summary';
export type { BattleOutcome, BattleSummary, PlayerGuess, SideSummary } from './summary';
