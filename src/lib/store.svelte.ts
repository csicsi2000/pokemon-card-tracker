/**
 * All user data — collection, decks, formats — held in memory as Svelte state and
 * mirrored to localStorage. There is no server: this is the whole database.
 *
 * Because it lives in one browser profile, clearing site data loses everything.
 * The Import/Export page has Backup and Restore for exactly that reason.
 */
import { browser } from '$app/environment';
import type {
	CardVariant,
	CollectionEntry,
	Deck,
	Format,
	FormatPoolCard,
	UserData
} from './types';
import { DEFAULT_RULES } from './tcg/format-rules';

const STORAGE_KEY = 'cardex:data:v1';

const empty = (): UserData => ({ version: 1, collection: [], decks: [], formats: [] });

function read(): UserData {
	if (!browser) return empty();

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return empty();
		return normalise(JSON.parse(raw));
	} catch (error) {
		console.error('Could not read saved data, starting empty.', error);
		return empty();
	}
}

/** Tolerate partial or older payloads — a backup file goes through here too. */
function normalise(value: unknown): UserData {
	const data = (value ?? {}) as Partial<UserData>;
	return {
		version: 1,
		collection: Array.isArray(data.collection) ? data.collection : [],
		decks: Array.isArray(data.decks) ? data.decks : [],
		formats: Array.isArray(data.formats) ? data.formats : []
	};
}

const now = () => new Date().toISOString();
const newId = () =>
	globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

class Store {
	#data = $state<UserData>(empty());
	/** False until the first browser read, so pages can avoid flashing empty state. */
	loaded = $state(false);

	get collection() {
		return this.#data.collection;
	}
	get decks() {
		return this.#data.decks;
	}
	get formats() {
		return this.#data.formats;
	}

	/** Call once on the client. Safe to call again; it just re-reads. */
	load() {
		this.#data = read();
		this.loaded = true;
	}

	#save() {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#data));
		} catch (error) {
			// Quota exceeded is the realistic failure; the caller shows a toast.
			throw new Error(`Could not save: ${(error as Error).message}`);
		}
	}

	// -- collection ---------------------------------------------------------

	ownedOf(cardId: string, variant: CardVariant) {
		return this.#data.collection.find((e) => e.cardId === cardId && e.variant === variant)?.quantity ?? 0;
	}

	/** Total copies of one printing across every finish. */
	ownedTotal(cardId: string) {
		return this.#data.collection
			.filter((entry) => entry.cardId === cardId)
			.reduce((sum, entry) => sum + entry.quantity, 0);
	}

	/** Absolute quantity; 0 removes the entry. */
	setOwned(cardId: string, variant: CardVariant, quantity: number) {
		const next = Math.max(0, Math.floor(quantity));
		const rest = this.#data.collection.filter((e) => !(e.cardId === cardId && e.variant === variant));
		this.#data.collection = next > 0 ? [...rest, { cardId, variant, quantity: next }] : rest;
		this.#save();
	}

	addOwned(entries: CollectionEntry[], mode: 'add' | 'replace') {
		const merged = new Map(
			this.#data.collection.map((entry) => [`${entry.cardId}|${entry.variant}`, { ...entry }])
		);

		for (const entry of entries) {
			const key = `${entry.cardId}|${entry.variant}`;
			const existing = merged.get(key);
			if (existing && mode === 'add') existing.quantity += entry.quantity;
			else merged.set(key, { ...entry });
		}

		this.#data.collection = [...merged.values()].filter((entry) => entry.quantity > 0);
		this.#save();
	}

	// -- decks --------------------------------------------------------------

	deck(id: string) {
		return this.#data.decks.find((deck) => deck.id === id);
	}

	createDeck(name: string, formatId: string | null = null, cards: Deck['cards'] = []) {
		const deck: Deck = {
			id: newId(),
			name,
			description: null,
			formatId,
			cards,
			createdAt: now(),
			updatedAt: now()
		};
		this.#data.decks = [deck, ...this.#data.decks];
		this.#save();
		return deck;
	}

	updateDeck(id: string, changes: Partial<Omit<Deck, 'id' | 'createdAt'>>) {
		this.#data.decks = this.#data.decks.map((deck) =>
			deck.id === id ? { ...deck, ...changes, updatedAt: now() } : deck
		);
		this.#save();
	}

	deleteDeck(id: string) {
		this.#data.decks = this.#data.decks.filter((deck) => deck.id !== id);
		this.#save();
	}

	setDeckQuantity(deckId: string, cardId: string, quantity: number) {
		const deck = this.deck(deckId);
		if (!deck) return;

		const next = Math.max(0, Math.floor(quantity));
		const rest = deck.cards.filter((card) => card.cardId !== cardId);
		this.updateDeck(deckId, { cards: next > 0 ? [...rest, { cardId, quantity: next }] : rest });
	}

	// -- formats ------------------------------------------------------------

	format(id: string) {
		return this.#data.formats.find((format) => format.id === id);
	}

	createFormat(name: string, description: string | null, rules: unknown) {
		const format: Format = {
			id: newId(),
			name,
			description,
			rules: rules ?? DEFAULT_RULES,
			pool: [],
			createdAt: now(),
			updatedAt: now()
		};
		this.#data.formats = [...this.#data.formats, format];
		this.#save();
		return format;
	}

	updateFormat(id: string, changes: Partial<Omit<Format, 'id' | 'createdAt'>>) {
		this.#data.formats = this.#data.formats.map((format) =>
			format.id === id ? { ...format, ...changes, updatedAt: now() } : format
		);
		this.#save();
	}

	deleteFormat(id: string) {
		this.#data.formats = this.#data.formats.filter((format) => format.id !== id);
		// Decks keep working; they just lose their format.
		this.#data.decks = this.#data.decks.map((deck) =>
			deck.formatId === id ? { ...deck, formatId: null } : deck
		);
		this.#save();
	}

	setPoolQuantity(formatId: string, cardId: string, quantity: number) {
		const format = this.format(formatId);
		if (!format) return;

		const next = Math.max(0, Math.floor(quantity));
		const rest = format.pool.filter((card) => card.cardId !== cardId);
		this.updateFormat(formatId, { pool: next > 0 ? [...rest, { cardId, quantity: next }] : rest });
	}

	addToPool(formatId: string, cards: FormatPoolCard[]) {
		const format = this.format(formatId);
		if (!format) return 0;

		const merged = new Map(format.pool.map((card) => [card.cardId, { ...card }]));
		for (const card of cards) merged.set(card.cardId, { ...card });

		this.updateFormat(formatId, { pool: [...merged.values()] });
		return cards.length;
	}

	// -- backup -------------------------------------------------------------

	export(): UserData {
		return structuredClone($state.snapshot(this.#data)) as UserData;
	}

	import(value: unknown) {
		this.#data = normalise(value);
		this.#save();
	}

	clear() {
		this.#data = empty();
		this.#save();
	}
}

export const store = new Store();
