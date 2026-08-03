import { loadCatalogue } from '$lib/catalogue';
import { store } from '$lib/store.svelte';
import type { LayoutLoad } from './$types';

// Everything lives in the browser: the catalogue is a static file and user data is in
// localStorage. Prerender the shell, render the pages on the client.
export const ssr = false;
export const prerender = true;
export const trailingSlash = 'always';

export const load: LayoutLoad = async ({ fetch }) => {
	store.load();
	return { catalogue: await loadCatalogue(fetch) };
};
