/**
 * Smoke test for the data layer:  npm run check:db
 *
 * Runs every PostgREST select string the app uses. Embedded-resource syntax
 * (`card:cards!inner(...)`, filters like `.in('card.name_normalized', …)`) fails at
 * runtime rather than at compile time, so this catches typos the type checker can't.
 *
 * Uses the service-role key, so it validates query SHAPE only — not RLS policies.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { CARD_SELECT } from '../src/lib/tcg/queries.js';
import { parseDecklist } from '../src/lib/tcg/parser.js';
import { resolveEntries } from '../src/lib/tcg/resolver.js';

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
	auth: { persistSession: false }
});

let failures = 0;

async function check(label: string, run: () => PromiseLike<{ error: unknown; data?: unknown }>) {
	const { error, data } = await run();
	if (error) {
		failures += 1;
		console.error(`FAIL ${label}: ${JSON.stringify(error)}`);
	} else {
		const rows = Array.isArray(data) ? data.length : data ? 1 : 0;
		console.log(`ok   ${label} (${rows} rows)`);
	}
}

await check('cards page', () =>
	supabase
		.from('cards')
		.select(CARD_SELECT, { count: 'estimated' })
		.order('set_id', { ascending: false })
		.order('local_id', { ascending: true })
		.range(0, 5)
);

await check('card search', () =>
	supabase.from('cards').select(CARD_SELECT).ilike('name_normalized', '%charizard%').limit(3)
);

await check('collection', () =>
	supabase.from('collection_items').select(`variant, quantity, card:cards(${CARD_SELECT})`).limit(2)
);

await check('owned-by-name lookup', () =>
	supabase
		.from('collection_items')
		.select('card_id, quantity, card:cards!inner(name, name_normalized)')
		.in('card.name_normalized', ['charizard ex', 'iono'])
		.limit(5)
);

await check('decks list', () =>
	supabase
		.from('decks')
		.select('id, name, description, updated_at, format:formats(id, name), cards:deck_cards(quantity)')
		.limit(2)
);

await check('deck detail', () =>
	supabase.from('deck_cards').select(`quantity, card:cards(${CARD_SELECT})`).limit(2)
);

await check('decks export', () =>
	supabase
		.from('decks')
		.select(
			`id, name, description, format:formats(name, rules), cards:deck_cards(quantity, card:cards(${CARD_SELECT}))`
		)
		.limit(2)
);

await check('formats list', () =>
	supabase.from('formats').select('id, name, description, rules, cards:format_cards(card_id)').limit(2)
);

await check('format pool', () =>
	supabase.from('format_cards').select(`quantity, card:cards(${CARD_SELECT})`).limit(2)
);

// The import pipeline against real data — the part most likely to quietly mis-match.
const SAMPLE = `Pokémon: 2
1 Charizard null 1
2 Charmander PR-SW 92

Trainer: 1
4 Iono PAL 185

Energy: 1
8 Basic {R} Energy SVE 2

Total Cards: 15`;

const parsed = parseDecklist(SAMPLE);
const resolved = await resolveEntries(supabase, parsed.entries);

console.log('\nImport pipeline:');
for (const row of resolved) {
	const card = row.card;
	const target = card ? `${card.name} — ${card.set?.ptcgl_code ?? card.set_id} #${card.local_id}` : '—';
	console.log(`  [${row.match.padEnd(12)}] ${row.entry.raw.padEnd(30)} → ${target}`);
	if (row.note) console.log(`                 note: ${row.note}`);
	if (!row.card) failures += 1;
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks OK.');
process.exit(failures ? 1 : 0);
