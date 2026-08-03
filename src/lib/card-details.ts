/**
 * Full card detail — attacks, abilities, weaknesses, illustrator, market prices —
 * fetched from TCGdex one card at a time, when the user actually opens a card.
 *
 * This deliberately stays out of static/catalogue.json. Card text for ~21k printings
 * would add several megabytes to a file every visitor downloads up front, to show
 * information that is only ever read one card at a time. Prices would be stale the
 * moment the file was built, too.
 *
 * The service worker caches these responses, so a card stays readable offline once
 * it has been opened.
 */
const API = 'https://api.tcgdex.net/v2/en/cards';

export type Ability = { type: string; name: string; effect: string };
export type Attack = { name: string; cost: string[]; damage: string | null; effect: string | null };
export type Weakness = { type: string; value: string | null };

export type MarketPrice = {
	source: 'Cardmarket' | 'TCGplayer';
	currency: 'EUR' | 'USD';
	/** Best single number to show — trend for Cardmarket, market for TCGplayer. */
	price: number;
	low: number | null;
	updated: string | null;
};

export type CardDetail = {
	illustrator: string | null;
	dexIds: number[];
	abilities: Ability[];
	attacks: Attack[];
	weaknesses: Weakness[];
	/** Retreat cost in energy, or null for Trainer/Energy cards. */
	retreat: number | null;
	effect: string | null;
	prices: MarketPrice[];
	setLogo: string | null;
	setSymbol: string | null;
};

/**
 * TCGdex serves some newer cards' text as UTF-8 that was decoded as Latin-1 on their
 * side, so "Pokémon" arrives as "PokÃ©mon". Re-encoding the characters back to bytes
 * and decoding them as UTF-8 undoes it. Only safe when every character fits in a byte,
 * and the strict decoder rejects anything that was not mojibake to begin with.
 */
export function repairText(value: string): string {
	if (!/[ÃÂ]/.test(value)) return value;

	const bytes = new Uint8Array(value.length);
	for (let i = 0; i < value.length; i++) {
		const code = value.charCodeAt(i);
		if (code > 0xff) return value;
		bytes[i] = code;
	}

	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return value;
	}
}

const text = (value: unknown): string | null =>
	typeof value === 'string' && value.trim() ? repairText(value) : null;

type ApiPricing = {
	cardmarket?: { trend?: number; avg?: number; low?: number; updated?: string };
	tcgplayer?: Record<
		string,
		{ marketPrice?: number; lowPrice?: number } | string | undefined
	> & { updated?: string; unit?: string };
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

	// TCGplayer nests one object per finish (normal, holofoil, reverseHolofoil…).
	// Take the cheapest market price across them; the finish names vary by era.
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

/* eslint-disable @typescript-eslint/no-explicit-any -- shape of a third-party payload */
function toDetail(raw: any): CardDetail {
	// Newer cards carry prices per variant; older ones have a single top-level block.
	const variantPricing = (raw.variants_detailed ?? [])
		.map((variant: any) => variant?.pricing)
		.find(Boolean);

	return {
		illustrator: text(raw.illustrator),
		dexIds: Array.isArray(raw.dexId) ? raw.dexId : [],
		abilities: (raw.abilities ?? []).map((ability: any) => ({
			type: text(ability.type) ?? 'Ability',
			name: text(ability.name) ?? '',
			effect: text(ability.effect) ?? ''
		})),
		attacks: (raw.attacks ?? []).map((attack: any) => ({
			name: text(attack.name) ?? '',
			cost: Array.isArray(attack.cost) ? attack.cost : [],
			damage: attack.damage ? String(attack.damage) : null,
			effect: text(attack.effect)
		})),
		weaknesses: (raw.weaknesses ?? []).map((weakness: any) => ({
			type: text(weakness.type) ?? '',
			value: text(weakness.value)
		})),
		retreat: typeof raw.retreat === 'number' ? raw.retreat : null,
		effect: text(raw.effect),
		prices: readPrices(raw.pricing ?? variantPricing),
		setLogo: typeof raw.set?.logo === 'string' ? raw.set.logo : null,
		setSymbol: typeof raw.set?.symbol === 'string' ? raw.set.symbol : null
	};
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const cache = new Map<string, CardDetail>();
const inflight = new Map<string, Promise<CardDetail>>();

export async function loadCardDetail(cardId: string): Promise<CardDetail> {
	const cached = cache.get(cardId);
	if (cached) return cached;

	const existing = inflight.get(cardId);
	if (existing) return existing;

	const request = (async () => {
		const response = await fetch(`${API}/${encodeURIComponent(cardId)}`);
		if (!response.ok) throw new Error(`TCGdex returned ${response.status}`);

		const detail = toDetail(await response.json());
		cache.set(cardId, detail);
		return detail;
	})();

	inflight.set(cardId, request);
	try {
		return await request;
	} finally {
		inflight.delete(cardId);
	}
}

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

export const formatPrice = (price: MarketPrice) =>
	new Intl.NumberFormat(price.currency === 'EUR' ? 'de-DE' : 'en-US', {
		style: 'currency',
		currency: price.currency
	}).format(price.price);

/** Cheapest listed price across markets, for rough collection/buylist totals. */
export const lowestPrice = (detail: CardDetail): MarketPrice | null =>
	detail.prices.length === 0
		? null
		: detail.prices.reduce((best, price) => (price.price < best.price ? price : best));
