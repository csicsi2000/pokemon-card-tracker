import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
	canCompressLogs,
	LogDecodeError,
	MAX_BATTLE_LOG_CHARS,
	packLogText,
	unpackLogText
} from '../src/lib/tcg/battle-log/storage';
import { parseBattleLog } from '../src/lib/tcg/battle-log/parse';
import * as battles from '../src/lib/agent/battles';
import { fixedClock, makeDeck, makeUserData } from './data-helpers';
import { makeCard, makeCatalogue } from './helpers';

const SAMPLE = readFileSync(new URL('./fixtures/battle-log-sample.txt', import.meta.url), 'utf8');

describe('packLogText', () => {
	it('is available in this runtime', () => {
		// Node 18+ and every browser since 2023. If this fails, everything below falls back
		// to plain text, which still works — it just costs eight times the storage.
		expect(canCompressLogs()).toBe(true);
	});

	it('round-trips a real game exactly', async () => {
		const packed = await packLogText(SAMPLE);
		expect(packed.encoding).toBe('gzip');
		expect(await unpackLogText(packed)).toBe(SAMPLE.trim());
	});

	it('replays identically after a round trip', async () => {
		const packed = await packLogText(SAMPLE);
		const back = await unpackLogText(packed);
		expect(parseBattleLog(back).events).toEqual(parseBattleLog(SAMPLE.trim()).events);
	});

	it('saves most of the space a log would cost', async () => {
		const packed = await packLogText(SAMPLE);
		// Measured at ~87% on this game; assert the win is real without pinning the exact
		// output of a compressor we do not control.
		expect(packed.text.length).toBeLessThan(SAMPLE.length * 0.25);
	});

	it('leaves a short log alone rather than making it bigger', async () => {
		const short = 'Setup\nAlice won the coin toss.';
		expect(await packLogText(short)).toEqual({ text: short, encoding: 'plain' });
	});

	it('trims and caps the text on the way in, where it is still text', async () => {
		const huge = 'Setup\n' + 'Alice drew a card.\n'.repeat(20_000);
		expect(huge.length).toBeGreaterThan(MAX_BATTLE_LOG_CHARS);

		const packed = await packLogText(huge);
		const back = await unpackLogText(packed);
		expect(back).toHaveLength(MAX_BATTLE_LOG_CHARS);
		expect(back).toBe(huge.trim().slice(0, MAX_BATTLE_LOG_CHARS));
	});

	it('keeps whitespace inside the log while trimming the ends', async () => {
		const packed = await packLogText(`\n\n${SAMPLE}\n\n`);
		expect(await unpackLogText(packed)).toBe(SAMPLE.trim());
	});

	it('survives a log full of the accents and apostrophes TCG Live uses', async () => {
		const text = ['Pokémon Checkup', "Marcelolevi's Marnie's Grimmsnarl ex used Punk Up.", '   • Poké Pad, Dudunsparce'].join('\n').repeat(30);
		const packed = await packLogText(text);
		expect(packed.encoding).toBe('gzip');
		expect(await unpackLogText(packed)).toBe(text.trim());
	});
});

describe('unpackLogText', () => {
	it('passes a plain log straight through', async () => {
		expect(await unpackLogText({ text: 'Setup', encoding: 'plain' })).toBe('Setup');
	});

	it('reports a corrupted log instead of throwing something unreadable', async () => {
		await expect(unpackLogText({ text: 'not base64 gzip', encoding: 'gzip' })).rejects.toBeInstanceOf(
			LogDecodeError
		);
	});
});

describe('the agent write path', () => {
	const abra = makeCard({ name: 'Abra' });
	const kadabra = makeCard({ name: 'Kadabra' });
	const catalogue = makeCatalogue([abra, kadabra]);
	const deck = makeDeck({
		id: 'deck-1',
		name: 'Alakazam',
		cards: [
			{ cardId: abra.id, quantity: 4 },
			{ cardId: kadabra.id, quantity: 4 }
		]
	});
	const ctx = () => ({ data: makeUserData({ decks: [deck] }), clock: fixedClock(), catalogue });

	it('compresses a log saved through the CLI or MCP', async () => {
		const { data, log } = await battles.saveBattleLog(ctx(), 'Alakazam', { text: SAMPLE });

		expect(log.encoding).toBe('gzip');
		expect(log.text.length).toBeLessThan(SAMPLE.length * 0.25);
		expect(data.battleLogs).toHaveLength(1);
	});

	it('reads the same game back out of the compressed form', async () => {
		const saved = await battles.saveBattleLog(ctx(), 'Alakazam', {
			text: SAMPLE,
			opponentDeck: 'Grimmsnarl ex'
		});

		const view = await battles.battlesView(saved.data, 'Alakazam');
		expect(view.games).toHaveLength(1);
		expect(view.games[0].text).toBe(SAMPLE.trim());
		expect(view.games[0].summary).toMatchObject({ turns: 15, outcome: 'loss' });
		expect(view.label).toBe('0–1');

		const one = await battles.findBattleLog(saved.data, saved.log.id);
		expect(battles.battleTranscript(one).join(' ')).toContain('Shadow Bullet');
	});
});
