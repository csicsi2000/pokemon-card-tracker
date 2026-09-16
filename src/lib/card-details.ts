/**
 * The parts of a card the catalogue does not carry, from two sources with very
 * different change rates:
 *
 *   * Rules text — attacks, abilities, weaknesses, retreat, illustrator. Fixed once a
 *     set is printed, so it ships with the app in static/details/<setId>.json, one file
 *     per set (~13 KB gzipped). Open one card and the rest of that set is already local,
 *     works offline, and survives TCGdex being down.
 *   * Prices — change daily, so they are fetched live per card and never stored. When
 *     the network is unavailable this is the only part that goes missing.
 */
import { base } from '$app/paths';
import { getCatalogueDelta } from './catalogue';
import { detailUrl, type CardDetailRow, type SetDetailFile } from './catalogue-format';
import { cleanText } from './tcg/text';

const REST = 'https://api.tcgdex.net/v2/en/cards';

export type Ability = { type: string; name: string; effect: string };
export type Attack = { name: string; cost: string[]; damage: string | null; effect: string | null };
export type Weakness = { type: string; value: string | null };

export type CardText = {
	illustrator: string | null;
	abilities: Ability[];
	attacks: Attack[];
	weaknesses: Weakness[];
	/** Retreat cost in energy; null for Trainer and Energy cards. */
	retreat: number | null;
	effect: string | null;
};

export type MarketPrice = {
	source: PriceSource;
	currency: 'EUR' | 'USD';
	/** The headline number: trend for Cardmarket, market price for TCGplayer. */
	price: number;
	low: number | null;
	updated: string | null;
};

/** Which marketplace a price came from. Cardmarket quotes EUR, TCGplayer USD. */
export type PriceSource = 'Cardmarket' | 'TCGplayer';

export const PRICE_SOURCES: PriceSource[] = ['Cardmarket', 'TCGplayer'];

export const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
	Cardmarket: 'Cardmarket (€)',
	TCGplayer: 'TCGplayer ($)'
};

/** The quote from one marketplace, or null when that marketplace has no price. */
export const priceFrom = (prices: MarketPrice[] | undefined, source: PriceSource) =>
	prices?.find((price) => price.source === source) ?? null;

const EMPTY_TEXT: CardText = {
	illustrator: null,
	abilities: [],
	attacks: [],
	weaknesses: [],
	retreat: null,
	effect: null
};

function toText(row: CardDetailRow | undefined): CardText {
	if (!row) return EMPTY_TEXT;
	return {
		illustrator: row.illustrator ?? null,
		abilities: row.abilities ?? [],
		attacks: (row.attacks ?? []).map((attack) => ({
			name: attack.name,
			cost: attack.cost ?? [],
			damage: attack.damage ?? null,
			effect: attack.effect ?? null
		})),
		weaknesses: (row.weaknesses ?? []).map((weakness) => ({
			type: weakness.type,
			value: weakness.value ?? null
		})),
		retreat: row.retreat ?? null,
		effect: row.effect ?? null
	};
}

// -- rules text (bundled, per set) -----------------------------------------

const setFiles = new Map<string, Map<string, CardDetailRow>>();
const setRequests = new Map<string, Promise<Map<string, CardDetailRow>>>();

async function loadSetDetail(setId: string) {
	const cached = setFiles.get(setId);
	if (cached) return cached;

	const existing = setRequests.get(setId);
	if (existing) return existing;

	const request = (async () => {
		let rows: CardDetailRow[] = [];
		try {
			const response = await fetch(`${base}${detailUrl(setId)}`);
			// A set whose cards are all vanilla has no file at all; that is not an error.
			if (response.ok) rows = ((await response.json()) as SetDetailFile).cards ?? [];
		} catch {
			rows = [];
		}

		const byLocalId = new Map(rows.map((row) => [row.localId, row]));

		// A set the background refresh re-fetched has newer text than the bundled file —
		// and a set published since the build has no bundled file at all, so this is the
		// only place its rules text comes from. Either way the fresher rows win.
		for (const row of getCatalogueDelta()?.sets[setId]?.details ?? []) {
			byLocalId.set(row.localId, row);
		}

		setFiles.set(setId, byLocalId);
		return byLocalId;
	})();

	setRequests.set(setId, request);
	try {
		return await request;
	} finally {
		setRequests.delete(setId);
	}
}

/**
 * Forget the per-set files already parsed, so the next read picks up newer rows. Called
 * after a catalogue refresh merges a set — the map built before it would still hold the
 * bundled text.
 */
export function clearCardTextCache() {
	setFiles.clear();
}

export async function loadCardText(setId: string, localId: string): Promise<CardText> {
	return toText((await loadSetDetail(setId)).get(localId));
}

// -- prices (live) ---------------------------------------------------------

type ApiPricing = {
	cardmarket?: { trend?: number; avg?: number; low?: number; updated?: string };
	tcgplayer?: Record<string, { marketPrice?: number; lowPrice?: number } | string | undefined> & {
		updated?: string;
	};
};

function readPrices(pricing: ApiPricing | undefined): MarketPrice[] {
	const prices: MarketPrice[] = [];

	const market = pricing?.cardmarket;
	const cardmarket = market?.trend ?? market?.avg;
	if (typeof cardmarket === 'number' && cardmarket > 0) {
		prices.push({
			source: 'Cardmarket',
			currency: 'EUR',
			price: cardmarket,
			low: typeof market?.low === 'number' ? market.low : null,
			updated: market?.updated ?? null
		});
	}

	// TCGplayer nests one object per finish (normal, holofoil, reverseHolofoil…), and the
	// finish names vary by era — so take the cheapest market price across all of them.
	const player = pricing?.tcgplayer;
	if (player) {
		let best: { market: number; low: number | null } | null = null;
		for (const [key, value] of Object.entries(player)) {
			if (key === 'updated' || key === 'unit' || !value || typeof value !== 'object') continue;
			const market = value.marketPrice;
			if (typeof market !== 'number' || market <= 0) continue;
			if (!best || market < best.market) {
				best = { market, low: typeof value.lowPrice === 'number' ? value.lowPrice : null };
			}
		}
		if (best) {
			prices.push({
				source: 'TCGplayer',
				currency: 'USD',
				price: best.market,
				low: best.low,
				updated: typeof player.updated === 'string' ? player.updated : null
			});
		}
	}

	return prices;
}

/**
 * Prices are the one thing on a card that goes stale, and pricing a whole wants list is
 * one REST call per card — so what comes back is kept in this browser for half a day
 * rather than fetched again every time the list is drawn. Display data, like prefs: its
 * own key, never merged, never synced. The cap keeps it from crowding the collection out
 * of localStorage; the oldest quotes go first.
 */
const PRICE_KEY = 'cardex:prices:v1';
const PRICE_TTL_MS = 12 * 60 * 60 * 1000;
const PRICE_CACHE_MAX = 1500;

type CachedPrice = { at: number; prices: MarketPrice[] };

let priceCache: Map<string, CachedPrice> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function cache(): Map<string, CachedPrice> {
	if (priceCache) return priceCache;
	priceCache = new Map();
	try {
		const raw = localStorage.getItem(PRICE_KEY);
		const saved = raw ? (JSON.parse(raw) as Record<string, CachedPrice>) : {};
		for (const [cardId, entry] of Object.entries(saved ?? {})) {
			if (typeof entry?.at === 'number' && Array.isArray(entry.prices)) {
				priceCache.set(cardId, entry);
			}
		}
	} catch {
		// No storage, or junk in it: start empty and refetch. Never fatal.
	}
	return priceCache;
}

function persist() {
	persistTimer = null;
	const entries = [...cache().entries()]
		.sort((a, b) => b[1].at - a[1].at)
		.slice(0, PRICE_CACHE_MAX);
	priceCache = new Map(entries);
	try {
		localStorage.setItem(PRICE_KEY, JSON.stringify(Object.fromEntries(entries)));
	} catch {
		// A price that fails to stick just gets fetched again next time.
	}
}

/** Pricing a list writes once per card; batch those into one serialization. */
function schedulePersist() {
	if (persistTimer !== null) return;
	persistTimer = setTimeout(persist, 1000);
}

/** Wipe the stored quotes — the "refresh prices" button, and a settings escape hatch. */
export function clearPriceCache() {
	priceCache = new Map();
	if (persistTimer !== null) clearTimeout(persistTimer);
	persistTimer = null;
	try {
		localStorage.removeItem(PRICE_KEY);
	} catch {
		// Nothing to clear if there is no storage.
	}
}

/** How old the freshest quote in the cache is, for "prices from 2 hours ago". */
export function pricesCachedAt(cardId: string): number | null {
	return cache().get(cardId)?.at ?? null;
}

const priceRequests = new Map<string, Promise<MarketPrice[]>>();

export async function loadPrices(cardId: string): Promise<MarketPrice[]> {
	const cached = cache().get(cardId);
	if (cached && Date.now() - cached.at < PRICE_TTL_MS) return cached.prices;

	const existing = priceRequests.get(cardId);
	if (existing) return existing;

	const request = (async () => {
		const response = await fetch(`${REST}/${encodeURIComponent(cardId)}`);
		if (!response.ok) throw new Error(`TCGdex returned ${response.status}`);

		/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- third-party shape */
		const raw: any = await response.json();
		// Newer cards carry prices per variant; older ones have one top-level block.
		const variantPricing = (raw.variants_detailed ?? [])
			/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- third-party shape */
			.map((variant: any) => variant?.pricing)
			.find(Boolean);

		const prices = readPrices(raw.pricing ?? variantPricing);
		cache().set(cardId, { at: Date.now(), prices });
		schedulePersist();
		return prices;
	})();

	priceRequests.set(cardId, request);
	try {
		return await request;
	} finally {
		priceRequests.delete(cardId);
	}
}

// -- presentation helpers --------------------------------------------------

/** Energy-type accents, close to the printed colours. Used for cost pips and badges. */
export const TYPE_COLORS: Record<string, string> = {
	Grass: 'bg-green-600',
	Fire: 'bg-red-600',
	Water: 'bg-sky-500',
	Lightning: 'bg-yellow-400 text-black',
	Psychic: 'bg-purple-600',
	Fighting: 'bg-orange-700',
	Darkness: 'bg-slate-700',
	Metal: 'bg-zinc-500',
	Fairy: 'bg-pink-500',
	Dragon: 'bg-amber-700',
	Colorless: 'bg-neutral-400 text-black'
};

export const typeColor = (type: string) => TYPE_COLORS[type] ?? 'bg-neutral-500';

export const CURRENCY_OF: Record<PriceSource, 'EUR' | 'USD'> = {
	Cardmarket: 'EUR',
	TCGplayer: 'USD'
};

export const formatMoney = (currency: 'EUR' | 'USD', amount: number) =>
	new Intl.NumberFormat(currency === 'EUR' ? 'de-DE' : 'en-US', {
		style: 'currency',
		currency
	}).format(amount);

export const formatPrice = (price: MarketPrice, amount = price.price) =>
	formatMoney(price.currency, amount);

/** Re-exported so callers repairing live API text do not need a second import. */
export { cleanText };
