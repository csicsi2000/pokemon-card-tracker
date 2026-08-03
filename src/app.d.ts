/// <reference types="@vite-pwa/sveltekit" />

// There is no server: no locals, no session. All state lives in localStorage.
declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace App {}
}

export {};
