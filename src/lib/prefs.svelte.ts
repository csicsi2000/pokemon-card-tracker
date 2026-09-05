/**
 * Display preferences for this browser: how the app looks, not what is in the
 * collection. They live in their own localStorage key and are never merged or synced —
 * a phone may well want the side sheet while a desktop wants the big centred dialog.
 */
import { browser } from '$app/environment';

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

const STORAGE_KEY = 'cardex:prefs:v1';

type Preferences = {
	cardView: CardView;
	wantView: WantView;
	/** Wants list last looked at: '' the default list, '*' all of them, else an id. */
	wantList: string;
};

const defaults = (): Preferences => ({ cardView: 'side', wantView: 'detailed', wantList: '*' });

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

	get wantList() {
		return this.#values.wantList;
	}
	set wantList(value: string) {
		this.#commit({ ...this.#values, wantList: value });
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
