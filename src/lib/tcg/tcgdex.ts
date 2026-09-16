/**
 * Talking to TCGdex, and turning what it says into catalogue rows.
 *
 * Two callers share this: `scripts/build-catalogue.ts`, which walks every set to write
 * `static/catalogue.json`, and `src/lib/catalogue-refresh.ts`, which tops that file up in
 * the browser when TCGdex has moved on since the build. They must encode rows the same
 * way or a refreshed set would decode differently from a built one, so the encoding
 * lives here once.
 *
 * Two surfaces are used, because neither alone has everything:
 *   * REST  /v2/en/sets/{id}   → abbreviation.official (the PTCGL set code), legality,
 *     release date
 *   * GraphQL cards(filters:{id:"<setId>-"}) → every card of one set with full detail in
 *     a single request. (GraphQL has no `abbreviation`/`legal`; its `pagination` argument
 *     is broken server-side, hence the per-set id-prefix filter.)
 *
 * Both surfaces send `access-control-allow-origin: *`, including on the GraphQL
 * preflight, so the browser may call them directly — no proxy, no key.
 */
import type { CardDetailRow, CardRow, SetRow } from '../catalogue-format';
import { cleanText } from './text';

export const TCGDEX_REST = 'https://api.tcgdex.net/v2/en';
export const TCGDEX_GRAPHQL = 'https://api.tcgdex.net/v2/graphql';

/** `fetch`, or SvelteKit's wrapped one during a `load`. */
export type Fetcher = typeof fetch;

/** What `GET /sets` returns: enough to tell whether a set is worth fetching in full. */
export type RestSetBrief = {
	id: string;
	name: string;
	cardCount?: { total?: number };
};

export type RestSet = RestSetBrief & {
	logo?: string;
	symbol?: string;
	releaseDate?: string;
	abbreviation?: { official?: string };
	legal?: { standard?: boolean; expanded?: boolean };
	serie?: { id: string; name: string };
};

export type GqlCard = {
	id: string;
	localId: string;
	name: string;
	category: string;
	rarity?: string | null;
	regulationMark?: string | null;
	hp?: number | null;
	types?: string[] | null;
	evolveFrom?: string | null;
	stage?: string | null;
	suffix?: string | null;
	trainerType?: string | null;
	energyType?: string | null;
	image?: string | null;
	set?: { id: string } | null;
	variants?: Record<string, boolean> | null;
	// Rules text, written to the per-set detail files rather than the catalogue.
	illustrator?: string | null;
	retreat?: number | null;
	effect?: string | null;
	abilities?: { type?: string; name?: string; effect?: string }[] | null;
	attacks?: { name?: string; cost?: string[]; damage?: string; effect?: string }[] | null;
	weaknesses?: { type?: string; value?: string }[] | null;
};

const CARD_FIELDS = `
	id localId name category rarity regulationMark hp types evolveFrom
	stage suffix trainerType energyType image illustrator retreat effect
	set { id }
	variants { normal reverse holo firstEdition wPromo }
	abilities { type name effect }
	attacks { name cost damage effect }
	weaknesses { type value }
`;

const SUPERTYPE_CODE: Record<string, 'P' | 'T' | 'E'> = {
	pokemon: 'P',
	trainer: 'T',
	energy: 'E'
};

const VARIANT_CODE: Record<string, string> = {
	normal: 'n',
	reverse: 'r',
	holo: 'h',
	firstEdition: 'f',
	wPromo: 'w'
};

export type FetchOptions = {
	fetcher?: Fetcher;
	/** Retries on failure. The build script wants patience; a browser refresh does not. */
	attempts?: number;
	signal?: AbortSignal;
};

export async function fetchJson<T>(
	url: string,
	init: RequestInit = {},
	options: FetchOptions = {}
): Promise<T> {
	const { fetcher = fetch, attempts = 4, signal } = options;

	for (let attempt = 1; ; attempt += 1) {
		try {
			const response = await fetcher(url, { ...init, signal: signal ?? init.signal });
			if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
			return (await response.json()) as T;
		} catch (error) {
			// An aborted refresh is the caller changing its mind, not a failure to retry.
			if (signal?.aborted || attempt >= attempts) throw error;
			await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
		}
	}
}

export const fetchSetBriefs = (options?: FetchOptions) =>
	fetchJson<RestSetBrief[]>(`${TCGDEX_REST}/sets`, {}, options);

export const fetchSet = (setId: string, options?: FetchOptions) =>
	fetchJson<RestSet>(`${TCGDEX_REST}/sets/${encodeURIComponent(setId)}`, {}, options);

export async function fetchSetCards(
	setId: string,
	options?: FetchOptions
): Promise<{ cards: GqlCard[]; warning?: string }> {
	const query = `{ cards(filters: { id: "${setId}-" }) { ${CARD_FIELDS} } }`;
	const body = await fetchJson<{ data?: { cards?: GqlCard[] }; errors?: unknown[] }>(
		TCGDEX_GRAPHQL,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query })
		},
		options
	);

	// TCGdex declares attack names non-nullable but has cards whose extra attack rows are
	// blank, so older sets always come back with errors attached. The card list itself is
	// still complete and correct, so use it and only bail when there is no data at all.
	const cards = body.data?.cards;
	if (!Array.isArray(cards)) {
		throw new Error(`no card data for ${setId}: ${JSON.stringify(body.errors ?? {}).slice(0, 200)}`);
	}

	return {
		// The prefix filter is a substring match, so re-check ownership per row.
		cards: cards.filter((card) => card && (card.set?.id ?? card.id.split('-')[0]) === setId),
		warning: body.errors?.length
			? `${setId}: ${body.errors.length} field error(s), data kept`
			: undefined
	};
}

/**
 * Every card image is "<set base>/<collector number>", verified across the whole
 * catalogue — so the base is stored once per set, not once per card.
 */
export function imageBaseOf(cards: GqlCard[]): string | null {
	for (const card of cards) {
		if (card.image) return card.image.slice(0, card.image.lastIndexOf('/'));
	}
	return null;
}

/**
 * Does this set's card art actually exist? TCGdex publishes card lists as soon as a set
 * is announced, so `image` is populated weeks before the scans are uploaded and the URL
 * 404s. A few cards are sampled rather than one, so a single missing scan in an
 * otherwise-illustrated set does not condemn the whole thing.
 */
export async function hasPublishedArtwork(cards: GqlCard[], options: FetchOptions = {}) {
	const { fetcher = fetch, signal } = options;

	for (const sample of cards.filter((card) => card.image).slice(0, 3)) {
		try {
			const response = await fetcher(`${sample.image}/low.webp`, { method: 'HEAD', signal });
			if (response.ok) return true;
		} catch {
			// Network hiccup on one sample; try the next.
		}
	}

	return false;
}

export function toSetRow(
	set: RestSet,
	extra: { imageBase: string | null; artworkPublished: boolean }
): SetRow {
	return [
		set.id,
		set.name,
		set.serie?.name ?? null,
		set.abbreviation?.official ?? null,
		set.releaseDate ?? null,
		set.cardCount?.total ?? null,
		extra.imageBase,
		set.symbol ?? null,
		set.logo ?? null,
		set.legal?.standard ? 1 : 0,
		set.legal?.expanded ? 1 : 0,
		extra.artworkPublished ? 1 : 0
	];
}

export function toCardRow(card: GqlCard, setIndex: number): CardRow {
	const subtypes = [card.stage, card.suffix, card.trainerType, card.energyType].filter(
		(value): value is string => Boolean(value)
	);

	const variants = Object.entries(card.variants ?? {})
		.filter(([key, enabled]) => enabled && VARIANT_CODE[key])
		.map(([key]) => VARIANT_CODE[key])
		.join('');

	return [
		card.id,
		setIndex,
		card.localId,
		card.name,
		SUPERTYPE_CODE[card.category?.toLowerCase()] ?? 'T',
		subtypes,
		card.rarity ?? null,
		card.regulationMark ?? null,
		card.hp ?? null,
		card.types ?? [],
		card.evolveFrom ?? null,
		variants,
		card.image ? 1 : 0
	];
}

/** Drops empty keys so the detail files stay compact. */
export function toDetailRow(card: GqlCard): CardDetailRow | null {
	const row: CardDetailRow = { localId: card.localId };

	const illustrator = cleanText(card.illustrator);
	if (illustrator) row.illustrator = illustrator;
	if (typeof card.retreat === 'number') row.retreat = card.retreat;

	const effect = cleanText(card.effect);
	if (effect) row.effect = effect;

	const abilities = (card.abilities ?? []).map((ability) => ({
		type: cleanText(ability.type) ?? 'Ability',
		name: cleanText(ability.name) ?? '',
		effect: cleanText(ability.effect) ?? ''
	}));
	if (abilities.length) row.abilities = abilities;

	// Blank attack rows are what makes the GraphQL query complain; drop them here.
	const attacks = (card.attacks ?? [])
		.filter((attack) => attack && cleanText(attack.name))
		.map((attack) => {
			const damage = cleanText(attack.damage);
			const effect = cleanText(attack.effect);
			return {
				name: cleanText(attack.name)!,
				cost: attack.cost ?? [],
				...(damage ? { damage } : {}),
				...(effect ? { effect } : {})
			};
		});
	if (attacks.length) row.attacks = attacks;

	const weaknesses = (card.weaknesses ?? [])
		.filter((weakness) => weakness && cleanText(weakness.type))
		.map((weakness) => {
			const value = cleanText(weakness.value);
			return { type: cleanText(weakness.type)!, ...(value ? { value } : {}) };
		});
	if (weaknesses.length) row.weaknesses = weaknesses;

	// A row with nothing but its id is not worth writing.
	return Object.keys(row).length > 1 ? row : null;
}

/** Run `worker` over `items` with a bounded number of in-flight requests. */
export async function mapLimit<T, R>(
	items: T[],
	limit: number,
	worker: (item: T) => Promise<R>
): Promise<R[]> {
	const results: R[] = [];
	let cursor = 0;

	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (cursor < items.length) {
				const index = cursor++;
				results[index] = await worker(items[index]);
			}
		})
	);

	return results;
}
