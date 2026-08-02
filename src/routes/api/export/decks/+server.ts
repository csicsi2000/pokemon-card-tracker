import { error, text } from '@sveltejs/kit';
import { AI_PREAMBLE, toAiEntries } from '$lib/tcg/exporter';
import { CARD_SELECT } from '$lib/tcg/queries';
import type { CardWithSet } from '$lib/database.types';
import type { RequestHandler } from './$types';

/** Every deck with its cards, for "compare these decks" style questions. */
export const GET: RequestHandler = async ({ url, locals: { supabase, user } }) => {
	if (!user) error(401, 'Not signed in');

	const { data, error: queryError } = await supabase
		.from('decks')
		.select(`id, name, description, format:formats(name, rules), cards:deck_cards(quantity, card:cards(${CARD_SELECT}))`)
		.order('name');

	if (queryError) error(500, queryError.message);

	type Joined = {
		id: string;
		name: string;
		description: string | null;
		format: { name: string; rules: unknown } | null;
		cards: { quantity: number; card: CardWithSet | null }[];
	};

	const decks = ((data ?? []) as unknown as Joined[]).map((deck) => ({
		name: deck.name,
		description: deck.description,
		format: deck.format?.name ?? null,
		cards: toAiEntries(
			deck.cards
				.filter((row): row is { quantity: number; card: CardWithSet } => !!row.card)
				.map((row) => ({ quantity: row.quantity, card: row.card }))
		)
	}));

	const payload = { kind: 'decks', count: decks.length, decks };

	if (url.searchParams.get('format') === 'json') {
		return new Response(JSON.stringify(payload, null, 2), {
			headers: { 'content-type': 'application/json' }
		});
	}

	return text(`${AI_PREAMBLE}\n${JSON.stringify(payload)}`);
};
