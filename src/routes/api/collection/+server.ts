import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const payloadSchema = z.object({
	cardId: z.string().min(1),
	variant: z.enum(['normal', 'reverse', 'holo', 'firstEdition', 'promo']).default('normal'),
	/** Absolute quantity to store. 0 removes the row. */
	quantity: z.number().int().min(0).max(9999)
});

/** Set the owned quantity of one printing+variant. Used by every quick-add control. */
export const POST: RequestHandler = async ({ request, locals: { supabase, user } }) => {
	if (!user) error(401, 'Not signed in');

	const parsed = payloadSchema.safeParse(await request.json());
	if (!parsed.success) error(400, 'Invalid payload');

	const { cardId, variant, quantity } = parsed.data;

	if (quantity === 0) {
		const { error: deleteError } = await supabase
			.from('collection_items')
			.delete()
			.eq('card_id', cardId)
			.eq('variant', variant);
		if (deleteError) error(500, deleteError.message);
		return json({ cardId, variant, quantity: 0 });
	}

	const { error: upsertError } = await supabase
		.from('collection_items')
		.upsert(
			{ user_id: user.id, card_id: cardId, variant, quantity },
			{ onConflict: 'user_id,card_id,variant' }
		);
	if (upsertError) error(500, upsertError.message);

	return json({ cardId, variant, quantity });
};
