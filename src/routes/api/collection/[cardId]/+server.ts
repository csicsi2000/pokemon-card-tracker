import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Owned quantities for one printing, keyed by variant. */
export const GET: RequestHandler = async ({ params, locals: { supabase, user } }) => {
	if (!user) error(401, 'Not signed in');

	const { data, error: queryError } = await supabase
		.from('collection_items')
		.select('variant, quantity')
		.eq('card_id', params.cardId);

	if (queryError) error(500, queryError.message);

	return json(Object.fromEntries((data ?? []).map((row) => [row.variant, row.quantity])));
};
