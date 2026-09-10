import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildLogCardIndex } from '../src/lib/tcg/battle-log/artwork';
import { parseBattleLog, type LogAction } from '../src/lib/tcg/battle-log/parse';
import { battleRecord, matchups, recordLabel } from '../src/lib/tcg/battle-log/record';
import { buildReplay, finalState, isBookkeeping } from '../src/lib/tcg/battle-log/replay';
import { detectPlayer, summarize } from '../src/lib/tcg/battle-log/summary';
import type { BattleLog } from '../src/lib/data/model';
import { makeCard, makeCatalogue, makeSet } from './helpers';

const SAMPLE = readFileSync(new URL('./fixtures/battle-log-sample.txt', import.meta.url), 'utf8');

const parsed = parseBattleLog(SAMPLE);
const replay = buildReplay(parsed);

/** The first action of a given kind, for asserting on one sentence at a time. */
const first = <K extends LogAction['kind']>(kind: K) =>
	parsed.events.map((event) => event.action).find((action) => action.kind === kind) as Extract<
		LogAction,
		{ kind: K }
	>;

describe('parseBattleLog', () => {
	it('reads both handles, who went first and who won', () => {
		expect(parsed.players).toEqual(['Csicsi20', 'Marcelolevi']);
		expect(parsed.firstPlayer).toBe('Marcelolevi');
		expect(parsed.winner).toBe('Marcelolevi');
	});

	it('understands every line of a real game', () => {
		expect(parsed.unrecognized).toBe(0);
		expect(parsed.events.length).toBeGreaterThan(400);
	});

	it('splits the log into setup, turns and checkups', () => {
		const kinds = parsed.sections.map((section) => section.kind);
		expect(kinds[0]).toBe('setup');
		expect(kinds).toContain('checkup');
		expect(parsed.sections.filter((section) => section.kind === 'turn')).toHaveLength(15);
		expect(parsed.sections[1]).toMatchObject({ player: 'Marcelolevi', turnNumber: 1 });
	});

	it('keeps apostrophes inside card names out of the player prefix', () => {
		// "Marcelolevi's Marnie's Grimmsnarl ex used Shadow Bullet on Csicsi20's Alakazam"
		const shadow = parsed.events
			.map((event) => event.action)
			.find((action) => action.kind === 'use' && action.move === 'Shadow Bullet');
		expect(shadow).toMatchObject({
			source: { player: 'Marcelolevi', name: "Marnie's Grimmsnarl ex" },
			target: { player: 'Csicsi20', name: 'Dunsparce' },
			damage: 180
		});
	});

	it('takes the attack line total and ignores the weakness restatement', () => {
		const clutch = parsed.events
			.map((event) => event.action)
			.filter((action) => action.kind === 'use' && action.move === 'Clutch');
		// "for 40 damage. ... took 20 more damage because of Darkness Weakness" is 40 in all.
		expect(clutch[0]).toMatchObject({ damage: 40 });
		expect(
			parsed.events.some(
				(event) => event.action.kind === 'note' && / more damage because of /.test(event.text)
			)
		).toBe(false);
	});

	it('reads the cards a • line reveals onto the event above it', () => {
		const opening = parsed.events.find((event) => event.action.kind === 'revealed');
		expect(opening?.cards).toEqual([
			'Poké Pad',
			'Dudunsparce',
			'Eri',
			'Abra',
			'Hilda',
			'Enhanced Hammer',
			'Hilda'
		]);
	});

	it('parses the shapes a turn is made of', () => {
		expect(first('coin-flip')).toMatchObject({ player: 'Csicsi20', call: 'tails' });
		expect(first('play')).toMatchObject({ card: 'Abra', to: 'active' });
		expect(first('evolve')).toMatchObject({
			from: "Marnie's Impidimp",
			to: "Marnie's Morgrem",
			spot: 'bench'
		});
		expect(first('attach')).toMatchObject({
			card: 'Telepathic Psychic Energy',
			target: { name: 'Abra' },
			spot: 'active'
		});
		expect(first('switch')).toMatchObject({
			incoming: { name: 'Dunsparce' },
			outgoing: { name: 'Abra' }
		});
		expect(first('retreat')).toMatchObject({ pokemon: 'Yveltal' });
		expect(first('counters')).toMatchObject({ amount: 10 });
		expect(first('move-counters')).toMatchObject({ amount: 10 });
		expect(first('heal')).toMatchObject({ amount: 20 });
		expect(first('shuffle-in')).toMatchObject({ count: 5 });
	});

	it('counts a multi-prize knockout as taking two', () => {
		const prizes = parsed.events
			.map((event) => event.action)
			.filter((action): action is Extract<LogAction, { kind: 'prizes' }> => action.kind === 'prizes');
		expect(prizes.map((action) => action.count)).toContain(2);
		expect(prizes.every((action) => action.count >= 1)).toBe(true);
	});

	it('reads a singular bench draw, which names the card inline', () => {
		// "- Csicsi20 drew Lillie's Clefairy ex and played it to the Bench."
		const clefairy = parsed.events
			.map((event) => event.action)
			.find((action) => action.kind === 'play' && action.card === "Lillie's Clefairy ex");
		expect(clefairy).toMatchObject({ to: 'bench', player: 'Csicsi20' });
	});

	it('survives text that is not a battle log', () => {
		const nonsense = parseBattleLog('4 Charizard ex OBF 125\n2 Rare Candy PAF 89');
		expect(nonsense.players).toEqual([]);
		expect(nonsense.winner).toBeNull();
		expect(nonsense.events).toHaveLength(2);
	});

	it('handles an empty paste', () => {
		const empty = parseBattleLog('');
		expect(empty.events).toEqual([]);
		expect(empty.sections).toEqual([]);
		expect(empty.firstPlayer).toBeNull();
	});
});

describe('buildReplay', () => {
	const final = finalState(replay);
	const you = final.sides.Csicsi20;
	const them = final.sides.Marcelolevi;

	it('produces one board position per line', () => {
		expect(replay.steps).toHaveLength(parsed.events.length);
		expect(replay.initial.sides.Csicsi20.active).toBeNull();
	});

	it('tracks prizes to the end of the game', () => {
		expect(them.prizesTaken).toBe(6);
		expect(them.prizesLeft).toBe(0);
		expect(you.prizesTaken).toBe(5);
	});

	it('keeps the evolution line in the stack', () => {
		const alakazam = you.bench.find((mon) => mon.name === 'Alakazam');
		expect(alakazam?.stack).toEqual(['Abra', 'Kadabra', 'Alakazam']);
	});

	it('holds on to what is attached, and drops it on a knockout', () => {
		const genesect = you.bench.find((mon) => mon.name === 'Genesect');
		expect(genesect?.attached).toEqual(['Air Balloon']);
		// Fezandipiti ex was knocked out with two energy on it and is gone, energy and all.
		expect(you.knockedOut).toContain('Fezandipiti ex');
		expect([you.active, ...you.bench].some((mon) => mon?.name === 'Fezandipiti ex')).toBe(false);
	});

	it('follows the stadium, including the one that replaced it', () => {
		expect(final.stadium).toEqual({ card: 'Battle Cage', player: 'Csicsi20' });
	});

	it("puts damage on the real owner's board, not the one the log names", () => {
		// The log says "Csicsi20 put 32 damage counters on Csicsi20's Marnie's Grimmsnarl ex"
		// about the *opponent's* Pokémon — TCG Live stamps the acting player on every target.
		const step = replay.steps.find(
			(item) => item.event.action.kind === 'counters' && item.event.action.amount === 320
		);
		expect(step).toBeDefined();
		const grimmsnarl = step!.state.sides.Marcelolevi;
		expect(grimmsnarl.active?.name).toBe("Marnie's Grimmsnarl ex");
		// 320 from Powerful Hand on top of the counter Freezing Shroud left on it.
		expect(grimmsnarl.active?.damage).toBe(330);
		expect(step!.state.sides.Csicsi20.active?.damage).toBe(0);
	});

	it('heals and moves counters without going below zero', () => {
		for (const step of replay.steps) {
			for (const side of Object.values(step.state.sides)) {
				for (const mon of [side.active, ...side.bench]) {
					expect(mon?.damage ?? 0).toBeGreaterThanOrEqual(0);
				}
			}
		}
	});

	it('never has the same Pokémon active and benched at once', () => {
		for (const step of replay.steps) {
			for (const side of Object.values(step.state.sides)) {
				const uids = [side.active, ...side.bench].flatMap((mon) => (mon ? [mon.uid] : []));
				expect(new Set(uids).size).toBe(uids.length);
			}
		}
	});

	it('is deterministic — the same text gives the same uids', () => {
		const again = finalState(buildReplay(parseBattleLog(SAMPLE)));
		expect(again.sides.Csicsi20.bench.map((mon) => mon.uid)).toEqual(
			you.bench.map((mon) => mon.uid)
		);
	});

	it('marks the log lines that are pure bookkeeping', () => {
		const noise = replay.steps.filter((step) => isBookkeeping(step.event));
		expect(noise.length).toBeGreaterThan(100);
		expect(noise.length).toBeLessThan(replay.steps.length / 2);
		// Nothing that changes the board is hidden.
		expect(
			noise.every((step) =>
				['activated', 'prevent', 'shuffle'].includes(step.event.action.kind)
			)
		).toBe(true);
	});
});

describe('summarize', () => {
	it('reads the match from the point of view of one side', () => {
		const mine = summarize(replay, 'Csicsi20');
		expect(mine).toMatchObject({ outcome: 'loss', turns: 15, wentFirst: 'Marcelolevi' });
		expect(mine.you?.player).toBe('Csicsi20');
		expect(mine.them?.player).toBe('Marcelolevi');

		const theirs = summarize(replay, 'Marcelolevi');
		expect(theirs.outcome).toBe('win');
	});

	it('lists what the opponent showed, most-played first', () => {
		const summary = summarize(replay, 'Csicsi20');
		const names = summary.them!.pokemon.map((entry) => entry.name);
		expect(names).toContain("Marnie's Grimmsnarl ex");
		expect(names).toContain('Munkidori');
		// Pokémon only — the trainers they played are in `cards`, not here.
		expect(names).not.toContain('Buddy-Buddy Poffin');
		expect(summary.them!.cards.map((entry) => entry.name)).toContain('Buddy-Buddy Poffin');
	});

	it('marks the knockouts and prize swings for the scrub bar', () => {
		const summary = summarize(replay, 'Csicsi20');
		expect(summary.highlights.length).toBeGreaterThan(10);
		expect(summary.highlights.every((mark) => mark.step >= 0 && mark.step < replay.steps.length)).toBe(
			true
		);
	});

	it('leaves the outcome unknown when nobody is named as yours', () => {
		expect(summarize(replay, null).outcome).toBe('unknown');
	});
});

describe('detectPlayer', () => {
	it('picks the side whose cards are in the deck', () => {
		const guess = detectPlayer(parsed, ['Alakazam', 'Kadabra', 'Abra', 'Dudunsparce', 'Hilda']);
		expect(guess).toMatchObject({ player: 'Csicsi20', opponent: 'Marcelolevi', confident: true });
	});

	it('picks the other side for the opponent’s list', () => {
		const guess = detectPlayer(parsed, ["Marnie's Grimmsnarl ex", 'Munkidori', 'Froslass']);
		expect(guess.player).toBe('Marcelolevi');
	});

	it('admits it cannot tell from a deck that shares nothing', () => {
		const guess = detectPlayer(parsed, ['Pikachu', 'Snorlax']);
		expect(guess).toMatchObject({ player: null, confident: false });
	});

	it('admits it cannot tell from an empty deck', () => {
		expect(detectPlayer(parsed, []).confident).toBe(false);
	});
});

describe('buildLogCardIndex', () => {
	const psychic = makeSet({ id: 'sv01', ptcglCode: 'SVI', releaseDate: '2023-03-31' });
	const newer = makeSet({ id: 'sv08', ptcglCode: 'SSP', releaseDate: '2024-11-08' });
	const oldAlakazam = makeCard({ name: 'Alakazam', set: psychic, localId: '1', hp: 150 });
	const newAlakazam = makeCard({ name: 'Alakazam', set: newer, localId: '2', hp: 160 });
	const energy = makeCard({ name: 'Darkness Energy', set: newer, localId: '3', supertype: 'Energy' });
	const catalogue = makeCatalogue([newAlakazam, oldAlakazam, energy]);

	it('prefers the printing the deck holds', () => {
		const index = buildLogCardIndex(catalogue, [oldAlakazam.id]);
		expect(index.find('Alakazam')?.id).toBe(oldAlakazam.id);
	});

	it('falls back to the newest printing of the name', () => {
		expect(buildLogCardIndex(catalogue).find('Alakazam')?.id).toBe(newAlakazam.id);
	});

	it('maps the log’s basic energy names onto the catalogue’s', () => {
		expect(buildLogCardIndex(catalogue).find('Basic Darkness Energy')?.id).toBe(energy.id);
	});

	it('returns null rather than a wrong card for an unknown name', () => {
		expect(buildLogCardIndex(catalogue).find('Not A Card')).toBeNull();
	});
});

describe('battleRecord', () => {
	const log = (result: BattleLog['result'], opponentDeck: string | null = null): BattleLog => ({
		id: `log-${result}-${opponentDeck ?? ''}-${Math.random()}`,
		deckId: 'deck-1',
		text: 'Setup',
		player: 'me',
		opponent: 'them',
		result,
		playedOn: '2026-09-01',
		opponentDeck,
		note: null,
		createdAt: '2026-09-01T00:00:00.000Z',
		updatedAt: '2026-09-01T00:00:00.000Z'
	});

	it('counts wins and losses and rates only decided games', () => {
		const record = battleRecord([log('win'), log('win'), log('loss'), log('unknown')]);
		expect(record).toMatchObject({ wins: 2, losses: 1, ties: 0, unknown: 1, played: 4 });
		expect(record.winRate).toBeCloseTo(2 / 3);
		expect(recordLabel(record)).toBe('2–1');
	});

	it('shows ties in the label only when there are some', () => {
		expect(recordLabel(battleRecord([log('win'), log('tie')]))).toBe('1–0–1');
	});

	it('has no win rate before a decided game', () => {
		expect(battleRecord([log('unknown')]).winRate).toBeNull();
		expect(battleRecord([]).winRate).toBeNull();
	});

	it('groups matchups worst first, ignoring case and unnamed decks', () => {
		const table = matchups([
			log('loss', 'Grimmsnarl ex'),
			log('loss', 'grimmsnarl ex'),
			log('win', 'Gardevoir ex'),
			log('win', null)
		]);
		expect(table.map((row) => row.label)).toEqual(['Grimmsnarl ex', 'Gardevoir ex']);
		expect(table[0].record).toMatchObject({ losses: 2, played: 2 });
	});
});
