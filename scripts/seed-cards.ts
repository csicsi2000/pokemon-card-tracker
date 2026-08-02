/**
 * Seeds `sets` and `cards` from TCGdex into Supabase. Idempotent — re-run it whenever
 * a new set is released:  npm run sync:cards
 *
 * Two TCGdex surfaces are used, because neither alone has everything:
 *   * REST  /v2/en/sets/{id}   → abbreviation.official (the PTCGL set code), legality, release date
 *   * GraphQL cards(filters:{id:"<setId>-"}) → every card of one set with full detail
 *     in a single request. (GraphQL has no `abbreviation`/`legal`; its `pagination`
 *     argument is broken server-side, hence the per-set id-prefix filter.)
 *
 * Prices are deliberately NOT seeded: TCGdex only exposes them per card over REST,
 * which would mean ~20k requests. They are fetched on demand and cached instead —
 * see src/lib/server/pricing.ts.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { normalizeName } from '../src/lib/tcg/normalize.js';
import { EXCLUDED_SERIES } from '../src/lib/tcg/set-code-overrides.js';

const REST = 'https://api.tcgdex.net/v2/en';
const GRAPHQL = 'https://api.tcgdex.net/v2/graphql';
const CONCURRENCY = 8;

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
	console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
	auth: { persistSession: false }
});

// ---------------------------------------------------------------------------
// TCGdex response shapes (only the fields we consume)
// ---------------------------------------------------------------------------

type RestSet = {
	id: string;
	name: string;
	logo?: string;
	symbol?: string;
	releaseDate?: string;
	abbreviation?: { official?: string; localized?: string };
	legal?: { standard?: boolean; expanded?: boolean };
	cardCount?: { total?: number; official?: number };
	serie?: { id: string; name: string };
};

type GqlCard = {
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
	illustrator?: string | null;
	image?: string | null;
	set?: { id: string } | null;
	variants?: Record<string, boolean> | null;
};

const CARD_FIELDS = `
	id localId name category rarity regulationMark hp types evolveFrom
	stage suffix trainerType energyType illustrator image
	set { id }
	variants { normal reverse holo firstEdition wPromo }
`;

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string, init?: RequestInit, attempt = 1): Promise<T> {
	try {
		const res = await fetch(url, init);
		if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
		return (await res.json()) as T;
	} catch (error) {
		if (attempt >= 4) throw error;
		await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
		return fetchJson<T>(url, init, attempt + 1);
	}
}

async function fetchSetCards(setId: string): Promise<GqlCard[]> {
	const query = `{ cards(filters: { id: "${setId}-" }) { ${CARD_FIELDS} } }`;
	const body = await fetchJson<{ data?: { cards?: GqlCard[] }; errors?: unknown[] }>(GRAPHQL, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query })
	});

	if (body.errors?.length) {
		throw new Error(`GraphQL error for ${setId}: ${JSON.stringify(body.errors).slice(0, 300)}`);
	}

	// The prefix filter is a substring match, so re-check ownership before trusting a row.
	return (body.data?.cards ?? []).filter((card) => (card.set?.id ?? card.id.split('-')[0]) === setId);
}

/** Run `worker` over `items` with a bounded number of in-flight requests. */
async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
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

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

const SUPERTYPES: Record<string, 'Pokemon' | 'Trainer' | 'Energy'> = {
	pokemon: 'Pokemon',
	trainer: 'Trainer',
	energy: 'Energy'
};

function toSetRow(set: RestSet) {
	return {
		id: set.id,
		name: set.name,
		series: set.serie?.name ?? null,
		ptcgl_code: set.abbreviation?.official ?? null,
		release_date: set.releaseDate ?? null,
		card_count: set.cardCount?.total ?? null,
		logo_url: set.logo ?? null,
		symbol_url: set.symbol ?? null,
		legal_standard: set.legal?.standard ?? false,
		legal_expanded: set.legal?.expanded ?? false
	};
}

function toCardRow(card: GqlCard, setId: string) {
	// TCGdex splits what PTCG calls a subtype across several fields; flatten them so
	// the app can filter on one array ("Stage2", "ex", "Item", "Special").
	const subtypes = [card.stage, card.suffix, card.trainerType, card.energyType].filter(
		(value): value is string => Boolean(value)
	);

	const variants = Object.fromEntries(
		Object.entries(card.variants ?? {}).filter(([, enabled]) => enabled)
	);

	return {
		id: card.id,
		set_id: setId,
		local_id: card.localId,
		name: card.name,
		name_normalized: normalizeName(card.name),
		supertype: SUPERTYPES[card.category?.toLowerCase()] ?? 'Trainer',
		subtypes,
		rarity: card.rarity ?? null,
		regulation_mark: card.regulationMark ?? null,
		hp: card.hp ?? null,
		types: card.types ?? [],
		evolves_from: card.evolveFrom ?? null,
		image_url: card.image ?? null,
		variants,
		pricing: null,
		raw: card as unknown as Record<string, unknown>
	};
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function upsertInChunks<T>(table: 'sets' | 'cards', rows: T[], size = 500) {
	for (let i = 0; i < rows.length; i += size) {
		const chunk = rows.slice(i, i + size);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { error } = await supabase.from(table).upsert(chunk as any, { onConflict: 'id' });
		if (error) throw new Error(`upsert ${table} failed: ${error.message}`);
	}
}

async function main() {
	const onlySets = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));

	console.log('Fetching set list…');
	const brief = await fetchJson<{ id: string }[]>(`${REST}/sets`);
	const setIds = onlySets.length ? onlySets : brief.map((s) => s.id);
	console.log(`${setIds.length} sets to sync.`);

	console.log('Fetching set details…');
	const allDetails = await mapLimit(setIds, CONCURRENCY, (id) =>
		fetchJson<RestSet>(`${REST}/sets/${id}`)
	);

	const details = allDetails.filter((set) => !EXCLUDED_SERIES.has(set.serie?.id ?? ''));
	const skipped = allDetails.length - details.length;
	if (skipped) console.log(`Skipping ${skipped} set(s) from non-physical series.`);

	await upsertInChunks('sets', details.map(toSetRow));
	console.log(`Upserted ${details.length} sets.`);

	const syncIds = details.map((set) => set.id);
	let total = 0;
	let done = 0;
	const failures: string[] = [];

	await mapLimit(syncIds, CONCURRENCY, async (setId) => {
		try {
			const cards = await fetchSetCards(setId);
			if (cards.length) await upsertInChunks('cards', cards.map((c) => toCardRow(c, setId)));
			total += cards.length;
		} catch (error) {
			failures.push(`${setId}: ${(error as Error).message}`);
		}

		done += 1;
		if (done % 20 === 0 || done === syncIds.length) {
			process.stdout.write(`  ${done}/${syncIds.length} sets · ${total} cards\n`);
		}
	});

	console.log(`\nDone. ${total} cards across ${syncIds.length - failures.length} sets.`);

	if (failures.length) {
		console.warn(`\n${failures.length} set(s) failed:`);
		for (const failure of failures) console.warn(`  ${failure}`);
	}

	const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true });
	console.log(`cards table now holds ${count} rows.`);

	const { data: missingCodes } = await supabase
		.from('sets')
		.select('id, name')
		.is('ptcgl_code', null);
	if (missingCodes?.length) {
		console.warn(
			`\n${missingCodes.length} set(s) have no PTCGL code — imports referencing them fall back to name matching.`
		);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
