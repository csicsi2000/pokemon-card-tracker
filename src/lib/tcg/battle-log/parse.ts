/**
 * Turns a Pokémon TCG Live battle log — the text the client's log panel produces — into
 * sections and typed events.
 *
 * The text has four levels: a section header ("Setup", "Csicsi20's Turn", "Pokémon
 * Checkup"), the events under it, `- ` sub-lines spelling out what an event did, and
 * `• ` lines naming the cards a sub-line touched.
 *
 * Two things about the source shape everything downstream:
 *
 *   - it stamps the *acting* player's name on every target, so a log says "Csicsi20 put a
 *     damage counter on Csicsi20's Munkidori" about the opponent's Munkidori. The owner in
 *     a reference is a hint, not a fact; replay.ts resolves targets against both boards.
 *   - both `'` and `’` appear as apostrophes, sometimes in one sentence, and card names
 *     ("Marnie's Grimmsnarl ex") contain them too. Player prefixes are therefore stripped
 *     by matching the known player names, never by splitting on the first apostrophe —
 *     which is why the parser reads the player names first and the events second.
 *
 * Anything unrecognised survives as a `note` event carrying its raw text, so a replay
 * still shows every line of the log even when a future set adds a sentence we do not know.
 */

/** Where a Pokémon sits. Some lines say, some do not. */
export type Spot = 'active' | 'bench' | null;

/**
 * A Pokémon the log points at. `player` is what the log claimed — often wrong, see above.
 */
export type Ref = { player: string | null; name: string };

export type LogAction =
	| { kind: 'coin-flip'; player: string; call: string }
	| { kind: 'coin-toss'; player: string }
	| { kind: 'go-first'; player: string }
	| { kind: 'draw'; player: string; count: number; opening: boolean; toBench: boolean }
	/** `from` is where the card came from: the hand, or the deck for "drew X and played it". */
	| {
			kind: 'play';
			player: string;
			card: string;
			to: 'active' | 'bench' | 'stadium' | null;
			from: 'hand' | 'deck';
	  }
	| { kind: 'evolve'; player: string; from: string; to: string; spot: Spot }
	| { kind: 'attach'; player: string; card: string; target: Ref; spot: Spot }
	/** One "used": an attack when it names damage or a target, an ability otherwise. */
	| {
			kind: 'use';
			player: string | null;
			source: Ref;
			move: string;
			target: Ref | null;
			damage: number | null;
	  }
	| { kind: 'retreat'; player: string; pokemon: string }
	| { kind: 'promote'; target: Ref }
	| { kind: 'switch'; incoming: Ref; outgoing: Ref }
	| { kind: 'knockout'; target: Ref }
	| { kind: 'prizes'; player: string; count: number }
	| { kind: 'damage'; target: Ref; amount: number }
	| { kind: 'counters'; target: Ref; amount: number }
	| { kind: 'move-counters'; from: Ref; to: Ref; amount: number }
	| { kind: 'heal'; target: Ref; amount: number }
	| { kind: 'prevent'; target: Ref }
	| { kind: 'discard-from'; target: Ref; count: number; card: string | null }
	| { kind: 'discard'; player: string; count: number; card: string | null }
	| { kind: 'shuffle-in'; player: string; count: number }
	| { kind: 'shuffle'; player: string }
	/** `from` is 'deck' for "drew X"; 'other' for "X was added to hand" (a prize, a search). */
	| { kind: 'to-hand'; player: string; card: string | null; from: 'deck' | 'other' }
	/** "X is now Poisoned." / "X is no longer Asleep." */
	| { kind: 'status'; target: Ref; condition: string; on: boolean }
	| { kind: 'to-hand-from-play'; player: string; target: Ref }
	| { kind: 'activated'; card: string }
	/** "7 drawn cards." — the • line under it names them, when the log reveals them. */
	| { kind: 'revealed'; count: number }
	| { kind: 'end-turn'; player: string }
	| { kind: 'win'; player: string }
	| { kind: 'note' };

export type LogEvent = {
	/** 0-based line in the source text — the replay can quote the original. */
	line: number;
	/** 0 for an event, 1 for its `- ` detail, 2 for a `• ` list. */
	depth: 0 | 1 | 2;
	/** The line with its bullet and indent removed. */
	text: string;
	action: LogAction;
	/** Cards named by the `• ` lines that follow, when the log reveals them. */
	cards: string[];
};

export type SectionKind = 'setup' | 'turn' | 'checkup' | 'other';

export type LogSection = {
	kind: SectionKind;
	title: string;
	/** Whose turn it is, for `turn` sections. */
	player: string | null;
	/** 1-based, counting turn sections only; null for setup and checkups. */
	turnNumber: number | null;
	events: LogEvent[];
};

export type ParsedLog = {
	/** Both handles, in the order they first appear. */
	players: string[];
	sections: LogSection[];
	/** Flat view of every event, in order — what replay.ts folds over. */
	events: LogEvent[];
	firstPlayer: string | null;
	/** Null when the log stops before anyone wins (a copied-out-early paste). */
	winner: string | null;
	/** Lines the parser could not classify, for the import screen to show. */
	unrecognized: number;
};

const APOS = String.raw`['’]`;
const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "a" and "an" are 1 everywhere the log counts things. */
function count(value: string | undefined): number {
	if (!value) return 1;
	if (/^an?$/i.test(value.trim())) return 1;
	const number = Number.parseInt(value, 10);
	return Number.isFinite(number) ? number : 1;
}

const clean = (value: string) => value.trim().replace(/[.!]+$/, '').trim();

// -- players ----------------------------------------------------------------

/**
 * Reads the handles out of the log before parsing anything else.
 *
 * Turn headers are the reliable source ("Csicsi20's Turn"); the setup lines cover a log
 * that was pasted from partway through, and the closing "X wins." covers a concession on
 * the very first turn.
 */
export function findPlayers(lines: string[]): string[] {
	const seen: string[] = [];
	const add = (name: string | undefined) => {
		const trimmed = name?.trim();
		if (trimmed && !seen.includes(trimmed)) seen.push(trimmed);
	};

	const header = new RegExp(String.raw`^(.+?)${APOS}s Turn$`);
	const setup = new RegExp(
		String.raw`^(\S+) (?:chose (?:heads|tails)|won the coin toss|decided to go|drew \d+ cards for the opening hand)`
	);

	for (const raw of lines) {
		const line = raw.trim();
		add(header.exec(line)?.[1]);
		add(setup.exec(line)?.[1]);
		add(/^(\S+) wins\.$/.exec(line)?.[1]);
	}
	return seen;
}

/** Matches `<known player>'s ` at the start of a string, longest name first. */
function playerPrefix(players: string[]): RegExp | null {
	if (players.length === 0) return null;
	const names = [...players].sort((a, b) => b.length - a.length).map(escapeRe).join('|');
	return new RegExp(String.raw`^(${names})${APOS}s\s+`);
}

// -- one line ---------------------------------------------------------------

type Ctx = { players: string[]; prefix: RegExp | null };

/**
 * "Csicsi20's Marnie's Grimmsnarl ex" → the player and the Pokémon. Without a known
 * handle in front, the whole string is the name and the owner is unknown.
 */
function toRef(text: string, ctx: Ctx): Ref {
	const value = clean(text);
	const match = ctx.prefix?.exec(value);
	return match
		? { player: match[1], name: value.slice(match[0].length).trim() }
		: { player: null, name: value };
}

/** Lines whose subject is a Pokémon: "<Player>'s <Pokémon> <did something>". */
function pokemonSubject(player: string, rest: string, ctx: Ctx): LogAction | null {
	let match: RegExpExecArray | null;

	// "Alakazam used Powerful Hand." / "... on Csicsi20's Dunsparce for 180 damage."
	if ((match = /^(.+?) used (.+?) on (.+?) for (\d+) damage/.exec(rest))) {
		return {
			kind: 'use',
			player,
			source: { player, name: match[1] },
			move: clean(match[2]),
			target: toRef(match[3], ctx),
			damage: Number(match[4])
		};
	}
	if ((match = /^(.+?) used (.+?)\.?$/.exec(rest))) {
		// "used X for N damage" with no named target — an attack that hit nothing on board.
		const damage = /^(.+?) for (\d+) damage/.exec(match[2]);
		return {
			kind: 'use',
			player,
			source: { player, name: match[1] },
			move: clean(damage ? damage[1] : match[2]),
			target: null,
			damage: damage ? Number(damage[2]) : null
		};
	}
	if ((match = /^(.+?) is now in the Active Spot/.exec(rest))) {
		return { kind: 'promote', target: { player, name: clean(match[1]) } };
	}
	if ((match = /^(.+?) is (now|no longer) (Poisoned|Asleep|Paralyzed|Confused|Burned)/.exec(rest))) {
		return {
			kind: 'status',
			target: { player, name: clean(match[1]) },
			condition: match[3],
			on: match[2] === 'now'
		};
	}
	if ((match = /^(.+?) was Knocked Out/.exec(rest))) {
		return { kind: 'knockout', target: { player, name: clean(match[1]) } };
	}
	if ((match = /^(.+?) was switched with (.+?) to become the Active/.exec(rest))) {
		return {
			kind: 'switch',
			incoming: { player, name: clean(match[1]) },
			outgoing: toRef(match[2], ctx)
		};
	}
	// The weakness restatement ("took 20 more damage because of") repeats damage the
	// attack line already totalled, so it is a note rather than a second hit.
	if (/ took \d+ more damage because of /.test(rest)) return { kind: 'note' };
	if ((match = /^(.+?) took (\d+) damage/.exec(rest))) {
		return { kind: 'damage', target: { player, name: clean(match[1]) }, amount: Number(match[2]) };
	}
	if ((match = /^(.+?) was healed for (\d+) damage/.exec(rest))) {
		return { kind: 'heal', target: { player, name: clean(match[1]) }, amount: Number(match[2]) };
	}
	return null;
}

/** Lines whose subject is a player: "<Player> <did something>". */
function playerSubject(player: string, rest: string, ctx: Ctx): LogAction | null {
	let match: RegExpExecArray | null;

	if ((match = /^chose (heads|tails) for the opening coin flip/.exec(rest))) {
		return { kind: 'coin-flip', player, call: match[1] };
	}
	if (/^won the coin toss/.test(rest)) return { kind: 'coin-toss', player };
	if (/^decided to go first/.test(rest)) return { kind: 'go-first', player };
	if (/^wins\.?$/.test(rest)) return { kind: 'win', player };

	if ((match = /^drew (\d+) cards for the opening hand/.exec(rest))) {
		return { kind: 'draw', player, count: Number(match[1]), opening: true, toBench: false };
	}
	if ((match = /^drew (a|\d+) cards? and played them to the Bench/.exec(rest))) {
		return { kind: 'draw', player, count: count(match[1]), opening: false, toBench: true };
	}
	// The singular form names the card outright instead of listing it on a • line.
	if ((match = /^drew (.+?) and played (?:it|them) to the Bench/.exec(rest))) {
		return { kind: 'play', player, card: clean(match[1]), to: 'bench', from: 'deck' };
	}
	if ((match = /^drew (a|\d+) cards?\.?$/.exec(rest))) {
		return { kind: 'draw', player, count: count(match[1]), opening: false, toBench: false };
	}
	// "drew Sacred Ash." — a named draw is still one card, and the name is worth keeping.
	if ((match = /^drew (.+?)\.?$/.exec(rest))) {
		return { kind: 'to-hand', player, card: clean(match[1]), from: 'deck' };
	}

	if ((match = /^played (.+?) to the (Active Spot|Bench|Stadium spot)/.exec(rest))) {
		const to = match[2].startsWith('Active') ? 'active' : match[2] === 'Bench' ? 'bench' : 'stadium';
		return { kind: 'play', player, card: clean(match[1]), to, from: 'hand' };
	}
	if ((match = /^played (.+?)\.?$/.exec(rest))) {
		return { kind: 'play', player, card: clean(match[1]), to: null, from: 'hand' };
	}

	if ((match = /^evolved (.+?) to (.+?) (?:on the (Bench)|in the (Active) Spot)/.exec(rest))) {
		return {
			kind: 'evolve',
			player,
			from: clean(match[1]),
			to: clean(match[2]),
			spot: match[3] ? 'bench' : 'active'
		};
	}
	if ((match = /^attached (.+?) to (.+?)(?: (?:on the (Bench)|in the (Active) Spot))?\.?$/.exec(rest))) {
		return {
			kind: 'attach',
			player,
			card: clean(match[1]),
			target: toRef(match[2], ctx),
			spot: match[3] ? 'bench' : match[4] ? 'active' : null
		};
	}
	if ((match = /^retreated (.+?) to the Bench/.exec(rest))) {
		return { kind: 'retreat', player, pokemon: clean(match[1]) };
	}
	if ((match = /^took (a|\d+) Prize cards?/.exec(rest))) {
		return { kind: 'prizes', player, count: count(match[1]) };
	}
	if (/^took all of their Prize cards/.test(rest)) return { kind: 'note' };
	if (/^ended their turn/.test(rest)) return { kind: 'end-turn', player };

	if ((match = /^put (a|\d+) damage counters? on (.+?)\.?$/.exec(rest))) {
		return { kind: 'counters', target: toRef(match[2], ctx), amount: count(match[1]) * 10 };
	}
	if ((match = /^moved (a|\d+) damage counters? from (.+?) to (.+?)\.?$/.exec(rest))) {
		return {
			kind: 'move-counters',
			from: toRef(match[2], ctx),
			to: toRef(match[3], ctx),
			amount: count(match[1]) * 10
		};
	}
	if ((match = /^moved (.+?) to their hand\.?$/.exec(rest))) {
		return { kind: 'to-hand-from-play', player, target: toRef(match[1], ctx) };
	}

	if ((match = /^shuffled (a|\d+) cards? into their deck/.exec(rest))) {
		return { kind: 'shuffle-in', player, count: count(match[1]) };
	}
	if (/^shuffled their deck/.test(rest)) return { kind: 'shuffle', player };
	if ((match = /^discarded (a|\d+) cards?\.?$/.exec(rest))) {
		return { kind: 'discard', player, count: count(match[1]), card: null };
	}
	if ((match = /^discarded (.+?)\.?$/.exec(rest))) {
		return { kind: 'discard', player, count: 1, card: clean(match[1]) };
	}
	return null;
}

/** Lines with no player in front: card effects, hand additions, the result. */
function subjectless(line: string, ctx: Ctx): LogAction | null {
	let match: RegExpExecArray | null;

	if ((match = /^(\d+) drawn cards?\.?$/.exec(line))) {
		return { kind: 'revealed', count: Number(match[1]) };
	}
	if ((match = /^(.+?) was activated\.?$/.exec(line))) {
		return { kind: 'activated', card: clean(match[1]) };
	}
	if ((match = /^Damage to (.+?) was prevented\.?$/.exec(line))) {
		return { kind: 'prevent', target: toRef(match[1], ctx) };
	}
	if ((match = /^(\d+) cards were discarded from (.+?)\.?$/.exec(line))) {
		return { kind: 'discard-from', target: toRef(match[2], ctx), count: Number(match[1]), card: null };
	}
	if ((match = /^(.+?) (?:was|were) discarded from (.+?)\.?$/.exec(line))) {
		return { kind: 'discard-from', target: toRef(match[2], ctx), count: 1, card: clean(match[1]) };
	}
	if ((match = new RegExp(String.raw`^(.+?) was added to (.+?)${APOS}s hand\.?$`).exec(line))) {
		const card = clean(match[1]);
		return {
			kind: 'to-hand',
			player: match[2],
			card: /^A card$/i.test(card) ? null : card,
			from: 'other'
		};
	}
	// "Opponent took all of their Prize cards. Marcelolevi wins."
	if ((match = /(?:^|\s)(\S+) wins\.?$/.exec(line))) {
		const name = clean(match[1]);
		if (ctx.players.includes(name)) return { kind: 'win', player: name };
	}
	return null;
}

function parseAction(line: string, ctx: Ctx): LogAction {
	const possessive = ctx.prefix?.exec(line);
	if (possessive) {
		const action = pokemonSubject(possessive[1], line.slice(possessive[0].length), ctx);
		if (action) return action;
	}

	for (const player of ctx.players) {
		if (!line.startsWith(`${player} `)) continue;
		const action = playerSubject(player, line.slice(player.length + 1), ctx);
		if (action) return action;
	}

	return subjectless(line, ctx) ?? { kind: 'note' };
}

// -- the whole log ----------------------------------------------------------

const SECTION_HEADERS: { test: RegExp; kind: SectionKind }[] = [
	{ test: /^Setup$/i, kind: 'setup' },
	{ test: /^Pok[eé]mon Checkup$/i, kind: 'checkup' },
	{ test: new RegExp(String.raw`^(.+?)${APOS}s Turn$`), kind: 'turn' }
];

/** A header is a short line with no sentence punctuation, so events never look like one. */
function headerFor(line: string): { kind: SectionKind; player: string | null } | null {
	for (const { test, kind } of SECTION_HEADERS) {
		const match = test.exec(line);
		if (match) return { kind, player: kind === 'turn' ? match[1] : null };
	}
	return null;
}

export function parseBattleLog(text: string): ParsedLog {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const players = findPlayers(lines);
	const ctx: Ctx = { players, prefix: playerPrefix(players) };

	const sections: LogSection[] = [];
	const events: LogEvent[] = [];
	let current: LogSection = {
		kind: 'other',
		title: 'Log',
		player: null,
		turnNumber: null,
		events: []
	};
	let turns = 0;
	let unrecognized = 0;
	/** The event a `• ` card list belongs to — the last one at depth 0 or 1. */
	let lastEvent: LogEvent | null = null;

	for (const [index, raw] of lines.entries()) {
		const line = raw.trim();
		if (!line) continue;

		if (line.startsWith('•')) {
			const cards = line
				.replace(/^•\s*/, '')
				.split(',')
				.map((card) => card.trim())
				.filter(Boolean);
			if (lastEvent) lastEvent.cards.push(...cards);
			continue;
		}

		const header = headerFor(line);
		if (header) {
			if (current.events.length > 0) sections.push(current);
			if (header.kind === 'turn') turns += 1;
			current = {
				kind: header.kind,
				title: line,
				player: header.player,
				turnNumber: header.kind === 'turn' ? turns : null,
				events: []
			};
			lastEvent = null;
			continue;
		}

		const detail = line.startsWith('- ');
		const body = detail ? line.slice(2).trim() : line;
		// "Damage breakdown:" only introduces the • lines restating an attack's total.
		if (/^Damage breakdown:$/i.test(body)) {
			lastEvent = null;
			continue;
		}

		const action = parseAction(body, ctx);
		if (action.kind === 'note') unrecognized += 1;

		const event: LogEvent = {
			line: index,
			depth: detail ? 1 : 0,
			text: body,
			action,
			cards: []
		};
		current.events.push(event);
		events.push(event);
		lastEvent = event;
	}
	if (current.events.length > 0) sections.push(current);

	// Whoever the coin toss sent first, or failing that whoever the first turn belongs to.
	const chose = events.find((event) => event.action.kind === 'go-first')?.action;
	const firstPlayer =
		chose?.kind === 'go-first'
			? chose.player
			: (sections.find((section) => section.kind === 'turn')?.player ?? null);

	const win = [...events].reverse().find((event) => event.action.kind === 'win')?.action;

	return {
		players,
		sections,
		events,
		firstPlayer,
		winner: win?.kind === 'win' ? win.player : null,
		unrecognized
	};
}
