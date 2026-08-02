import { error, text } from '@sveltejs/kit';
import { AI_PREAMBLE, toAiEntries } from '$lib/tcg/exporter';
import { CARD_SELECT } from '$lib/tcg/queries';
import type { CardVariant, CardWithSet } from '$lib/database.types';
import type { RequestHandler } from './$types';

/**
 * The whole collection as compact JSON with a preamble, ready to paste into a chat.
 * `?format=json` returns the bare array for programmatic use.
 */
export const GET: RequestHandler = async ({ url, locals: { supabase, user } }) => {
	if (!user) error(401, 'Not signed in');

	const { data, error: queryError } = await supabase
		.from('collection_items')
		.select(`variant, quantity, card:cards(${CARD_SELECT})`);

	if (queryError) error(500, queryError.message);

	type Joined = { variant: CardVariant; quantity: number; card: CardWithSet | null };
	const entries = toAiEntries(
		((data ?? []) as unknown as Joined[])
			.filter((row): row is Joined & { card: CardWithSet } => !!row.card)
			.map((row) => ({ quantity: row.quantity, card: row.card, variant: row.variant }))
	);

	const payload = { kind: 'collection', count: entries.length, entries };

	if (url.searchParams.get('format') === 'json') {
		return new Response(JSON.stringify(payload, null, 2), {
			headers: { 'content-type': 'application/json' }
		});
	}

	return text(`${AI_PREAMBLE}\n${JSON.stringify(payload)}`);
};
