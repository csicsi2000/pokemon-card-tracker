/**
 * Google sign-in for the browser, with no backend: the Google Identity Services token
 * model hands the page a short-lived access token after the user consents in a popup.
 *
 * There is no client secret and no refresh token. Tokens last about an hour; when one
 * expires the engine parks in a "reconnect" state and the next tap on the cloud icon
 * asks Google again — usually without a prompt, because consent was already given.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';

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
	requestAccessToken(options?: { prompt?: '' | 'consent' | 'select_account' }): void;
	callback: (response: TokenResponse) => void;
	error_callback?: (error: { type: string; message?: string }) => void;
};

type Gis = {
	accounts: {
		oauth2: {
			initTokenClient(config: {
				client_id: string;
				scope: string;
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

let token: { value: string; expiresAt: number } | null = null;
let client: TokenClient | null = null;

/** The current token if it has at least a minute left, else null. */
export function currentToken(): string | null {
	if (token && token.expiresAt - Date.now() > 60_000) return token.value;
	return null;
}

/**
 * Ask Google for an access token. `prompt: ''` tries silently (works once consent
 * exists and the user is signed in to Google in this browser); `'consent'` always
 * shows the chooser and is what the Connect button uses.
 */
export async function requestToken(prompt: '' | 'consent' | 'select_account' = ''): Promise<string> {
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
			token = { value: response.access_token, expiresAt: Date.now() + seconds * 1000 };
			resolve(response.access_token);
		};
		const error_callback = (error: { type: string; message?: string }) => {
			reject(new AuthError(error.message ?? error.type, true));
		};

		if (!client) {
			client = gis.accounts.oauth2.initTokenClient({
				client_id: GOOGLE_CLIENT_ID,
				scope: SCOPES,
				callback,
				error_callback
			});
		} else {
			client.callback = callback;
			client.error_callback = error_callback;
		}
		client.requestAccessToken({ prompt });
	});
}

/** A valid token, refreshing silently if the old one has run out. */
export async function ensureToken(): Promise<string> {
	return currentToken() ?? requestToken('');
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
	const value = token?.value;
	token = null;
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
