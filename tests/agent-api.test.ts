import { describe, expect, it } from 'vitest';
import * as api from '../src/lib/agent/api';
import { toReadableJson, toReadableMarkdown } from '../src/lib/agent/readable';
import { parseDecklist } from '../src/lib/tcg/parser';
import { fixedClock, makeUserData } from './data-helpers';
import { makeCard, makeCatalogue, makeSet } from './helpers';

const meg = makeSet({ id: 'me01', name: 'Mega Evolution', ptcglCode: 'MEG', releaseDate: '2025-09-26' });
const obf = makeSet({ id: 'sv03', name: 'Obsidian Flames', ptcglCode: 'OBF', releaseDate: '2023-08-11' });
const sve = makeSet({ id: 'sve', name: 'SV Energies', ptcglCode: 'SVE', releaseDate: '2023-03-31' });

const catalogue = makeCatalogue([
	makeCard({ name: 'Numel', localId: '021', set: meg }),
	makeCard({ name: 'Mega Venusaur ex', localId: '003', set: meg, variants: ['holo'] }),
	makeCard({ name: 'Oddish', localId: '001', set: obf, variants: ['normal', 'reverse'] }),
	makeCard({ name: 'Charizard ex', localId: '125', set: obf }),
	makeCard({ name: 'Fire Energy', localId: '002', set: sve, supertype: 'Energy' })
]);

// Like the CLI and the app, a fresh clock first observes the data it is about to edit, so a
// later edit always gets a later timestamp even when the wall clock is frozen.
const ctx = (data = makeUserData()): api.AgentContext => {
	const clock = fixedClock();
	clock.observe(data);
	return { data, catalogue, clock };
};

describe('resolveCardSpec', () => {
	it('understands codes, ids and names', () => {
		expect(api.resolveCardSpec(catalogue, 'meg 21')).toMatchObject({ how: 'code', card: { name: 'Numel' } });
		expect(api.resolveCardSpec(catalogue, 'sv03-125')).toMatchObject({ how: 'id', card: { name: 'Charizard ex' } });
		expect(api.resolveCardSpec(catalogue, 'charizard EX')).toMatchObject({ how: 'name', card: { name: 'Charizard ex' } });
		expect(api.resolveCardSpec(catalogue, 'MEG 999')).toMatchObject({ how: 'none', card: null });
		expect(api.resolveCardSpec(catalogue, 'Mewtwo')).toMatchObject({ how: 'none' });
	});
});

describe('quickAdd', () => {
	it('adds into a lot it creates on demand and reports failures', () => {
		const result = api.quickAdd(ctx(), '3 MEG 21 rh\nOBF 1 rh\nZZZ 9', { lot: 'july.2 lot', createLot: true });

		expect(result.data.lots.map((lot) => lot.name)).toEqual(['july.2 lot']);
		const lotId = result.data.lots[0].id;
		expect(result.added.map((a) => `${a.card.name}:${a.finish}:${a.quantity}`)).toEqual([
			'Numel:normal:3', // Numel has no reverse printing, so the marker falls back
			'Oddish:reverse:1'
		]);
		expect(result.failed).toEqual([{ line: 'ZZZ 9', note: 'Unknown set code ZZZ' }]);
		expect(result.data.collection.every((row) => row.lotId === lotId)).toBe(true);
	});

	it('refuses an unknown lot unless asked to create it', () => {
		expect(() => api.quickAdd(ctx(), 'MEG 21', { lot: 'nope' })).toThrow(/No lot matches/);
	});
});

describe('decks', () => {
	const LIST = `Pokémon: 3
2 Numel MEG 21
1 Oddish OBF 1

Trainer: 2
2 MEG 3

Energy: 4
4 Basic {R} Energy SVE 2`;

	it('creates a deck from a decklist inside a folder path, creating folders', () => {
		const { data, deck, list } = api.createDeck(ctx(), { name: 'Test', list: LIST, folder: 'Standard/2026' });

		expect(list?.unresolved).toEqual([]);
		expect(deck.cards.reduce((sum, card) => sum + card.quantity, 0)).toBe(9);
		expect(data.folders.map((f) => f.name)).toEqual(['Standard', '2026']);
		expect(data.folders[1].parentId).toBe(data.folders[0].id);
		expect(deck.folderId).toBe(data.folders[1].id);
	});

	it('reuses existing folders and finds decks by name, case-insensitively', () => {
		const first = api.createDeck(ctx(), { name: 'Alpha', folder: 'Standard' });
		const second = api.createDeck(ctx(first.data), { name: 'Beta', folder: 'standard' });
		expect(second.data.folders).toHaveLength(1);
		expect(api.findDeck(second.data, 'beta').id).toBe(second.deck.id);
		expect(() => api.findDeck(second.data, 'gamma')).toThrow(/No deck matches/);
	});

	it('setDeckCard, deckView and buylist agree on owned counts by name', () => {
		const owned = api.quickAdd(ctx(), '1 OBF 1').data; // one Oddish, any printing counts
		const created = api.createDeck(ctx(owned), { name: 'D', list: '2 Oddish OBF 1\n1 Numel MEG 21' });
		const set = api.setDeckCard(ctx(created.data), 'D', 'MEG 21', 3);

		const view = api.deckView(set.data, catalogue, 'D');
		expect(view.total).toBe(5);
		expect(view.entries.map((e) => `${e.card.name}:${e.quantity}:${e.owned}`)).toEqual(['Numel:3:0', 'Oddish:2:1']);
		expect(view.buylist.totalMissing).toBe(4);

		const removed = api.setDeckCard(ctx(set.data), 'D', 'Numel', 0);
		expect(api.deckView(removed.data, catalogue, 'D').total).toBe(2);
	});

	it('replaceDeckList and deleteDeck leave sync-safe traces', () => {
		const created = api.createDeck(ctx(), { name: 'D', list: '1 Numel MEG 21' });
		const replaced = api.replaceDeckList(ctx(created.data), 'D', '4 Oddish OBF 1');
		expect(replaced.data.decks[0].cards).toEqual([{ cardId: 'sv03-001', quantity: 4 }]);
		expect(replaced.data.decks[0].updatedAt > created.deck.updatedAt).toBe(true);

		const deleted = api.deleteDeck(ctx(replaced.data), 'D');
		expect(deleted.data.decks).toEqual([]);
		expect(deleted.data.tombstones).toEqual([expect.objectContaining({ kind: 'deck', key: created.deck.id })]);
	});

	it('the resolver still handles name-less lines through resolveList', () => {
		const list = api.resolveList(catalogue, '2 MEG 3\n1 Nonsense XYZ 1');
		expect(list.cards).toEqual([{ cardId: 'me01-003', quantity: 2 }]);
		expect(list.unresolved).toHaveLength(1);
		expect(parseDecklist('2 MEG 3').entries[0].name).toBe('');
	});
});

describe('readable export', () => {
	it('writes PTCGL lines a model can quote back, grouped by lot and folder', () => {
		const added = api.quickAdd(ctx(), '2 OBF 1 rh\nMEG 21', { lot: 'july.2 lot', createLot: true }).data;
		const withDeck = api.createDeck(ctx(added), { name: 'Zard', list: '2 Numel MEG 21\n1 Charizard ex OBF 125', folder: 'Standard' }).data;

		const markdown = toReadableMarkdown(withDeck, catalogue, { generatedAt: 'now' });
		expect(markdown).toContain('### Lot: july.2 lot');
		expect(markdown).toContain('2 Oddish OBF 001 rh');
		expect(markdown).toContain('1 Numel MEG 021');
		expect(markdown).toContain('### Deck: Zard');
		expect(markdown).toContain('Folder: Standard');
		expect(markdown).toContain('- Charizard ex: 1 missing (need 1, own 0)');
		expect(markdown).toContain('- Numel: 1 missing (need 2, own 1)');

		// Every card line in a fenced block parses back through the importer.
		const lines = markdown.split('\n').filter((line) => /^\d+ .+ [A-Z]+ \d+/.test(line));
		expect(lines.length).toBeGreaterThan(0);
		for (const line of lines) expect(parseDecklist(line).entries).toHaveLength(1);

		const json = toReadableJson(withDeck, catalogue);
		expect(json.lots.find((lot) => lot.name === 'july.2 lot')?.cards).toHaveLength(2);
		expect(json.decks[0]).toMatchObject({ name: 'Zard', folder: ['Standard'], ownedCoverage: 1 / 3 });
	});
});
