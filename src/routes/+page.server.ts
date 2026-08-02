import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const [collection, decks, formats, cards] = await Promise.all([
		supabase.from('collection_items').select('card_id, quantity'),
		supabase
			.from('decks')
			.select('id, name, updated_at, cards:deck_cards(quantity)')
			.order('updated_at', { ascending: false })
			.limit(5),
		supabase.from('formats').select('id, name').order('name'),
		supabase.from('cards').select('id', { count: 'estimated', head: true })
	]);

	type DeckRow = { id: string; name: string; updated_at: string; cards: { quantity: number }[] };

	return {
		stats: {
			owned: (collection.data ?? []).reduce((sum, row) => sum + row.quantity, 0),
			printings: new Set((collection.data ?? []).map((row) => row.card_id)).size,
			decks: decks.data?.length ?? 0,
			formats: formats.data?.length ?? 0,
			catalogue: cards.count ?? 0
		},
		recentDecks: ((decks.data ?? []) as unknown as DeckRow[]).map((deck) => ({
			id: deck.id,
			name: deck.name,
			cardCount: deck.cards.reduce((sum, row) => sum + row.quantity, 0)
		})),
		formats: formats.data ?? []
	};
};
