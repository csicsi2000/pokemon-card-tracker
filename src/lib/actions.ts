import { invalidateAll } from '$app/navigation';
import { deserialize } from '$app/forms';
import type { ActionResult } from '@sveltejs/kit';

/**
 * Calls a form action from JS (a click, not a form submit) and refreshes the page data.
 *
 * The `x-sveltekit-action` header makes SvelteKit answer with a serialised
 * ActionResult instead of a redirect, which is what lets us surface the server's own
 * error message rather than a generic failure.
 *
 * @throws with the server's message when the action fails
 */
export async function runAction(action: string, fields: Record<string, string | number>) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, String(value));

	const response = await fetch(action, {
		method: 'POST',
		body,
		headers: { 'x-sveltekit-action': 'true' }
	});

	const result: ActionResult = deserialize(await response.text());

	if (result.type === 'failure') {
		throw new Error((result.data?.message as string) ?? 'That did not work.');
	}
	if (result.type === 'error') {
		throw new Error(result.error?.message ?? 'That did not work.');
	}

	await invalidateAll();
	return result;
}
