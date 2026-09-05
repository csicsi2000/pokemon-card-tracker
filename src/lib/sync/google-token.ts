/**
 * The browser-free parts of Google sign-in: what a stored token looks like and how the
 * OAuth redirect fragment is read. Kept apart from google-auth.ts so they can be unit
 * tested without a window.
 */

export type StoredToken = {
	value: string;
	/** Epoch milliseconds. */
	expiresAt: number;
};

/** Do not hand out a token with less than this left: a sync can take a few seconds. */
export const TOKEN_MARGIN_MS = 60_000;

export const tokenUsable = (token: StoredToken | null, now = Date.now()): boolean =>
	!!token &&
	typeof token.value === 'string' &&
	token.value.length > 0 &&
	token.expiresAt - now > TOKEN_MARGIN_MS;

/** Parse a token record read back from storage; anything malformed or expired is null. */
export function parseStoredToken(raw: string | null, now = Date.now()): StoredToken | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<StoredToken>;
		const token = {
			value: String(parsed.value ?? ''),
			expiresAt: Number(parsed.expiresAt)
		};
		return tokenUsable(token, now) ? token : null;
	} catch {
		return null;
	}
}

export type FragmentResult =
	| { ok: true; token: StoredToken; state: string | null }
	| { ok: false; error: string; state: string | null };

/**
 * Read the `#access_token=…&expires_in=…` fragment Google's implicit flow redirects to.
 * `error=…` comes back the same way — `interaction_required` / `login_required` are the
 * usual ones when a silent (`prompt=none`) request cannot proceed without the user.
 */
export function parseTokenFragment(hash: string, now = Date.now()): FragmentResult {
	const params = new URLSearchParams(hash.replace(/^#/, ''));
	const state = params.get('state');
	const error = params.get('error');
	if (error)
		return {
			ok: false,
			error: params.get('error_description') ?? error,
			state
		};
	const value = params.get('access_token');
	if (!value) return { ok: false, error: 'Google did not return a token', state };
	const seconds = Number(params.get('expires_in') ?? 3600);
	const expiresAt = now + (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000;
	return { ok: true, token: { value, expiresAt }, state };
}
