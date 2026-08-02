import { error, fail } from '@sveltejs/kit';
import { CARD_SELECT } from '$lib/tcg/queries';
import { formatRulesSchema, parseRules } from '$lib/tcg/format-rules';
import { buildBuylist } from '$lib/tcg/buylist';
import { parseDecklist } from '$lib/tcg/parser';
import { resolveEntries } from '$lib/tcg/resolver';
import type { CardWithSet } from '$lib/database.types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const { data: format } = await supabase
		.from('formats')
		.select('id, name, description, rules')
		.eq('id', params.id)
		.maybeSingle();

	if (!format) error(404, 'Format not found');

	const { data: poolRows } = await supabase
		.from('format_cards')
		.select(`quantity, card:cards(${CARD_SELECT})`)
		.eq('format_id', params.id);

	const pool = ((poolRows ?? []) as unknown as { quantity: number | null; card: CardWithSet | null }[])
		.filter((row): row is { quantity: number | null; card: CardWithSet } => !!row.card)
		.map((row) => ({ card: row.card, quantity: row.quantity ?? 1 }))
		.sort((a, b) => a.card.name.localeCompare(b.card.name));

	// "What do I need to buy to play this Cube?" — pool requirement minus what's owned.
	const names = [...new Set(pool.map((row) => row.card.name_normalized))];
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

	const { data: sets } = await supabase
		.from('sets')
		.select('id, name, ptcgl_code, release_date')
		.order('release_date', { ascending: false });

	return {
		format: { id: format.id, name: format.name, description: format.description },
		rules: parseRules(format.rules),
		pool,
		sets: sets ?? [],
		buylist: buildBuylist(pool, owned)
	};
};

export const actions: Actions = {
	saveRules: async ({ request, params, locals: { supabase } }) => {
		const form = await request.formData();

		const parsed = formatRulesSchema.safeParse({
			deckSize: {
				min: Number(form.get('deckMin') ?? 60),
				max: Number(form.get('deckMax') ?? 60)
			},
			maxCopiesPerName: Number(form.get('maxCopies') ?? 4),
			basicEnergyExempt: form.get('basicEnergyExempt') === 'on',
			singleton: form.get('singleton') === 'on',
			pool: {
				type: String(form.get('poolType') ?? 'all'),
				setIds: String(form.get('poolSetIds') ?? '')
					.split(',')
					.map((id) => id.trim())
					.filter(Boolean)
			},
			bannedNames: String(form.get('bannedNames') ?? '')
				.split('\n')
				.map((line) => line.trim())
				.filter(Boolean)
		});

		if (!parsed.success) return fail(400, { message: 'Those rules do not make sense.' });

		const { error: updateError } = await supabase
			.from('formats')
			.update({ name: String(form.get('name') ?? '').trim() || 'Format', rules: parsed.data })
			.eq('id', params.id);

		if (updateError) return fail(500, { message: updateError.message });
		return { ok: true };
	},

	addCard: async ({ request, params, locals: { supabase } }) => {
		const form = await request.formData();
		const cardId = String(form.get('cardId') ?? '');
		const quantity = Number(form.get('quantity') ?? 1);

		const { error: upsertError } = await supabase
			.from('format_cards')
			.upsert({ format_id: params.id, card_id: cardId, quantity }, { onConflict: 'format_id,card_id' });

		if (upsertError) return fail(500, { message: upsertError.message });
		return { ok: true };
	},

	removeCard: async ({ request, params, locals: { supabase } }) => {
		const form = await request.formData();
		const { error: deleteError } = await supabase
			.from('format_cards')
			.delete()
			.eq('format_id', params.id)
			.eq('card_id', String(form.get('cardId') ?? ''));

		if (deleteError) return fail(500, { message: deleteError.message });
		return { ok: true };
	},

	/** Bulk-fill a Cube pool from a pasted PTCGL list. */
	importPool: async ({ request, params, locals: { supabase } }) => {
		const form = await request.formData();
		const text = String(form.get('text') ?? '');
		if (!text.trim()) return fail(400, { message: 'Paste a list first.' });

		const parsed = parseDecklist(text);
		const resolved = await resolveEntries(supabase, parsed.entries);
		const rows = resolved
			.filter((row) => row.card)
			.map((row) => ({
				format_id: params.id,
				card_id: row.card!.id,
				quantity: row.entry.quantity
			}));

		if (rows.length === 0) return fail(400, { message: 'Nothing in that list could be matched.' });

		const { error: upsertError } = await supabase
			.from('format_cards')
			.upsert(rows, { onConflict: 'format_id,card_id' });

		if (upsertError) return fail(500, { message: upsertError.message });

		const unmatched = resolved.length - rows.length;
		return { ok: true, added: rows.length, unmatched };
	},

	/** Seed the pool from everything the user already owns. */
	importFromCollection: async ({ params, locals: { supabase } }) => {
		const { data: items } = await supabase.from('collection_items').select('card_id, quantity');
		if (!items?.length) return fail(400, { message: 'Your collection is empty.' });

		const merged = new Map<string, number>();
		for (const item of items) {
			merged.set(item.card_id, (merged.get(item.card_id) ?? 0) + item.quantity);
		}

		const rows = [...merged].map(([card_id, quantity]) => ({
			format_id: params.id,
			card_id,
			quantity
		}));

		const { error: upsertError } = await supabase
			.from('format_cards')
			.upsert(rows, { onConflict: 'format_id,card_id' });

		if (upsertError) return fail(500, { message: upsertError.message });
		return { ok: true, added: rows.length };
	}
};
