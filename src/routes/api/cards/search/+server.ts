import { error, json } from '@sveltejs/kit';
import { CARD_SELECT } from '$lib/tcg/queries';
import { normalizeName } from '$lib/tcg/normalize';
import type { CardWithSet } from '$lib/database.types';
import type { RequestHandler } from './$types';

/** Typeahead search used by the deck builder and format pool editor. */
export const GET: RequestHandler = async ({ url, locals: { supabase, user } }) => {
	if (!user) error(401, 'Not signed in');

	const q = url.searchParams.get('q')?.trim() ?? '';
	if (q.length < 2) return json([]);

	const { data, error: queryError } = await supabase
		.from('cards')
		.select(CARD_SELECT)
		.ilike('name_normalized', `%${normalizeName(q)}%`)
		.order('set_id', { ascending: false })
		.limit(40);

	if (queryError) error(500, queryError.message);

	return json((data ?? []) as unknown as CardWithSet[]);
};
