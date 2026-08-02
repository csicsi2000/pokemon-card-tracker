import { CARD_SELECT } from '$lib/tcg/queries';
import { normalizeName } from '$lib/tcg/normalize';
import type { CardWithSet } from '$lib/database.types';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 60;

export const load: PageServerLoad = async ({ url, locals: { supabase, user } }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	const setId = url.searchParams.get('set') ?? '';
	const supertype = url.searchParams.get('type') ?? '';
	const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));

	let query = supabase
		.from('cards')
		.select(CARD_SELECT, { count: 'estimated' })
		.order('set_id', { ascending: false })
		.order('local_id', { ascending: true })
		.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

	if (q) query = query.ilike('name_normalized', `%${normalizeName(q)}%`);
	if (setId) query = query.eq('set_id', setId);
	if (supertype) query = query.eq('supertype', supertype);

	const [{ data: cards, count }, { data: sets }] = await Promise.all([
		query,
		supabase
			.from('sets')
			.select('id, name, ptcgl_code, release_date')
			.order('release_date', { ascending: false })
	]);

	// How many of each visible card the user already owns, across variants.
	const ids = (cards ?? []).map((card) => card.id);
	const owned = new Map<string, number>();
	if (user && ids.length) {
		const { data } = await supabase
			.from('collection_items')
			.select('card_id, quantity')
			.in('card_id', ids);
		for (const row of data ?? []) owned.set(row.card_id, (owned.get(row.card_id) ?? 0) + row.quantity);
	}

	return {
		cards: (cards ?? []) as unknown as CardWithSet[],
		sets: sets ?? [],
		owned: Object.fromEntries(owned),
		total: count ?? 0,
		page,
		pageSize: PAGE_SIZE,
		filters: { q, setId, supertype }
	};
};
