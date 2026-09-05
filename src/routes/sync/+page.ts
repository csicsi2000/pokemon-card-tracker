import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import type { PageLoad } from './$types';

/** The sync settings moved onto the Settings page; keep old bookmarks working. */
export const load: PageLoad = () => {
	redirect(307, `${base}/settings/`);
};
