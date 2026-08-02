import type { CardVariant } from '$lib/database.types';

/** Writes an absolute owned quantity for one printing+variant. Throws on failure. */
export async function setCollectionQuantity(
	cardId: string,
	variant: CardVariant,
	quantity: number
) {
	const response = await fetch('/api/collection', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ cardId, variant, quantity })
	});

	if (!response.ok) {
		throw new Error((await response.text()) || 'Could not update your collection');
	}

	return (await response.json()) as { cardId: string; variant: CardVariant; quantity: number };
}
