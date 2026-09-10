import { describe, expect, it } from 'vitest';
import { merge } from '../src/lib/data/merge';
import { migrate } from '../src/lib/data/migrate';
import { battleLogsFor } from '../src/lib/data/model';
import * as mutate from '../src/lib/data/mutations';
import { repair } from '../src/lib/data/repair';
import { fixedClock, makeBattleLog, makeDeck, makeUserData } from './data-helpers';

const NOW = '2026-09-10T00:00:00.000Z';
const deck = makeDeck({ id: 'deck-1', name: 'Alakazam' });

const tombstone = (data: { tombstones: { kind: string; key: string }[] }, key: string) =>
	data.tombstones.find((item) => item.kind === 'battleLog' && item.key === key);

describe('battle log mutations', () => {
	it('saves a log against a deck, defaulting the date to today', () => {
		const clock = fixedClock('2026-09-10T12:00:00.000Z');

		const { data, log } = mutate.createBattleLog(makeUserData({ decks: [deck] }), clock, {
			deckId: 'deck-1',
			text: 'Setup\nAlice won the coin toss.',
			encoding: 'plain',
			player: 'Alice',
			opponent: 'Bob'
		});

		expect(log).toMatchObject({ deckId: 'deck-1', result: 'unknown', playedOn: '2026-09-10' });
		// Stored exactly as handed over: the text is already packed by the caller, and
		// trimming or slicing base64 here would destroy a log rather than tidy it.
		expect(log!.text).toBe('Setup\nAlice won the coin toss.');
		expect(log!.encoding).toBe('plain');
		expect(log!.createdAt).toBe(log!.updatedAt);
		expect(data.battleLogs).toHaveLength(1);
	});

	it('refuses to save a log for a deck that does not exist', () => {
		const start = makeUserData();
		const { data, log } = mutate.createBattleLog(start, fixedClock(), {
			deckId: 'nope',
			text: 'Setup',
			encoding: 'plain',
			player: 'Alice',
			opponent: 'Bob'
		});

		expect(log).toBeNull();
		expect(data).toBe(start);
	});

	it('stamps an edit and keeps createdAt', () => {
		const clock = fixedClock();
		const start = makeUserData({ decks: [deck], battleLogs: [makeBattleLog({ id: 'log-1' })] });

		const result = mutate.updateBattleLog(start, clock, 'log-1', {
			result: 'win',
			opponentDeck: 'Grimmsnarl ex'
		});

		expect(result.battleLogs[0]).toMatchObject({ result: 'win', opponentDeck: 'Grimmsnarl ex' });
		expect(result.battleLogs[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
		expect(result.battleLogs[0].updatedAt > '2026-01-01T00:00:00.000Z').toBe(true);
	});

	it('leaves an unknown id alone', () => {
		const start = makeUserData({ decks: [deck] });
		expect(mutate.updateBattleLog(start, fixedClock(), 'nope', { result: 'win' })).toBe(start);
		expect(mutate.deleteBattleLog(start, fixedClock(), 'nope')).toBe(start);
	});

	it('buries a deleted log so the deletion syncs', () => {
		const start = makeUserData({ decks: [deck], battleLogs: [makeBattleLog({ id: 'log-1' })] });

		const result = mutate.deleteBattleLog(start, fixedClock(), 'log-1');

		expect(result.battleLogs).toEqual([]);
		expect(tombstone(result, 'log-1')).toBeDefined();
	});

	it('takes a deck’s logs with it, tombstones and all', () => {
		const start = makeUserData({
			decks: [deck, makeDeck({ id: 'deck-2' })],
			battleLogs: [
				makeBattleLog({ id: 'log-1', deckId: 'deck-1' }),
				makeBattleLog({ id: 'log-2', deckId: 'deck-1' }),
				makeBattleLog({ id: 'log-3', deckId: 'deck-2' })
			]
		});

		const result = mutate.deleteDeck(start, fixedClock(), 'deck-1');

		expect(result.battleLogs.map((log) => log.id)).toEqual(['log-3']);
		expect(tombstone(result, 'log-1')).toBeDefined();
		expect(tombstone(result, 'log-2')).toBeDefined();
		expect(tombstone(result, 'log-3')).toBeUndefined();
	});

	it('does not copy a deck’s games onto its duplicate', () => {
		const start = makeUserData({ decks: [deck], battleLogs: [makeBattleLog({ id: 'log-1' })] });

		const { data, deck: copy } = mutate.duplicateDeck(start, fixedClock(), 'deck-1');

		expect(battleLogsFor(data, copy!.id)).toEqual([]);
		expect(battleLogsFor(data, 'deck-1')).toHaveLength(1);
	});

	it('orders a deck’s logs newest game first', () => {
		const data = makeUserData({
			decks: [deck],
			battleLogs: [
				makeBattleLog({ id: 'old', playedOn: '2026-08-01' }),
				makeBattleLog({ id: 'new', playedOn: '2026-09-09' }),
				makeBattleLog({ id: 'middle', playedOn: '2026-09-01' })
			]
		});

		expect(battleLogsFor(data, 'deck-1').map((log) => log.id)).toEqual(['new', 'middle', 'old']);
	});
});

describe('battle logs through migrate, merge and repair', () => {
	it('defaults the list for a file written before replays existed', () => {
		expect(migrate({ version: 2, decks: [] }).battleLogs).toEqual([]);
	});

	it('drops a log with no text or no deck, and repairs a bad result', () => {
		const migrated = migrate({
			version: 2,
			decks: [deck],
			battleLogs: [
				{ id: 'good', deckId: 'deck-1', text: 'Setup', result: 'nonsense' },
				{ id: 'no-text', deckId: 'deck-1', text: '   ' },
				{ id: 'no-deck', text: 'Setup' }
			]
		});

		expect(migrated.battleLogs.map((log) => log.id)).toEqual(['good']);
		expect(migrated.battleLogs[0]).toMatchObject({ result: 'unknown', player: '', note: null });
	});

	it('merges two devices’ logs and honours a deletion', () => {
		const left = makeUserData({
			decks: [deck],
			battleLogs: [
				makeBattleLog({ id: 'log-1', note: 'from the phone', updatedAt: '2026-09-02T00:00:00.000Z' }),
				makeBattleLog({ id: 'log-2' })
			]
		});
		const right = makeUserData({
			decks: [deck],
			battleLogs: [makeBattleLog({ id: 'log-1', note: 'from the laptop', updatedAt: '2026-09-03T00:00:00.000Z' })],
			tombstones: [{ kind: 'battleLog', key: 'log-2', deletedAt: '2026-09-04T00:00:00.000Z' }]
		});

		const merged = merge(left, right);

		expect(merged.battleLogs.map((log) => log.id)).toEqual(['log-1']);
		expect(merged.battleLogs[0].note).toBe('from the laptop');
		// Order must not matter, or two devices would disagree.
		expect(merge(right, left).battleLogs).toEqual(merged.battleLogs);
	});

	it('repairs away a log whose deck the other device deleted', () => {
		const data = makeUserData({
			decks: [],
			battleLogs: [makeBattleLog({ id: 'orphan', deckId: 'deck-1' })]
		});

		expect(repair(data, { now: NOW }).battleLogs).toEqual([]);
		// Repair is a projection, so running it twice is the same as running it once.
		expect(repair(repair(data, { now: NOW }), { now: NOW })).toEqual(repair(data, { now: NOW }));
	});

	it('keeps a log whose deck is still there', () => {
		const data = makeUserData({ decks: [deck], battleLogs: [makeBattleLog({ id: 'log-1' })] });
		expect(repair(data, { now: NOW }).battleLogs).toHaveLength(1);
	});

	it('restores a backup’s logs and buries the ones it does not have', () => {
		const current = makeUserData({
			decks: [deck],
			battleLogs: [makeBattleLog({ id: 'here' }), makeBattleLog({ id: 'gone' })]
		});
		const backup = makeUserData({ decks: [deck], battleLogs: [makeBattleLog({ id: 'here' })] });

		const result = mutate.restore(current, fixedClock(), backup);

		expect(result.battleLogs.map((log) => log.id)).toEqual(['here']);
		expect(tombstone(result, 'gone')).toBeDefined();
	});
});
