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
 *   - hand and deck *sizes* are counted from what the log says moved: every draw, every
 *     card played, every shuffle back. The names in a hand are known only when the log
 *     revealed them — your own draws are spelled out, the opponent's are not — so
 *     `hand.known` is complete for your side and nearly empty for theirs. The counts are
 *     right for both as long as every card that changed zones was narrated, which holds
 *     for the sample games; an effect the log describes in a sentence we do not know
 *     drifts the count by one, never more.
 *   - the discard pile lists the cards the log named on their way there: knocked-out
 *     Pokémon with what was attached, trainers played, energy discarded, stadiums
 *     replaced. Cards discarded facelessly ("discarded 2 cards") add to the count only.
 *
 * Nothing here touches the catalogue: a step names cards, and the UI resolves those names
 * to printings. That keeps this file a pure fold that tests can drive with plain text.
 */
import type { LogAction, LogEvent, ParsedLog, Ref } from './parse';

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
	/** Special conditions in force — "Poisoned", "Asleep" — cleared when it leaves the Active Spot. */
	conditions: string[];
	spot: 'active' | 'bench';
};

export type SideState = {
	player: string;
	active: InPlay | null;
	bench: InPlay[];
	prizesTaken: number;
	prizesLeft: number;
	/** How many cards are in hand, and the ones the log named on the way in. */
	hand: { count: number; known: string[] };
	/** Cards left in the deck. Starts at 60 and follows every draw and shuffle. */
	deck: number;
	/** Cards the log named going to the discard pile, oldest first. */
	discard: string[];
	/** Cards that went to the discard pile without being named — Lillie's "discarded 2 cards". */
	discardUnknown: number;
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

const DECK_SIZE = 60;
const PRIZE_COUNT = 6;

const emptySide = (player: string): SideState => ({
	player,
	active: null,
	bench: [],
	prizesTaken: 0,
	prizesLeft: PRIZE_COUNT,
	hand: { count: 0, known: [] },
	deck: DECK_SIZE,
	discard: [],
	discardUnknown: 0,
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
	attached: [...mon.attached],
	conditions: [...mon.conditions]
});

const cloneSide = (side: SideState): SideState => ({
	...side,
	active: side.active ? cloneMon(side.active) : null,
	bench: side.bench.map(cloneMon),
	hand: { count: side.hand.count, known: [...side.hand.known] },
	discard: [...side.discard],
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
 * Three Abras on the bench and "Abra is now in the Active Spot", or "Abra took 30 damage"
 * from a spread attack: the log does not say which. The one carrying energy is the one a
 * player promotes and the one an opponent aims at, so promotions and damage prefer it.
 * Evolutions and attachments keep board order, because there the first is as good a
 * guess as any and a stable choice keeps the stacks consistent with each other.
 */
function loaded<T extends { side: SideState; mon: InPlay } | null>(found: T): T {
	if (!found || found.mon.spot === 'active') return found;
	const siblings = found.side.bench.filter((mon) => normal(mon.name) === normal(found.mon.name));
	const best = siblings.reduce(
		(top, next) => (next.attached.length > top.attached.length ? next : top),
		found.mon
	);
	return { ...found, mon: best } as T;
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

// -- zones -------------------------------------------------------------------

/** Takes one named card out of a list, if it is there; the first match goes. */
function pull(list: string[], card: string): boolean {
	const index = list.findIndex((held) => normal(held) === normal(card));
	if (index < 0) return false;
	list.splice(index, 1);
	return true;
}

function toHand(side: SideState, count: number, ...known: (string | null | undefined)[]) {
	side.hand.count += count;
	for (const card of known) if (card) side.hand.known.push(card);
}

/** A card leaves the hand — the count drops, and so does the name if it was known. */
function fromHand(side: SideState, card?: string | null, count = 1) {
	side.hand.count = Math.max(0, side.hand.count - count);
	if (card) pull(side.hand.known, card);
}

const fromDeck = (side: SideState, count: number) => {
	side.deck = Math.max(0, side.deck - count);
};

function toDiscard(side: SideState, ...cards: (string | null | undefined)[]) {
	for (const card of cards) if (card) side.discard.push(card);
}

// -- applying one event ------------------------------------------------------

/** Fresh per replay, so the same log always produces the same uids. */
type Mint = () => string;

/**
 * What one event needs to know about the ones before it. The log narrates some moves
 * twice — a stadium replaced is "played X to the Stadium spot" *and* "discarded Y", a
 * prize taken is "took a Prize card" *and* "A card was added to hand" — and the second
 * telling must not move the card again.
 */
type Fold = {
	mint: Mint;
	/** The action of the previous event, whatever its depth. */
	previous: LogAction | null;
	/** A stadium just knocked off the board by a new one; its "discarded" line is a restatement. */
	replacedStadium: { card: string; player: string } | null;
	/** Prize cards just taken whose "was added to hand" lines are still to come. */
	prizePending: number;
	/** Whose Pokemon was just knocked out - its "cards were discarded from" line names a card no longer on the board. */
	knockedOut: string | null;
	/** The Pokemon whose ability the current top-level line is using, for the sub-lines under it. */
	abilityUser: { side: SideState; mon: InPlay } | null;
};

const enter = (mint: Mint, name: string, spot: 'active' | 'bench'): InPlay => ({
	uid: mint(),
	stack: [name],
	name,
	damage: 0,
	attached: [],
	conditions: [],
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

/** Special conditions end when a Pokémon leaves the Active Spot or evolves. */
function benchIt(side: SideState, mon: InPlay) {
	mon.spot = 'bench';
	mon.conditions = [];
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
function apply(board: BoardState, event: LogEvent, fold: Fold): string[] {
	const action = event.action;
	const touched: string[] = [];
	const hit = (mon: InPlay | null | undefined) => {
		if (mon) touched.push(mon.uid);
		return mon;
	};

	switch (action.kind) {
		case 'draw': {
			const side = sideOf(board, action.player);
			if (action.toBench) {
				// "drew 2 cards and played them to the Bench" — the • line names the Pokémon.
				fromDeck(side, action.count);
				for (const card of event.cards) {
					const mon = enter(fold.mint, card, 'bench');
					side.bench.push(mon);
					note(side, card);
					hit(mon);
				}
				break;
			}
			fromDeck(side, action.count);
			toHand(side, action.count, ...event.cards);
			// Prizes are set aside right after the opening hand; the log never mentions it.
			if (action.opening) fromDeck(side, PRIZE_COUNT);
			break;
		}

		case 'play': {
			const side = sideOf(board, action.player);
			// "played Dudunsparce" for a Pokemon already in play, or "played Spikemuth Gym" for
			// the stadium already down, is an ability or effect being used: nothing moves.
			if (action.to === null) {
				const inPlay = matchIn(side, action.card);
				const isStadium = board.stadium && normal(board.stadium.card) === normal(action.card);
				if (inPlay || isStadium) {
					hit(inPlay);
					if (inPlay) fold.abilityUser = { side, mon: inPlay };
					break;
				}
			}
			note(side, action.card);
			if (action.from === 'deck') fromDeck(side, 1);
			else fromHand(side, action.card);

			if (action.to === 'bench') {
				const mon = enter(fold.mint, action.card, 'bench');
				side.bench.push(mon);
				hit(mon);
			} else if (action.to === 'active') {
				const mon = enter(fold.mint, action.card, 'active');
				makeActive(side, mon);
				hit(mon);
			} else if (action.to === 'stadium') {
				if (board.stadium) {
					// The old one is discarded on the spot; the log's own "discarded X" line for
					// it follows and is recognised as a restatement below.
					toDiscard(sideOf(board, board.stadium.player), board.stadium.card);
					fold.replacedStadium = board.stadium;
				}
				board.stadium = { card: action.card, player: action.player };
			} else {
				// A trainer: an Item or Supporter goes straight to the discard pile. (Tools are
				// "attached", stadiums land above, so this is never one of those.)
				toDiscard(side, action.card);
			}
			break;
		}

		case 'evolve': {
			const side = sideOf(board, action.player);
			const found =
				matchIn(side, action.from, action.spot ?? undefined) ?? matchIn(side, action.from);
			note(side, action.to);
			fromHand(side, action.to);
			if (!found) break;
			found.stack.push(action.to);
			found.name = action.to;
			found.conditions = [];
			hit(found);
			break;
		}

		case 'attach': {
			const side = sideOf(board, action.player);
			note(side, action.card);
			// A top-level attach is the turn's energy or a tool from hand. One under an ability
			// or a trainer came from the deck or the discard pile, and the log does not say
			// which — so only the hand is touched, and only for the former.
			if (event.depth === 0) fromHand(side, action.card);
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
			const found = loaded(findTarget(board, action.target));
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
				// Only the top card here: the line that follows ("4 cards were discarded from
				// X") names the pre-evolutions and the energy that went with it.
				toDiscard(found.side, found.mon.name);
				fold.knockedOut = found.side.player;
				hit(found.mon);
			}
			break;
		}

		case 'prizes': {
			const side = sideOf(board, action.player);
			side.prizesTaken = Math.min(PRIZE_COUNT, side.prizesTaken + action.count);
			side.prizesLeft = PRIZE_COUNT - side.prizesTaken;
			// The prize cards go to the hand here; the "was added to hand" lines that follow,
			// one per card, are the same cards again (see 'to-hand').
			toHand(side, action.count);
			fold.prizePending = action.count;
			break;
		}

		case 'to-hand': {
			const side = sideOf(board, action.player);
			if (action.from === 'deck') {
				fromDeck(side, 1);
				toHand(side, 1, action.card);
				break;
			}
			if (fold.prizePending > 0) {
				fold.prizePending -= 1;
				if (action.card) side.hand.known.push(action.card);
				break;
			}
			// A search or a recovery: the card came from somewhere the log did not count.
			toHand(side, 1, action.card);
			break;
		}

		case 'to-hand-from-play': {
			// Scoop Up and friends: the Pokémon and everything on it return to the hand.
			const found = findTarget(board, action.target);
			if (found) {
				remove(found.side, found.mon);
				toHand(found.side, found.mon.stack.length + found.mon.attached.length, ...found.mon.stack);
				hit(found.mon);
			}
			break;
		}

		case 'damage': {
			const found = loaded(findTarget(board, action.target));
			if (found) {
				hurt(found.mon, action.amount);
				hit(found.mon);
			}
			break;
		}

		case 'counters': {
			const found = loaded(findTarget(board, action.target));
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

		case 'revealed': {
			// "7 drawn cards." under a draw, with a • line naming them: the names belong to the
			// hand of whoever just drew. Nothing moves — the draw above already counted them.
			if (fold.previous?.kind === 'draw' && !fold.previous.toBench) {
				sideOf(board, fold.previous.player).hand.known.push(...event.cards);
			}
			break;
		}

		case 'status': {
			const found = findTarget(board, action.target);
			if (!found) break;
			pull(found.mon.conditions, action.condition);
			if (action.on) found.mon.conditions.push(action.condition);
			hit(found.mon);
			break;
		}

		case 'discard-from': {
			// Cards leaving a Pokemon, named on the bullet line when the log reveals them. After a
			// knockout the Pokemon is already off the board, so the side comes from that instead.
			const found = findTarget(board, action.target);
			const side = found?.side ?? (fold.knockedOut ? board.sides[fold.knockedOut] : null);
			if (!side) break;
			hit(found?.mon);
			const gone = event.cards.length ? event.cards : action.card ? [action.card] : [];
			for (const card of gone) {
				if (found) pull(found.mon.attached, card);
				toDiscard(side, card);
			}
			if (gone.length === 0) side.discardUnknown += action.count;
			break;
		}

		case 'discard': {
			const side = sideOf(board, action.player);
			const replaced = fold.replacedStadium;
			if (action.card && replaced && normal(replaced.card) === normal(action.card)) {
				// Already moved when the new stadium was played.
				fold.replacedStadium = null;
				break;
			}
			if (action.card && board.stadium && normal(board.stadium.card) === normal(action.card)) {
				// A stadium leaving on its own (its owner's effect, or a Field Blower).
				toDiscard(sideOf(board, board.stadium.player), board.stadium.card);
				board.stadium = null;
				break;
			}
			// Otherwise it is cards from the hand — the cost of an Ultra Ball, a Sacred Ash's
			// discard, Lillie's "discarded 2 cards" — named when the log revealed them.
			const named = event.cards.length ? event.cards : action.card ? [action.card] : [];
			fromHand(side, null, action.count);
			for (const card of named) pull(side.hand.known, card);
			toDiscard(side, ...named);
			if (named.length === 0) side.discardUnknown += action.count;
			break;
		}

		case 'shuffle-in': {
			const side = sideOf(board, action.player);
			// Dudunsparce's Run Away Draw: "shuffle this Pokemon and all attached cards into
			// your deck". Under the ability's own line, a count (and the names, when the log
			// gives them) matching the user's stack and attachments is unmistakable.
			const user = fold.abilityUser;
			const userCards = user ? [...user.mon.stack, ...user.mon.attached].map(normal).sort() : [];
			const namesMatchUser =
				event.cards.length === 0 ||
				(event.cards.length === userCards.length &&
					event.cards.map(normal).sort().every((card, index) => card === userCards[index]));
			if (
				user &&
				user.side.player === side.player &&
				userCards.length === action.count &&
				namesMatchUser
			) {
				const mon = allOf(side).find((held) => held.uid === user.mon.uid);
				if (mon) {
					remove(side, mon);
					side.deck += action.count;
					hit(mon);
					break;
				}
			}
			// Sacred Ash and Super Rod name what they return from the discard pile; when every
			// named card is there, that is where they came from. Otherwise it is the hand
			// (Lillie's Determination, Iono), whose names are only known for your own side.
			const named = event.cards;
			const fromDiscard =
				named.length > 0 && named.every((card) => side.discard.some((held) => normal(held) === normal(card)));
			if (fromDiscard) {
				for (const card of named) pull(side.discard, card);
			} else {
				fromHand(side, null, action.count);
				if (action.count >= side.hand.known.length + side.hand.count) side.hand.known = [];
				for (const card of named) pull(side.hand.known, card);
			}
			side.deck += action.count;
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
	const fold: Fold = {
		mint: () => `p${(minted += 1)}`,
		previous: null,
		replacedStadium: null,
		prizePending: 0,
		knockedOut: null,
		abilityUser: null
	};

	let running = board;
	for (const section of log.sections) {
		running.turnPlayer = section.kind === 'turn' ? section.player : null;
		if (section.turnNumber !== null) running.turnNumber = section.turnNumber;

		for (const event of section.events) {
			const next = cloneBoard(running);
			// A replaced stadium's "discarded" line is the very next event; anything else
			// between means the two are unrelated.
			const kind = event.action.kind;
			if (event.depth === 0 && kind !== 'discard') fold.replacedStadium = null;
			if (event.depth === 0) fold.abilityUser = null;
			if (kind !== 'prizes' && kind !== 'to-hand') fold.prizePending = 0;
			if (kind !== 'knockout' && kind !== 'discard-from') fold.knockedOut = null;
			const touched = apply(next, event, fold);
			fold.previous = event.action;
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

/**
 * Every card name the log mentions, first mention first — the set a replay viewer wants
 * to have art for before playback starts, so no tile appears blank on its cue.
 */
export function cardNames(log: ParsedLog): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	const add = (...names: (string | null | undefined)[]) => {
		for (const name of names) {
			if (!name) continue;
			const key = normal(name);
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(name);
		}
	};

	for (const event of log.events) {
		add(...event.cards);
		const action = event.action;
		switch (action.kind) {
			case 'play':
			case 'attach':
			case 'activated':
				add(action.card);
				break;
			case 'evolve':
				add(action.from, action.to);
				break;
			case 'retreat':
				add(action.pokemon);
				break;
			case 'use':
				add(action.source.name, action.target?.name);
				break;
			case 'switch':
				add(action.incoming.name, action.outgoing.name);
				break;
			case 'move-counters':
				add(action.from.name, action.to.name);
				break;
			case 'discard':
			case 'discard-from':
			case 'to-hand':
				add(action.card);
				break;
			case 'promote':
			case 'knockout':
			case 'damage':
			case 'counters':
			case 'heal':
			case 'prevent':
			case 'status':
			case 'to-hand-from-play':
				add(action.target.name);
				break;
			default:
				break;
		}
	}
	return out;
}
