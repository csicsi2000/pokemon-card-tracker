import { fail, redirect } from '@sveltejs/kit';
import { parseDecklist } from '$lib/tcg/parser';
import { resolveEntries, type ResolvedEntry } from '$lib/tcg/resolver';
import type { CardWithSet } from '$lib/database.types';
import type { Actions, PageServerLoad } from './$types';

/** What the review table needs — the full card rows are too heavy to ship twice. */
export type ReviewRow = {
	quantity: number;
	rawName: string;
	setCode: string | null;
	number: string | null;
	match: ResolvedEntry['match'];
	note?: string;
	card: CardWithSet | null;
	alternatives: { id: string; label: string }[];
};

const toReviewRow = (resolved: ResolvedEntry): ReviewRow => ({
	quantity: resolved.entry.quantity,
	rawName: resolved.entry.name,
	setCode: resolved.entry.setCode,
	number: resolved.entry.number,
	match: resolved.match,
	note: resolved.note,
	card: resolved.card,
	alternatives: resolved.alternatives.map((card) => ({
		id: card.id,
		label: `${card.set?.ptcgl_code ?? card.set_id} #${card.local_id} — ${card.set?.name ?? ''}`
	}))
});

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const { data: decks } = await supabase.from('decks').select('id, name').order('name');
	return { decks: decks ?? [] };
};

export const actions: Actions = {
	/** Step 1: parse + resolve. Nothing is written yet — the user reviews first. */
	preview: async ({ request, locals: { supabase } }) => {
		const form = await request.formData();
		const text = String(form.get('text') ?? '');
		if (!text.trim()) return fail(400, { message: 'Paste a decklist first.' });

		const parsed = parseDecklist(text);
		if (parsed.entries.length === 0) {
			return fail(400, { message: 'No card lines found.', warnings: parsed.warnings });
		}

		const resolved = await resolveEntries(supabase, parsed.entries);

		return {
			text,
			warnings: parsed.warnings,
			declaredTotal: parsed.declaredTotal,
			total: parsed.total,
			rows: resolved.map(toReviewRow)
		};
	},

	/** Step 2: commit the reviewed rows to the collection or to a new/existing deck. */
	commit: async ({ request, locals: { supabase, user } }) => {
		if (!user) return fail(401, { message: 'Not signed in.' });

		const form = await request.formData();
		const target = String(form.get('target') ?? 'collection');
		const deckName = String(form.get('deckName') ?? '').trim();
		const deckId = String(form.get('deckId') ?? '');
		const mode = String(form.get('mode') ?? 'add');

		const rows = form
			.getAll('row')
			.map((value) => JSON.parse(String(value)) as { cardId: string; quantity: number; variant?: string })
			.filter((row) => row.cardId && row.quantity > 0);

		if (rows.length === 0) return fail(400, { message: 'Nothing to import.' });

		// Merge duplicate lines for the same printing before writing.
		const merged = new Map<string, { cardId: string; quantity: number; variant: string }>();
		for (const row of rows) {
			const variant = row.variant ?? 'normal';
			const key = `${row.cardId}|${variant}`;
			const existing = merged.get(key);
			if (existing) existing.quantity += row.quantity;
			else merged.set(key, { cardId: row.cardId, quantity: row.quantity, variant });
		}

		if (target === 'collection') {
			const existing = new Map<string, number>();
			if (mode === 'add') {
				const { data } = await supabase
					.from('collection_items')
					.select('card_id, variant, quantity')
					.in('card_id', [...merged.values()].map((row) => row.cardId));
				for (const row of data ?? []) existing.set(`${row.card_id}|${row.variant}`, row.quantity);
			}

			const payload = [...merged.entries()].map(([key, row]) => ({
				user_id: user.id,
				card_id: row.cardId,
				variant: row.variant,
				quantity: row.quantity + (existing.get(key) ?? 0)
			}));

			const { error } = await supabase
				.from('collection_items')
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.upsert(payload as any, { onConflict: 'user_id,card_id,variant' });
			if (error) return fail(500, { message: error.message });

			redirect(303, '/collection');
		}

		// Deck target: reuse the selected deck or create one.
		let targetDeckId = deckId;
		if (!targetDeckId) {
			const { data, error } = await supabase
				.from('decks')
				.insert({ user_id: user.id, name: deckName || 'Imported deck' })
				.select('id')
				.single();
			if (error || !data) return fail(500, { message: error?.message ?? 'Could not create deck.' });
			targetDeckId = data.id;
		}

		const existingDeckCards = new Map<string, number>();
		if (deckId && mode === 'add') {
			const { data } = await supabase
				.from('deck_cards')
				.select('card_id, quantity')
				.eq('deck_id', targetDeckId);
			for (const row of data ?? []) existingDeckCards.set(row.card_id, row.quantity);
		} else if (deckId) {
			await supabase.from('deck_cards').delete().eq('deck_id', targetDeckId);
		}

		const deckRows = [...merged.values()].map((row) => ({
			deck_id: targetDeckId,
			card_id: row.cardId,
			quantity: row.quantity + (existingDeckCards.get(row.cardId) ?? 0)
		}));

		const { error } = await supabase
			.from('deck_cards')
			.upsert(deckRows, { onConflict: 'deck_id,card_id' });
		if (error) return fail(500, { message: error.message });

		redirect(303, `/decks/${targetDeckId}`);
	}
};
