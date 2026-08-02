import { CARD_SELECT } from '$lib/tcg/queries';
import { normalizeName } from '$lib/tcg/normalize';
import type { CardVariant, CardWithSet } from '$lib/database.types';
import type { PageServerLoad } from './$types';

export type CollectionRow = {
	card: CardWithSet;
	variants: Partial<Record<CardVariant, number>>;
	total: number;
};

export const load: PageServerLoad = async ({ url, locals: { supabase } }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	const setId = url.searchParams.get('set') ?? '';

	const { data: items } = await supabase
		.from('collection_items')
		.select(`variant, quantity, card:cards(${CARD_SELECT})`)
		.order('card_id');

	type Joined = { variant: CardVariant; quantity: number; card: CardWithSet | null };

	// Fold the per-variant rows into one row per printing.
	const byCard = new Map<string, CollectionRow>();
	for (const item of (items ?? []) as unknown as Joined[]) {
		if (!item.card) continue;
		const existing = byCard.get(item.card.id);
		if (existing) {
			existing.variants[item.variant] = item.quantity;
			existing.total += item.quantity;
		} else {
			byCard.set(item.card.id, {
				card: item.card,
				variants: { [item.variant]: item.quantity },
				total: item.quantity
			});
		}
	}

	let rows = [...byCard.values()];

	if (q) {
		const needle = normalizeName(q);
		rows = rows.filter((row) => row.card.name_normalized.includes(needle));
	}
	if (setId) rows = rows.filter((row) => row.card.set_id === setId);

	rows.sort((a, b) => a.card.name.localeCompare(b.card.name));

	const setsInCollection = [...new Set([...byCard.values()].map((row) => row.card.set_id))];
	const { data: sets } = await supabase
		.from('sets')
		.select('id, name, ptcgl_code, release_date')
		.in('id', setsInCollection.length ? setsInCollection : ['__none__'])
		.order('release_date', { ascending: false });

	return {
		rows,
		sets: sets ?? [],
		filters: { q, setId },
		stats: {
			distinctPrintings: byCard.size,
			totalCards: [...byCard.values()].reduce((sum, row) => sum + row.total, 0),
			distinctNames: new Set([...byCard.values()].map((row) => row.card.name_normalized)).size,
			setCount: setsInCollection.length
		}
	};
};
