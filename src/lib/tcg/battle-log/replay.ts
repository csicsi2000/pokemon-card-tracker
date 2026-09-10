/**
 * Folds parsed battle-log events into a board position per step, so a replay can be
 * scrubbed the way a chess game can.
 *
 * The log is a narration, not a game state dump, which sets the accuracy this can reach:
 *
 *   - what is in play, how it evolved, what is attached, who was knocked out and how many
 *     prizes each player took is stated outright, so it is exact;
 *   - damage is exact on the defending Pokémon (the attack line gives the total after
 *     weakness) and best-effort for spread and counter-moving effects, where the log
 *     names an owner that is often the acting player rather than the real one;
 *   - hands and decks are not tracked at all. The log reveals one player's draws and not
 *     the other's, so a count would be confidently wrong for half the board. What each
 *     player *put into play* is tracked instead, which is the part worth reviewing.
 *
 * Nothing here touches the catalogue: a step names cards, and the UI resolves those names
 * to printings. That keeps this file a pure fold that tests can drive with plain text.
 */
import type { LogEvent, ParsedLog, Ref } from './parse';

/** One Pokémon in play, evolutions and attachments included. */
export type InPlay = {
	/** Stable across evolutions, so the UI can animate one card growing rather than swapping. */
	uid: string;
	/** The evolution line, basic first. The last entry is what is on top. */
	stack: string[];
	name: string;
	/** In hit points, not counters — 3 counters read as 30. */
	damage: number;
	/** Energy and tools, in the order they went on. */
	attached: string[];
	spot: 'active' | 'bench';
};

export type SideState = {
	player: string;
	active: InPlay | null;
	bench: InPlay[];
	prizesTaken: number;
	prizesLeft: number;
	/** Pokémon that left play knocked out, oldest first. */
	knockedOut: string[];
	/** Every card this player put into play or played, and how often — a scouting list. */
	seen: { name: string; count: number }[];
};

export type BoardState = {
	/** Keyed by handle; `order` gives the two sides a stable left/right. */
	sides: Record<string, SideState>;
	order: [string, string];
	stadium: { card: string; player: string } | null;
	/** Whose turn the step falls in, null during setup and checkups. */
	turnPlayer: string | null;
	turnNumber: number | null;
};

export type ReplayStep = {
	event: LogEvent;
	/** Section heading the event sits under — "Csicsi20's Turn", "Pokémon Checkup". */
	section: string;
	turnNumber: number | null;
	/** The board *after* the event, so stepping forward shows what just happened. */
	state: BoardState;
	/** uids the event touched — what the UI highlights. */
	touched: string[];
};

export type Replay = {
	log: ParsedLog;
	steps: ReplayStep[];
	/** The board before anything happened, for the "rewind to start" position. */
	initial: BoardState;
};

const emptySide = (player: string): SideState => ({
	player,
	active: null,
	bench: [],
	prizesTaken: 0,
	prizesLeft: 6,
	knockedOut: [],
	seen: []
});

function emptyBoard(players: string[]): BoardState {
	const order: [string, string] = [players[0] ?? 'Player 1', players[1] ?? 'Player 2'];
	return {
		sides: { [order[0]]: emptySide(order[0]), [order[1]]: emptySide(order[1]) },
		order,
		stadium: null,
		turnPlayer: null,
		turnNumber: null
	};
}

const cloneMon = (mon: InPlay): InPlay => ({
	...mon,
	stack: [...mon.stack],
	attached: [...mon.attached]
});

const cloneSide = (side: SideState): SideState => ({
	...side,
	active: side.active ? cloneMon(side.active) : null,
	bench: side.bench.map(cloneMon),
	knockedOut: [...side.knockedOut],
	seen: side.seen.map((entry) => ({ ...entry }))
});

const cloneBoard = (board: BoardState): BoardState => ({
	...board,
	sides: Object.fromEntries(
		Object.entries(board.sides).map(([name, side]) => [name, cloneSide(side)])
	),
	stadium: board.stadium ? { ...board.stadium } : null
});

// -- finding things on the board --------------------------------------------

const normal = (name: string) => name.trim().toLocaleLowerCase();

/** The side a handle names, falling back to the first side for an unknown one. */
function sideOf(board: BoardState, player: string | null | undefined): SideState {
	if (player && board.sides[player]) return board.sides[player];
	return board.sides[board.order[0]];
}

const other = (board: BoardState, side: SideState) =>
	board.sides[side.player === board.order[0] ? board.order[1] : board.order[0]];

/** Active first, then the bench in order — the reading order of a real board. */
const allOf = (side: SideState): InPlay[] => (side.active ? [side.active, ...side.bench] : side.bench);

function matchIn(side: SideState, name: string, spot?: 'active' | 'bench'): InPlay | null {
	const needle = normal(name);
	const pool = spot === 'active' ? (side.active ? [side.active] : []) : spot === 'bench' ? side.bench : allOf(side);
	// The name on top is what the log calls it; a pre-evolution still in the stack is the
	// fallback, for the lines that keep calling an Alakazam "Abra".
	return (
		pool.find((mon) => normal(mon.name) === needle) ??
		pool.find((mon) => mon.stack.some((card) => normal(card) === needle)) ??
		null
	);
}

/**
 * The Pokémon a reference points at.
 *
 * The owner the log states is tried first, then the other side — because TCG Live stamps
 * the acting player's handle on Pokémon that belong to their opponent, and a replay that
 * trusted it would put the opponent's damage on your own board.
 */
export function findTarget(
	board: BoardState,
	ref: Ref,
	spot?: 'active' | 'bench'
): { side: SideState; mon: InPlay } | null {
	const claimed = sideOf(board, ref.player);
	const here = matchIn(claimed, ref.name, spot);
	if (here) return { side: claimed, mon: here };

	const across = other(board, claimed);
	const there = matchIn(across, ref.name, spot);
	if (there) return { side: across, mon: there };

	// Still nothing with the spot hint honoured — the log's hint loses to a real match.
	if (spot) {
		const loose = matchIn(claimed, ref.name) ?? matchIn(across, ref.name);
		if (loose) return { side: matchIn(claimed, ref.name) ? claimed : across, mon: loose };
	}
	return null;
}

// -- applying one event ------------------------------------------------------

/** Fresh per replay, so the same log always produces the same uids. */
type Mint = () => string;

const enter = (mint: Mint, name: string, spot: 'active' | 'bench'): InPlay => ({
	uid: mint(),
	stack: [name],
	name,
	damage: 0,
	attached: [],
	spot
});

/** Records a card as played by this side, for the "what they showed" list. */
function note(side: SideState, ...cards: (string | null | undefined)[]) {
	for (const card of cards) {
		if (!card) continue;
		const existing = side.seen.find((entry) => normal(entry.name) === normal(card));
		if (existing) existing.count += 1;
		else side.seen.push({ name: card, count: 1 });
	}
}

function benchIt(side: SideState, mon: InPlay) {
	mon.spot = 'bench';
	side.bench.push(mon);
}

function makeActive(side: SideState, mon: InPlay) {
	side.bench = side.bench.filter((benched) => benched.uid !== mon.uid);
	if (side.active && side.active.uid !== mon.uid) benchIt(side, side.active);
	mon.spot = 'active';
	side.active = mon;
}

function remove(side: SideState, mon: InPlay) {
	if (side.active?.uid === mon.uid) side.active = null;
	side.bench = side.bench.filter((benched) => benched.uid !== mon.uid);
}

const hurt = (mon: InPlay, amount: number) => {
	mon.damage = Math.max(0, mon.damage + amount);
};

/** Applies one event to a board, in place, and reports which Pokémon it touched. */
function apply(board: BoardState, event: LogEvent, mint: Mint): string[] {
	const action = event.action;
	const touched: string[] = [];
	const hit = (mon: InPlay | null | undefined) => {
		if (mon) touched.push(mon.uid);
		return mon;
	};

	switch (action.kind) {
		case 'draw': {
			const side = sideOf(board, action.player);
			if (!action.toBench) break;
			// "drew 2 cards and played them to the Bench" — the • line names the Pokémon.
			for (const card of event.cards) {
				const mon = enter(mint, card, 'bench');
				side.bench.push(mon);
				note(side, card);
				hit(mon);
			}
			break;
		}

		case 'play': {
			const side = sideOf(board, action.player);
			note(side, action.card);
			if (action.to === 'bench') {
				const mon = enter(mint, action.card, 'bench');
				side.bench.push(mon);
				hit(mon);
			} else if (action.to === 'active') {
				const mon = enter(mint, action.card, 'active');
				makeActive(side, mon);
				hit(mon);
			} else if (action.to === 'stadium') {
				board.stadium = { card: action.card, player: action.player };
			}
			break;
		}

		case 'evolve': {
			const side = sideOf(board, action.player);
			const found =
				matchIn(side, action.from, action.spot ?? undefined) ?? matchIn(side, action.from);
			note(side, action.to);
			if (!found) break;
			found.stack.push(action.to);
			found.name = action.to;
			hit(found);
			break;
		}

		case 'attach': {
			const side = sideOf(board, action.player);
			note(side, action.card);
			// "attached X to Abra in the Active Spot" names no owner: it is always your own.
			const target = { player: action.target.player ?? action.player, name: action.target.name };
			const found = findTarget(board, target, action.spot ?? undefined);
			if (found) {
				found.mon.attached.push(action.card);
				hit(found.mon);
			}
			break;
		}

		case 'use': {
			hit(findTarget(board, action.source)?.mon);
			if (!action.target || action.damage === null) break;
			const defender = findTarget(board, action.target, 'active') ?? findTarget(board, action.target);
			if (defender) {
				hurt(defender.mon, action.damage);
				hit(defender.mon);
			}
			break;
		}

		case 'retreat': {
			const side = sideOf(board, action.player);
			const mon = matchIn(side, action.pokemon, 'active') ?? side.active;
			if (mon) {
				side.active = null;
				benchIt(side, mon);
				hit(mon);
			}
			break;
		}

		case 'promote': {
			const found = findTarget(board, action.target);
			if (found) {
				makeActive(found.side, found.mon);
				hit(found.mon);
			}
			break;
		}

		case 'switch': {
			const incoming = findTarget(board, action.incoming);
			if (incoming) {
				makeActive(incoming.side, incoming.mon);
				hit(incoming.mon);
			}
			break;
		}

		case 'knockout': {
			const found = findTarget(board, action.target);
			if (found) {
				remove(found.side, found.mon);
				found.side.knockedOut.push(found.mon.name);
				hit(found.mon);
			}
			break;
		}

		case 'prizes': {
			const side = sideOf(board, action.player);
			side.prizesTaken = Math.min(6, side.prizesTaken + action.count);
			side.prizesLeft = 6 - side.prizesTaken;
			break;
		}

		case 'damage': {
			const found = findTarget(board, action.target);
			if (found) {
				hurt(found.mon, action.amount);
				hit(found.mon);
			}
			break;
		}

		case 'counters': {
			const found = findTarget(board, action.target);
			if (found) {
				hurt(found.mon, action.amount);
				hit(found.mon);
			}
			break;
		}

		case 'move-counters': {
			const from = findTarget(board, action.from);
			const to = findTarget(board, action.to);
			if (from) {
				hurt(from.mon, -action.amount);
				hit(from.mon);
			}
			if (to) {
				hurt(to.mon, action.amount);
				hit(to.mon);
			}
			break;
		}

		case 'heal': {
			const found = findTarget(board, action.target);
			if (found) {
				hurt(found.mon, -action.amount);
				hit(found.mon);
			}
			break;
		}

		case 'prevent': {
			// The counter was placed a line earlier and this takes it back off again.
			const found = findTarget(board, action.target);
			if (found) {
				hurt(found.mon, -10);
				hit(found.mon);
			}
			break;
		}

		case 'discard-from': {
			// Attachments leaving a Pokémon: the • line names them when the log reveals them.
			const found = findTarget(board, action.target);
			if (!found) break;
			hit(found.mon);
			const gone = event.cards.length ? event.cards : action.card ? [action.card] : [];
			for (const card of gone) {
				const index = found.mon.attached.findIndex((held) => normal(held) === normal(card));
				if (index >= 0) found.mon.attached.splice(index, 1);
			}
			break;
		}

		case 'discard': {
			// A stadium is discarded when the other player's replaces it.
			if (action.card && board.stadium && normal(board.stadium.card) === normal(action.card)) {
				board.stadium = null;
			}
			break;
		}

		default:
			break;
	}
	return touched;
}

/**
 * Lines that record the machinery rather than a play: a stadium or tool ability firing
 * once per Pokémon it could apply to, the damage it then prevents, and every shuffle. In
 * the sample games those are a third of the log, and stepping through them one by one
 * buries the actual game — so a replay hides them by default and can put them back.
 */
export const isBookkeeping = (event: LogEvent) =>
	event.action.kind === 'activated' ||
	event.action.kind === 'prevent' ||
	event.action.kind === 'shuffle';

// -- the fold ----------------------------------------------------------------

export function buildReplay(log: ParsedLog): Replay {
	const board = emptyBoard(log.players);
	const initial = cloneBoard(board);
	const steps: ReplayStep[] = [];
	let minted = 0;
	const mint: Mint = () => `p${(minted += 1)}`;

	let running = board;
	for (const section of log.sections) {
		running.turnPlayer = section.kind === 'turn' ? section.player : null;
		if (section.turnNumber !== null) running.turnNumber = section.turnNumber;

		for (const event of section.events) {
			const next = cloneBoard(running);
			const touched = apply(next, event, mint);
			steps.push({
				event,
				section: section.title,
				turnNumber: next.turnNumber,
				state: next,
				touched
			});
			running = next;
		}
	}

	return { log, steps, initial };
}

/** The board as it stands at the end of the log — what the summary reads. */
export const finalState = (replay: Replay): BoardState =>
	replay.steps.at(-1)?.state ?? replay.initial;
