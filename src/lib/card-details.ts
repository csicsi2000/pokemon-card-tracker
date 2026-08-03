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
	source: 'Cardmarket' | 'TCGplayer';
	currency: 'EUR' | 'USD';
	/** The headline number: trend for Cardmarket, market price for TCGplayer. */
	price: number;
	low: number | null;
	updated: string | null;
};

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

const priceCache = new Map<string, MarketPrice[]>();
const priceRequests = new Map<string, Promise<MarketPrice[]>>();

export async function loadPrices(cardId: string): Promise<MarketPrice[]> {
	const cached = priceCache.get(cardId);
	if (cached) return cached;

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
		priceCache.set(cardId, prices);
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

export const formatPrice = (price: MarketPrice, amount = price.price) =>
	new Intl.NumberFormat(price.currency === 'EUR' ? 'de-DE' : 'en-US', {
		style: 'currency',
		currency: price.currency
	}).format(amount);

/** Re-exported so callers repairing live API text do not need a second import. */
export { cleanText };
