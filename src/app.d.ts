/// <reference types="@vite-pwa/sveltekit" />

// There is no server: no locals, no session. All state lives in localStorage.
declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace App {}

	/** Google OAuth client id, injected by vite.config.ts; '' when sync is not configured. */
	const __GOOGLE_CLIENT_ID__: string;
}

export {};
