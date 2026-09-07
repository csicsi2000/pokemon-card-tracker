/**
 * Display preferences for this browser: how the app looks, not what is in the
 * collection. They live in their own localStorage key and are never merged or synced —
 * a phone may well want the side sheet while a desktop wants the big centred dialog.
 */
import { browser } from '$app/environment';
import type { CollectionSort, SortDirection } from './tcg/collection-view';

/** Where a card opens: the sheet sliding in from the right, or a centred dialog with bigger art. */
export type CardView = 'side' | 'center';

export const CARD_VIEW_LABELS: Record<CardView, string> = {
	side: 'Side panel',
	center: 'Centred dialog'
};

/** How the wants list is drawn: art to browse, rows to edit, or one line each to scan. */
export type WantView = 'cards' | 'detailed' | 'compact';

export const WANT_VIEW_LABELS: Record<WantView, string> = {
	cards: 'Cards',
	detailed: 'Detailed',
	compact: 'Compact'
};

/** How a deck's cards are drawn: rows you can edit, or the art laid out like a binder page. */
export type DeckView = 'list' | 'grid';

export const DECK_VIEW_LABELS: Record<DeckView, string> = {
	list: 'List',
	grid: 'Grid'
};

const STORAGE_KEY = 'cardex:prefs:v1';

type Preferences = {
	cardView: CardView;
	wantView: WantView;
	/** How the cards in a deck are drawn. */
	deckView: DeckView;
	/** Wants list last looked at: '' the default list, '*' all of them, else an id. */
	wantList: string;
	/** How the trade binder is drawn; the same three views as wants. */
	tradeView: WantView;
	/** How the collection grid is ordered. The filters beside it are not remembered. */
	collectionSort: CollectionSort;
	collectionSortDir: SortDirection;
	/**
	 * The set pinned in each lot's quick add box, by lot id ('unsorted' for the Unsorted
	 * lot). A half-sorted stack is usually finished over several sittings.
	 */
	lotAddSets: Record<string, string>;
};

const defaults = (): Preferences => ({
	cardView: 'side',
	wantView: 'detailed',
	deckView: 'list',
	wantList: '*',
	tradeView: 'detailed',
	collectionSort: 'name',
	collectionSortDir: 'asc',
	lotAddSets: {}
});

class Prefs {
	#values = $state<Preferences>(defaults());

	/** Call once on the client. Safe to call again; it just re-reads. */
	load() {
		this.#values = this.#read();
	}

	get cardView() {
		return this.#values.cardView;
	}
	set cardView(value: CardView) {
		this.#commit({ ...this.#values, cardView: value });
	}

	get wantView() {
		return this.#values.wantView;
	}
	set wantView(value: WantView) {
		this.#commit({ ...this.#values, wantView: value });
	}

	get deckView() {
		return this.#values.deckView;
	}
	set deckView(value: DeckView) {
		this.#commit({ ...this.#values, deckView: value });
	}

	get wantList() {
		return this.#values.wantList;
	}
	set wantList(value: string) {
		this.#commit({ ...this.#values, wantList: value });
	}

	get tradeView() {
		return this.#values.tradeView;
	}
	set tradeView(value: WantView) {
		this.#commit({ ...this.#values, tradeView: value });
	}

	get collectionSort() {
		return this.#values.collectionSort;
	}
	set collectionSort(value: CollectionSort) {
		this.#commit({ ...this.#values, collectionSort: value });
	}

	get collectionSortDir() {
		return this.#values.collectionSortDir;
	}
	set collectionSortDir(value: SortDirection) {
		this.#commit({ ...this.#values, collectionSortDir: value });
	}

	/** The set id pinned for quick add in one lot, or '' for none. */
	lotAddSet(lotKey: string): string {
		return this.#values.lotAddSets[lotKey] ?? '';
	}

	setLotAddSet(lotKey: string, setId: string) {
		const lotAddSets = { ...this.#values.lotAddSets };
		if (setId) lotAddSets[lotKey] = setId;
		else delete lotAddSets[lotKey];
		this.#commit({ ...this.#values, lotAddSets });
	}

	#read(): Preferences {
		if (!browser) return defaults();
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			const saved = raw ? (JSON.parse(raw) as Partial<Preferences>) : null;
			return { ...defaults(), ...saved };
		} catch {
			return defaults();
		}
	}

	#commit(next: Preferences) {
		this.#values = next;
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		} catch {
			// A preference that fails to stick is not worth interrupting anyone over;
			// it stays in memory for this session.
		}
	}
}

export const prefs = new Prefs();
