/**
 * Google sign-in for the browser, with no backend: the Google Identity Services token
 * model hands the page a short-lived access token after the user consents in a popup.
 *
 * There is no client secret and no refresh token, and tokens last about an hour. Three
 * things keep that from meaning "sign in again every visit":
 *
 * 1. The token is kept in localStorage, so a reload or a new tab inside the hour reuses it.
 * 2. When it runs out, a hidden iframe asks Google's OAuth endpoint with `prompt=none`
 *    (the classic implicit flow). While the user is signed in to Google in this browser
 *    and third-party cookies are allowed — Chrome, Edge, Android — that returns a fresh
 *    token with no UI at all.
 * 3. Only if that fails does the GIS popup run, and then with the account as a hint, so a
 *    user with several Google accounts is not asked to pick one again.
 *
 * Safari and Firefox block the iframe route (partitioned cookies), so there the engine parks
 * in "reconnect" once an hour and the next tap on the cloud icon fixes it, as before.
 */

import { base } from '$app/paths';
import {
	parseStoredToken,
	parseTokenFragment,
	tokenUsable,
	type StoredToken
} from './google-token';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
/** Where the silent iframe lands; must be listed as an authorized redirect URI. */
export const CALLBACK_PATH = `${base}/google-callback.html`;
const TOKEN_KEY = 'cardex:google-token:v1';
const SILENT_TIMEOUT_MS = 15_000;

/** Baked in at build time from PUBLIC_GOOGLE_CLIENT_ID; empty disables sync entirely. */
export const GOOGLE_CLIENT_ID: string = __GOOGLE_CLIENT_ID__;

export const SCOPES = [
	'https://www.googleapis.com/auth/drive.file',
	'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

export const syncConfigured = () => GOOGLE_CLIENT_ID.length > 0;

type TokenResponse = {
	access_token?: string;
	expires_in?: number | string;
	error?: string;
	error_description?: string;
};

type TokenClient = {
	requestAccessToken(options?: { prompt?: '' | 'consent' | 'select_account'; hint?: string }): void;
	callback: (response: TokenResponse) => void;
	error_callback?: (error: { type: string; message?: string }) => void;
};

type Gis = {
	accounts: {
		oauth2: {
			initTokenClient(config: {
				client_id: string;
				scope: string;
				hint?: string;
				callback: (response: TokenResponse) => void;
				error_callback?: (error: { type: string; message?: string }) => void;
			}): TokenClient;
			revoke(token: string, done?: () => void): void;
		};
	};
};

declare global {
	interface Window {
		google?: Gis;
	}
}

/** Thrown when Google will not hand out a token without the user doing something. */
export class AuthError extends Error {
	constructor(
		message: string,
		/** True for popup-blocked / closed / no prior consent — a click will fix it. */
		readonly needsGesture: boolean
	) {
		super(message);
		this.name = 'AuthError';
	}
}

let gisLoading: Promise<Gis> | null = null;

/** Inject the GIS script on first use, so users who never sync never load it. */
export function loadGis(): Promise<Gis> {
	if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
	if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
	if (gisLoading) return gisLoading;

	gisLoading = new Promise<Gis>((resolve, reject) => {
		const script = document.createElement('script');
		script.src = GIS_SRC;
		script.async = true;
		script.onload = () => {
			if (window.google?.accounts?.oauth2) resolve(window.google);
			else reject(new Error('Google sign-in script loaded without the OAuth client'));
		};
		script.onerror = () => {
			gisLoading = null;
			reject(new Error('Could not load Google sign-in — are you offline?'));
		};
		document.head.append(script);
	});
	return gisLoading;
}

// ---------------------------------------------------------------------------------------
// Token storage
//
// The same localStorage the sync state and (when enabled) the WebDAV password already live
// in. A leaked token is worth an hour of access to files this app created, nothing more.

let token: StoredToken | null = null;
let client: TokenClient | null = null;
/** The Google account to prefer, so silent and popup requests skip the account chooser. */
let accountHint: string | undefined;

function readStoredToken(): StoredToken | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		return parseStoredToken(localStorage.getItem(TOKEN_KEY));
	} catch {
		return null;
	}
}

function setToken(next: StoredToken | null) {
	token = next;
	if (typeof localStorage === 'undefined') return;
	try {
		if (next) localStorage.setItem(TOKEN_KEY, JSON.stringify(next));
		else localStorage.removeItem(TOKEN_KEY);
	} catch {
		// Storage full or blocked: the in-memory copy still carries this session.
	}
}

/** Tell the sign-in which account to use; the sync state remembers the email for this. */
export function setAccountHint(email: string | null | undefined) {
	accountHint = email || undefined;
}

/** The current token if it has at least a minute left, else null. */
export function currentToken(): string | null {
	if (!tokenUsable(token)) token = readStoredToken();
	return tokenUsable(token) ? token!.value : null;
}

// ---------------------------------------------------------------------------------------
// Silent refresh through a hidden iframe

let silentInflight: Promise<string> | null = null;

/**
 * Ask Google for a token with `prompt=none`: no popup, no UI, an answer either way. Fails
 * (as an AuthError) when Google wants the user — not signed in, consent missing, cookies
 * blocked in iframes, redirect URI not registered — or when nothing comes back in time.
 */
export function refreshSilently(): Promise<string> {
	if (silentInflight) return silentInflight;
	if (typeof window === 'undefined') return Promise.reject(new AuthError('No window', true));
	if (!syncConfigured())
		return Promise.reject(new AuthError('Google sync is not configured for this build', false));

	silentInflight = new Promise<string>((resolve, reject) => {
		const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
		const params = new URLSearchParams({
			client_id: GOOGLE_CLIENT_ID,
			redirect_uri: `${location.origin}${CALLBACK_PATH}`,
			response_type: 'token',
			scope: SCOPES,
			prompt: 'none',
			state
		});
		if (accountHint) params.set('login_hint', accountHint);

		const frame = document.createElement('iframe');
		frame.hidden = true;
		frame.setAttribute('aria-hidden', 'true');
		frame.src = `${AUTH_ENDPOINT}?${params}`;

		const finish = (outcome: { token: string } | { error: string }) => {
			window.removeEventListener('message', onMessage);
			clearTimeout(timer);
			frame.remove();
			silentInflight = null;
			if ('token' in outcome) resolve(outcome.token);
			else reject(new AuthError(outcome.error, true));
		};

		const onMessage = (event: MessageEvent) => {
			if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
			const data = event.data as { type?: string; hash?: string } | null;
			if (data?.type !== 'cardex:google-token' || typeof data.hash !== 'string') return;
			const result = parseTokenFragment(data.hash);
			if (result.state !== state)
				return finish({ error: 'Sign-in response did not match the request' });
			if (!result.ok) return finish({ error: result.error });
			setToken(result.token);
			finish({ token: result.token.value });
		};

		const timer = setTimeout(
			() => finish({ error: 'Google did not answer the silent sign-in' }),
			SILENT_TIMEOUT_MS
		);
		window.addEventListener('message', onMessage);
		document.body.append(frame);
	});
	return silentInflight;
}

// ---------------------------------------------------------------------------------------
// The GIS popup

/**
 * Ask Google for an access token through the GIS popup. `prompt: ''` tries without asking
 * (works once consent exists and the user is signed in to Google in this browser);
 * `'consent'` always shows the chooser and is what the Connect button uses. Popup blockers
 * stop this unless it runs from a click, so it is the last resort of `ensureToken`.
 */
export async function requestToken(
	prompt: '' | 'consent' | 'select_account' = ''
): Promise<string> {
	if (!syncConfigured()) throw new AuthError('Google sync is not configured for this build', false);
	const gis = await loadGis();

	return new Promise<string>((resolve, reject) => {
		const callback = (response: TokenResponse) => {
			if (response.error || !response.access_token) {
				reject(
					new AuthError(
						response.error_description ?? response.error ?? 'Google did not return a token',
						true
					)
				);
				return;
			}
			const seconds = Number(response.expires_in ?? 3600);
			setToken({
				value: response.access_token,
				expiresAt: Date.now() + seconds * 1000
			});
			resolve(response.access_token);
		};
		const error_callback = (error: { type: string; message?: string }) => {
			reject(new AuthError(error.message ?? error.type, true));
		};

		if (!client) {
			client = gis.accounts.oauth2.initTokenClient({
				client_id: GOOGLE_CLIENT_ID,
				scope: SCOPES,
				hint: accountHint,
				callback,
				error_callback
			});
		} else {
			client.callback = callback;
			client.error_callback = error_callback;
		}
		// The chooser is the point of 'select_account'; every other prompt should stick to
		// the account this device already syncs with.
		client.requestAccessToken(
			prompt === 'select_account' ? { prompt } : { prompt, hint: accountHint }
		);
	});
}

/**
 * A valid token, without bothering the user if at all possible: the stored one, then a
 * silent iframe refresh, then the GIS popup (which only opens without a click when the
 * browser allows it). Throws AuthError when all three come up empty.
 */
export async function ensureToken(): Promise<string> {
	const existing = currentToken();
	if (existing) return existing;
	try {
		return await refreshSilently();
	} catch {
		return requestToken('');
	}
}

export async function fetchEmail(accessToken: string): Promise<string | null> {
	try {
		const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
			headers: { Authorization: `Bearer ${accessToken}` }
		});
		if (!response.ok) return null;
		const info = (await response.json()) as { email?: string };
		return info.email ?? null;
	} catch {
		return null;
	}
}

/** Forget the token here and tell Google to invalidate it. */
export async function revokeToken(): Promise<void> {
	const value = currentToken() ?? token?.value;
	setToken(null);
	accountHint = undefined;
	if (!value) return;
	try {
		const gis = await loadGis();
		await new Promise<void>((resolve) => gis.accounts.oauth2.revoke(value, resolve));
	} catch {
		// Offline or script blocked: the token expires on its own within the hour.
	}
}

/** Home-screen PWAs on iOS open the consent popup in Safari, where the callback cannot reach us. */
export function popupUnsupported(): boolean {
	if (typeof window === 'undefined') return false;
	const standalone =
		window.matchMedia?.('(display-mode: standalone)').matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true;
	const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
	return standalone && ios;
}
