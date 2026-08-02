import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	login: async ({ request, locals: { supabase }, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '');
		const password = String(form.get('password') ?? '');

		const { error } = await supabase.auth.signInWithPassword({ email, password });
		if (error) return fail(400, { email, message: error.message });

		redirect(303, url.searchParams.get('redirectTo') || '/');
	},

	signup: async ({ request, locals: { supabase } }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '');
		const password = String(form.get('password') ?? '');

		const { error } = await supabase.auth.signUp({ email, password });
		if (error) return fail(400, { email, message: error.message });

		// Email confirmation is disabled on this project, so signUp returns an active session.
		redirect(303, '/');
	},

	logout: async ({ locals: { supabase } }) => {
		await supabase.auth.signOut();
		redirect(303, '/login');
	}
};
