import { fail, redirect } from '@sveltejs/kit';
import { RULE_PRESETS, parseRules } from '$lib/tcg/format-rules';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const { data } = await supabase
		.from('formats')
		.select('id, name, description, rules, cards:format_cards(card_id)')
		.order('name');

	type Joined = {
		id: string;
		name: string;
		description: string | null;
		rules: unknown;
		cards: { card_id: string }[];
	};

	return {
		formats: ((data ?? []) as unknown as Joined[]).map((format) => ({
			id: format.id,
			name: format.name,
			description: format.description,
			rules: parseRules(format.rules),
			poolSize: format.cards.length
		})),
		presets: RULE_PRESETS
	};
};

export const actions: Actions = {
	create: async ({ request, locals: { supabase, user } }) => {
		if (!user) return fail(401, { message: 'Not signed in.' });

		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const presetId = String(form.get('preset') ?? 'open');
		if (!name) return fail(400, { message: 'Give the format a name.' });

		const preset = RULE_PRESETS.find((p) => p.id === presetId) ?? RULE_PRESETS.at(-1)!;

		const { data, error } = await supabase
			.from('formats')
			.insert({ user_id: user.id, name, description: preset.description, rules: preset.rules })
			.select('id')
			.single();

		if (error || !data) return fail(500, { message: error?.message ?? 'Could not create format.' });
		redirect(303, `/formats/${data.id}`);
	},

	delete: async ({ request, locals: { supabase } }) => {
		const form = await request.formData();
		const { error } = await supabase.from('formats').delete().eq('id', String(form.get('id') ?? ''));
		if (error) return fail(500, { message: error.message });
		return { deleted: true };
	}
};
