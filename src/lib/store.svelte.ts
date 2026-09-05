/**
 * All user data — collection, lots, decks, folders, formats — held in memory as Svelte
 * state and mirrored to localStorage. There is no server: this is the whole database,
 * unless the user connects Google Drive, in which case sync/ keeps a copy there.
 *
 * Every write goes through a pure reducer in data/mutations.ts; this class only holds
 * the state, persists it, and counts revisions so the sync engine knows when to push.
 */
import { browser } from '$app/environment';
import type { CardVariant } from './types';
import { createClock } from './data/clock';
import { migrate } from './data/migrate';
import { emptyData, rowKey, type Deck, type DeckFolder, type Format, type Lot, type UserData } from './data/model';
import * as mutate from './data/mutations';
import { repair } from './data/repair';
import { DEFAULT_RULES } from './tcg/format-rules';

export const STORAGE_KEY = 'cardex:data:v2';
/** Where v1 builds kept their data; read once and left untouched. */
const LEGACY_KEY = 'cardex:data:v1';

class Store {
	#data = $state<UserData>(emptyData());
	/** False until the first browser read, so pages can avoid flashing empty state. */
	loaded = $state(false);
	/** Bumped on every save; the sync engine watches it. */
	revision = $state(0);
	readonly clock = createClock();

	get collection() {
		return this.#data.collection;
	}
	get lots() {
		return this.#data.lots;
	}
	get folders() {
		return this.#data.folders;
	}
	get decks() {
		return this.#data.decks;
	}
	get formats() {
		return this.#data.formats;
	}

	/** Call once on the client. Safe to call again; it just re-reads. */
	load() {
		this.#data = this.#read();
		this.clock.observe(this.#data);
		this.loaded = true;
	}

	#read(): UserData {
		if (!browser) return emptyData();
		try {
			const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
			if (!raw) return emptyData();
			return repair(migrate(JSON.parse(raw)), { now: new Date().toISOString() });
		} catch (error) {
			console.error('Could not read saved data, starting empty.', error);
			return emptyData();
		}
	}

	#commit(next: UserData) {
		if (next === this.#data) return;
		this.#data = next;
		this.revision += 1;
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		} catch (error) {
			// Quota exceeded is the realistic failure; the caller shows a toast.
			throw new Error(`Could not save: ${(error as Error).message}`);
		}
	}

	// -- collection ---------------------------------------------------------

	/** Copies of one printing in one finish — in one lot, or across all lots by default. */
	ownedOf(cardId: string, variant: CardVariant, lotId?: string | null) {
		return this.#data.collection
			.filter(
				(row) =>
					row.cardId === cardId &&
					row.variant === variant &&
					(lotId === undefined || row.lotId === lotId)
			)
			.reduce((sum, row) => sum + row.quantity, 0);
	}

	/** Total copies of one printing across every finish and lot. */
	ownedTotal(cardId: string) {
		return this.#data.collection
			.filter((row) => row.cardId === cardId)
			.reduce((sum, row) => sum + row.quantity, 0);
	}

	/** Absolute quantity for one printing/finish/lot; 0 removes the row. */
	setOwned(cardId: string, variant: CardVariant, quantity: number, lotId: string | null = null) {
		this.#commit(mutate.setOwned(this.#data, this.clock, cardId, variant, quantity, lotId));
	}

	addOwned(entries: mutate.RowInput[], mode: 'add' | 'replace') {
		this.#commit(mutate.addOwned(this.#data, this.clock, entries, mode));
	}

	moveOwned(fromKey: string, toLotId: string | null, quantity: number) {
		this.#commit(mutate.moveOwned(this.#data, this.clock, fromKey, toLotId, quantity));
	}

	// -- lots ---------------------------------------------------------------

	lot(id: string) {
		return this.#data.lots.find((lot) => lot.id === id);
	}

	/** Rows in one lot (`null` for Unsorted). */
	lotEntries(lotId: string | null) {
		return this.#data.collection.filter((row) => row.lotId === lotId);
	}

	createLot(input: { name: string; note?: string | null; acquiredOn?: string | null }): Lot {
		const { data, lot } = mutate.createLot(this.#data, this.clock, input);
		this.#commit(data);
		return lot;
	}

	updateLot(id: string, changes: Partial<Omit<Lot, 'id' | 'createdAt' | 'updatedAt'>>) {
		this.#commit(mutate.updateLot(this.#data, this.clock, id, changes));
	}

	deleteLot(id: string, cards: 'unsorted' | 'remove') {
		const next = mutate.deleteLot(this.#data, this.clock, id, cards);
		this.#commit(repair(next, { now: new Date().toISOString() }));
	}

	// -- folders ------------------------------------------------------------

	folder(id: string) {
		return this.#data.folders.find((folder) => folder.id === id);
	}

	createFolder(name: string, parentId: string | null = null): DeckFolder {
		const { data, folder } = mutate.createFolder(this.#data, this.clock, name, parentId);
		this.#commit(data);
		return folder;
	}

	updateFolder(id: string, changes: Partial<Pick<DeckFolder, 'name' | 'parentId'>>) {
		this.#commit(mutate.updateFolder(this.#data, this.clock, id, changes));
	}

	deleteFolder(id: string) {
		this.#commit(mutate.deleteFolder(this.#data, this.clock, id));
	}

	// -- decks --------------------------------------------------------------

	deck(id: string) {
		return this.#data.decks.find((deck) => deck.id === id);
	}

	createDeck(
		name: string,
		formatId: string | null = null,
		cards: Deck['cards'] = [],
		folderId: string | null = null
	): Deck {
		const { data, deck } = mutate.createDeck(this.#data, this.clock, {
			name,
			formatId,
			cards,
			folderId
		});
		this.#commit(data);
		return deck;
	}

	updateDeck(id: string, changes: Partial<Omit<Deck, 'id' | 'createdAt' | 'updatedAt'>>) {
		this.#commit(mutate.updateDeck(this.#data, this.clock, id, changes));
	}

	moveDeck(id: string, folderId: string | null) {
		this.updateDeck(id, { folderId });
	}

	deleteDeck(id: string) {
		this.#commit(mutate.deleteDeck(this.#data, this.clock, id));
	}

	setDeckQuantity(deckId: string, cardId: string, quantity: number) {
		this.#commit(mutate.setDeckQuantity(this.#data, this.clock, deckId, cardId, quantity));
	}

	// -- formats ------------------------------------------------------------

	format(id: string) {
		return this.#data.formats.find((format) => format.id === id);
	}

	createFormat(name: string, description: string | null, rules: unknown): Format {
		const { data, format } = mutate.createFormat(this.#data, this.clock, {
			name,
			description,
			rules: rules ?? DEFAULT_RULES
		});
		this.#commit(data);
		return format;
	}

	updateFormat(id: string, changes: Partial<Omit<Format, 'id' | 'createdAt' | 'updatedAt'>>) {
		this.#commit(mutate.updateFormat(this.#data, this.clock, id, changes));
	}

	deleteFormat(id: string) {
		this.#commit(mutate.deleteFormat(this.#data, this.clock, id));
	}

	setPoolQuantity(formatId: string, cardId: string, quantity: number) {
		this.#commit(mutate.setPoolQuantity(this.#data, this.clock, formatId, cardId, quantity));
	}

	addToPool(formatId: string, cards: Format['pool']) {
		const format = this.format(formatId);
		if (!format) return 0;
		this.#commit(mutate.addToPool(this.#data, this.clock, formatId, cards));
		return cards.length;
	}

	// -- backup & sync ------------------------------------------------------

	/** A detached copy of everything, for backups and for the sync engine. */
	export(): UserData {
		return structuredClone($state.snapshot(this.#data)) as UserData;
	}

	/** Restore a backup file (v1 or v2). Replaces everything; see mutations.restore. */
	import(value: unknown) {
		const incoming = repair(migrate(value), { now: new Date().toISOString() });
		this.#commit(mutate.restore(this.#data, this.clock, incoming));
	}

	/** Used by the sync engine after a merge: the payload is already merged and repaired. */
	replace(next: UserData) {
		this.clock.observe(next);
		this.#commit(next);
	}

	clear() {
		this.#commit(mutate.clear(this.#data, this.clock));
	}
}

export const store = new Store();
export { rowKey };
