import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const [{ data: decks }, { data: formats }] = await Promise.all([
		supabase
			.from('decks')
			.select('id, name, description, updated_at, format:formats(id, name), cards:deck_cards(quantity)')
			.order('updated_at', { ascending: false }),
		supabase.from('formats').select('id, name').order('name')
	]);

	type Joined = {
		id: string;
		name: string;
		description: string | null;
		updated_at: string;
		format: { id: string; name: string } | null;
		cards: { quantity: number }[];
	};

	return {
		decks: ((decks ?? []) as unknown as Joined[]).map((deck) => ({
			id: deck.id,
			name: deck.name,
			description: deck.description,
			updatedAt: deck.updated_at,
			format: deck.format,
			cardCount: deck.cards.reduce((sum, row) => sum + row.quantity, 0)
		})),
		formats: formats ?? []
	};
};

export const actions: Actions = {
	create: async ({ request, locals: { supabase, user } }) => {
		if (!user) return fail(401, { message: 'Not signed in.' });

		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const formatId = String(form.get('formatId') ?? '') || null;
		if (!name) return fail(400, { message: 'Give the deck a name.' });

		const { data, error } = await supabase
			.from('decks')
			.insert({ user_id: user.id, name, format_id: formatId })
			.select('id')
			.single();

		if (error || !data) return fail(500, { message: error?.message ?? 'Could not create the deck.' });
		redirect(303, `/decks/${data.id}`);
	},

	delete: async ({ request, locals: { supabase } }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const { error } = await supabase.from('decks').delete().eq('id', id);
		if (error) return fail(500, { message: error.message });
		return { deleted: true };
	}
};
