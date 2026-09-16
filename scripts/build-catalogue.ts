/**
 * Builds `static/catalogue.json` — the whole English card catalogue as one static
 * asset, so the app needs no backend:  npm run build:catalogue
 *
 * How TCGdex is queried and how a card becomes a row both live in
 * `src/lib/tcg/tcgdex.ts`, shared with the browser-side refresh that tops this file up
 * between builds (`src/lib/catalogue-refresh.ts`).
 *
 * Rows are written as tuples rather than objects: ~21k cards come to 2 MB, which gzips
 * to about 330 KB over the wire. src/lib/catalogue.ts expands them on load.
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
import {
	fetchSet,
	fetchSetBriefs,
	fetchSetCards,
	hasPublishedArtwork,
	imageBaseOf,
	mapLimit,
	toCardRow,
	toDetailRow,
	toSetRow
} from '../src/lib/tcg/tcgdex.js';

const CONCURRENCY = 8;

async function main() {
	console.log('Fetching set list…');
	const brief = await fetchSetBriefs();

	console.log(`Fetching details for ${brief.length} sets…`);
	const allSets = await mapLimit(brief, CONCURRENCY, (set) => fetchSet(set.id));

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

			const base = imageBaseOf(cards);
			if (base) imageBases.set(set.id, base);

			const details: CardDetailRow[] = [];
			for (const card of cards) {
				cardRows.push(toCardRow(card, setIndex.get(set.id)!));
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
		sets: sets.map((set) =>
			toSetRow(set, {
				imageBase: imageBases.get(set.id) ?? null,
				artworkPublished: artworkPublished.has(set.id)
			})
		),
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
