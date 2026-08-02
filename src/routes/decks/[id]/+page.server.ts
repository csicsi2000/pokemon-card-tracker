import { error, fail } from '@sveltejs/kit';
import { CARD_SELECT } from '$lib/tcg/queries';
import { checkLegality, type DeckEntry } from '$lib/tcg/legality';
import { parseRules } from '$lib/tcg/format-rules';
import { buildBuylist } from '$lib/tcg/buylist';
import { toPtcglText } from '$lib/tcg/exporter';
import type { CardWithSet } from '$lib/database.types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const { data: deck } = await supabase
		.from('decks')
		.select('id, name, description, format_id, format:formats(id, name, rules)')
		.eq('id', params.id)
		.maybeSingle();

	if (!deck) error(404, 'Deck not found');

	const { data: deckCards } = await supabase
		.from('deck_cards')
		.select(`quantity, card:cards(${CARD_SELECT})`)
		.eq('deck_id', params.id);

	const entries: DeckEntry[] = ((deckCards ?? []) as unknown as {
		quantity: number;
		card: CardWithSet | null;
	}[])
		.filter((row): row is { quantity: number; card: CardWithSet } => !!row.card)
		.map((row) => ({ card: row.card, quantity: row.quantity }))
		.sort(
			(a, b) =>
				a.card.supertype.localeCompare(b.card.supertype) || a.card.name.localeCompare(b.card.name)
		);

	// Ownership is per name, so fetch every printing of the names this deck uses.
	const names = [...new Set(entries.map((entry) => entry.card.name_normalized))];
	const { data: ownedRows } = names.length
		? await supabase
				.from('collection_items')
				.select('card_id, quantity, card:cards!inner(name, name_normalized)')
				.in('card.name_normalized', names)
		: { data: [] };

	const owned = ((ownedRows ?? []) as unknown as {
		card_id: string;
		quantity: number;
		card: { name: string };
	}[]).map((row) => ({ card_id: row.card_id, quantity: row.quantity, name: row.card.name }));

	const format = (deck as unknown as { format: { id: string; name: string; rules: unknown } | null })
		.format;
	const rules = parseRules(format?.rules);

	let poolCardIds: Set<string> | undefined;
	if (rules.pool.type === 'explicit' && format) {
		const { data: pool } = await supabase
			.from('format_cards')
			.select('card_id')
			.eq('format_id', format.id);
		poolCardIds = new Set((pool ?? []).map((row) => row.card_id));
	}

	const { data: formats } = await supabase.from('formats').select('id, name').order('name');

	return {
		deck: { id: deck.id, name: deck.name, description: deck.description, format },
		entries,
		formats: formats ?? [],
		legality: format ? checkLegality(entries, rules, poolCardIds) : null,
		buylist: buildBuylist(entries, owned),
		ptcgl: toPtcglText(entries)
	};
};

export const actions: Actions = {
	setQuantity: async ({ request, params, locals: { supabase } }) => {
		const form = await request.formData();
		const cardId = String(form.get('cardId') ?? '');
		const quantity = Number(form.get('quantity') ?? 0);

		if (quantity <= 0) {
			const { error: deleteError } = await supabase
				.from('deck_cards')
				.delete()
				.eq('deck_id', params.id)
				.eq('card_id', cardId);
			if (deleteError) return fail(500, { message: deleteError.message });
			return { ok: true };
		}

		const { error: upsertError } = await supabase
			.from('deck_cards')
			.upsert({ deck_id: params.id, card_id: cardId, quantity }, { onConflict: 'deck_id,card_id' });
		if (upsertError) return fail(500, { message: upsertError.message });
		return { ok: true };
	},

	update: async ({ request, params, locals: { supabase } }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const formatId = String(form.get('formatId') ?? '') || null;

		const { error: updateError } = await supabase
			.from('decks')
			.update({ name, format_id: formatId })
			.eq('id', params.id);

		if (updateError) return fail(500, { message: updateError.message });
		return { ok: true };
	}
};
