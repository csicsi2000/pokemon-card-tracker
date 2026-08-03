/**
 * Builds `static/catalogue.json` — the whole English card catalogue as one static
 * asset, so the app needs no backend:  npm run build:catalogue
 *
 * Two TCGdex surfaces are used, because neither alone has everything:
 *   * REST  /v2/en/sets/{id}   → abbreviation.official (the PTCGL set code), legality, release date
 *   * GraphQL cards(filters:{id:"<setId>-"}) → every card of one set with full detail
 *     in a single request. (GraphQL has no `abbreviation`/`legal`; its `pagination`
 *     argument is broken server-side, hence the per-set id-prefix filter.)
 *
 * Rows are written as tuples rather than objects: ~21k cards come to 2.5 MB, which
 * gzips to about 330 KB over the wire. src/lib/catalogue.ts expands them on load.
 *
 * Prices are not included. TCGdex only exposes them per card over REST, which would
 * mean ~21k requests for numbers that go stale immediately.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	CATALOGUE_PATH,
	DETAILS_DIR,
	EXCLUDED_SERIES,
	type CardDetailRow,
	type CatalogueFile,
	type SetDetailFile
} from '../src/lib/catalogue-format.js';
import { cleanText } from '../src/lib/tcg/text.js';

const REST = 'https://api.tcgdex.net/v2/en';
const GRAPHQL = 'https://api.tcgdex.net/v2/graphql';
const CONCURRENCY = 8;

type RestSet = {
	id: string;
	name: string;
	logo?: string;
	symbol?: string;
	releaseDate?: string;
	abbreviation?: { official?: string };
	legal?: { standard?: boolean; expanded?: boolean };
	cardCount?: { total?: number };
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

async function fetchSetCards(setId: string): Promise<{ cards: GqlCard[]; warning?: string }> {
	const query = `{ cards(filters: { id: "${setId}-" }) { ${CARD_FIELDS} } }`;
	const body = await fetchJson<{ data?: { cards?: GqlCard[] }; errors?: unknown[] }>(GRAPHQL, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query })
	});

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
		warning: body.errors?.length ? `${setId}: ${body.errors.length} field error(s), data kept` : undefined
	};
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

/** Drops empty keys so the detail files stay compact. */
function toDetailRow(card: GqlCard): CardDetailRow | null {
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

/**
 * Does this set's card art actually exist? TCGdex publishes card lists as soon as a set
 * is announced, so `image` is populated weeks before the scans are uploaded and the URL
 * 404s. A few cards are sampled rather than one, so a single missing scan in an
 * otherwise-illustrated set does not condemn the whole thing.
 */
async function hasPublishedArtwork(cards: GqlCard[]) {
	const samples = cards.filter((card) => card.image).slice(0, 3);

	for (const sample of samples) {
		try {
			const response = await fetch(`${sample.image}/low.webp`, { method: 'HEAD' });
			if (response.ok) return true;
		} catch {
			// Network hiccup on one sample; try the next.
		}
	}

	return false;
}

async function main() {
	console.log('Fetching set list…');
	const brief = await fetchJson<{ id: string }[]>(`${REST}/sets`);

	console.log(`Fetching details for ${brief.length} sets…`);
	const allSets = await mapLimit(brief, CONCURRENCY, (s) => fetchJson<RestSet>(`${REST}/sets/${s.id}`));

	const sets = allSets.filter((set) => !EXCLUDED_SERIES.has(set.serie?.id ?? ''));
	const skipped = allSets.length - sets.length;
	if (skipped) console.log(`Skipping ${skipped} set(s) from non-physical series.`);

	const setIndex = new Map(sets.map((set, i) => [set.id, i]));
	const imageBases = new Map<string, string>();
	const cardRows: CatalogueFile['cards'] = [];
	const detailsBySet = new Map<string, CardDetailRow[]>();
	const artworkPublished = new Set<string>();
	const failures: string[] = [];
	const warnings: string[] = [];
	let done = 0;

	await mapLimit(sets, CONCURRENCY, async (set) => {
		try {
			const { cards, warning } = await fetchSetCards(set.id);
			if (warning) warnings.push(warning);
			const details: CardDetailRow[] = [];

			for (const card of cards) {
				// Every card image is "<set base>/<collector number>", verified across the
				// whole catalogue — so the base is stored once per set, not once per card.
				if (card.image) {
					const base = card.image.slice(0, card.image.lastIndexOf('/'));
					if (!imageBases.has(set.id)) imageBases.set(set.id, base);
				}

				const subtypes = [card.stage, card.suffix, card.trainerType, card.energyType].filter(
					(value): value is string => Boolean(value)
				);

				const variants = Object.entries(card.variants ?? {})
					.filter(([key, enabled]) => enabled && VARIANT_CODE[key])
					.map(([key]) => VARIANT_CODE[key])
					.join('');

				cardRows.push([
					card.id,
					setIndex.get(set.id)!,
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
				]);

				const detail = toDetailRow(card);
				if (detail) details.push(detail);
			}

			details.sort((a, b) => a.localId.localeCompare(b.localId));
			if (details.length) detailsBySet.set(set.id, details);

			if (await hasPublishedArtwork(cards)) artworkPublished.add(set.id);
		} catch (error) {
			failures.push(`${set.id}: ${(error as Error).message}`);
		}

		done += 1;
		if (done % 25 === 0 || done === sets.length) {
			process.stdout.write(`  ${done}/${sets.length} sets · ${cardRows.length} cards\n`);
		}
	});

	// Stable order keeps the committed file's diffs small between rebuilds.
	cardRows.sort((a, b) => (a[0] as string).localeCompare(b[0] as string));

	const catalogue: CatalogueFile = {
		generatedAt: new Date().toISOString().slice(0, 10),
		sets: sets.map((set) => [
			set.id,
			set.name,
			set.serie?.name ?? null,
			set.abbreviation?.official ?? null,
			set.releaseDate ?? null,
			set.cardCount?.total ?? null,
			imageBases.get(set.id) ?? null,
			set.symbol ?? null,
			set.logo ?? null,
			set.legal?.standard ? 1 : 0,
			set.legal?.expanded ? 1 : 0,
			artworkPublished.has(set.id) ? 1 : 0
		]),
		cards: cardRows
	};

	const json = JSON.stringify(catalogue);
	writeFileSync(CATALOGUE_PATH, json);

	console.log(
		`\nWrote ${CATALOGUE_PATH} — ${cardRows.length} cards, ${sets.length} sets, ${(json.length / 1e6).toFixed(2)} MB.`
	);

	// Rewrite the detail directory from scratch, so sets dropped upstream do not linger.
	mkdirSync(DETAILS_DIR, { recursive: true });
	for (const existing of readdirSync(DETAILS_DIR)) {
		if (existing.endsWith('.json')) rmSync(join(DETAILS_DIR, existing));
	}

	let detailBytes = 0;
	for (const [setId, cards] of detailsBySet) {
		const payload: SetDetailFile = { setId, cards };
		const body = JSON.stringify(payload);
		detailBytes += body.length;
		writeFileSync(join(DETAILS_DIR, `${setId}.json`), body);
	}

	console.log(
		`Wrote ${detailsBySet.size} detail file(s) to ${DETAILS_DIR}/ — ${(detailBytes / 1e6).toFixed(2)} MB total.`
	);

	if (warnings.length) {
		console.warn(`\n${warnings.length} set(s) returned field errors but usable data.`);
	}

	if (failures.length) {
		console.warn(`\n${failures.length} set(s) failed:`);
		for (const failure of failures) console.warn(`  ${failure}`);
		process.exitCode = 1;
	}

	const noCode = catalogue.sets.filter((set) => !set[3]).length;
	if (noCode) {
		console.warn(
			`\n${noCode} set(s) have no PTCGL code — imports referencing them fall back to name matching.`
		);
	}

	const noArt = catalogue.sets.filter((set) => !set[11]);
	if (noArt.length) {
		console.warn(
			`\n${noArt.length} set(s) have no published card art yet: ${noArt.map((set) => set[0]).join(', ')}`
		);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
