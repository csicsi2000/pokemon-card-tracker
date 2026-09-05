import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * GitHub Pages serves project sites from a sub-path, so every URL the app emits needs
 * that prefix. Set BASE_PATH=/<repo> when building for Pages; leave it empty for
 * `npm run dev` and for a user/organisation site served from the domain root.
 */
const raw = process.env.BASE_PATH?.replace(/\/+$/, '') ?? '';
// Tolerate "repo" as well as "/repo"; SvelteKit insists on a leading slash and no trailing one.
const basePath: '' | `/${string}` =
	raw === '' ? '' : raw.startsWith('/') ? (raw as `/${string}`) : `/${raw}`;

export default defineConfig(({ mode }) => ({
	define: {
		// Optional Google Drive sync. Read from .env / the CI environment at build time and
		// baked into the bundle; an empty string simply hides the feature. Not a secret:
		// an OAuth client id is public by design.
		__GOOGLE_CLIENT_ID__: JSON.stringify(
			loadEnv(mode, process.cwd(), 'PUBLIC_').PUBLIC_GOOGLE_CLIENT_ID ??
				process.env.PUBLIC_GOOGLE_CLIENT_ID ??
				''
		)
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			paths: {
				base: basePath,
				// Must be absolute: nested routes like /decks/<id> are served by the SPA
				// fallback, and a relative base derived from that URL would point asset and
				// catalogue.json requests at the wrong directory on a hard refresh.
				relative: false
			},
			adapter: adapter({
				// Deck and format pages have ids that only exist in the visitor's own
				// localStorage, so they cannot be prerendered. GitHub Pages serves 404.html
				// for unknown paths, which boots the app and lets it route client-side.
				fallback: '404.html'
			})
		}),
		SvelteKitPWA({
			// 'prompt', not 'autoUpdate': an installed copy holds the user's only copy of
			// their data, and autoUpdate reloads the page the moment a new worker takes
			// over — mid-edit if that is when it lands. ReloadPrompt asks first.
			registerType: 'prompt',
			devOptions: {
				// `npm run dev` otherwise 404s the manifest link in app.html and never
				// offers an install. The dev worker precaches nothing — it only makes the
				// manifest and the install flow testable without a production build.
				enabled: true,
				type: 'module',
				suppressWarnings: true
			},
			manifest: {
				// The app's identity to the OS. Same value the browser would infer from
				// start_url, spelled out so a later change to start_url cannot orphan
				// everyone's existing install.
				id: `${basePath}/`,
				name: 'Cardex — Pokémon collection & decks',
				short_name: 'Cardex',
				description: 'Track your Pokémon TCG collection, build decks, and plan what to buy.',
				lang: 'en',
				dir: 'ltr',
				categories: ['productivity', 'utilities', 'entertainment'],
				theme_color: '#0c0a09',
				background_color: '#0c0a09',
				display: 'standalone',
				display_override: ['standalone', 'minimal-ui'],
				// Deliberately unlocked: the layout has a real desktop/landscape mode, so an
				// installed tablet copy should be allowed to use it.
				orientation: 'any',
				scope: `${basePath}/`,
				start_url: `${basePath}/`,
				// Long-press / right-click the installed icon. Paths need the trailing slash
				// the app's router uses, and must sit inside the scope above.
				shortcuts: [
					{ name: 'Collection', short_name: 'Collection', url: `${basePath}/collection/` },
					{ name: 'Find cards', short_name: 'Cards', url: `${basePath}/cards/` },
					{ name: 'Decks', short_name: 'Decks', url: `${basePath}/decks/` }
				],
				icons: [
					{ src: `${basePath}/icon-192.png`, sizes: '192x192', type: 'image/png' },
					{ src: `${basePath}/icon-512.png`, sizes: '512x512', type: 'image/png' },
					{
						src: `${basePath}/icon-512.png`,
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				// catalogue.json is ~2 MB, well over the default 2 MiB precache limit, and
				// it is the one file the app cannot run without — so raise the ceiling.
				globPatterns: ['**/*.{js,css,html,json,svg,png,webp,woff,woff2}'],
				// The per-set detail files come to ~7.5 MB together. Precaching them would
				// put all of it on the first visit, which is exactly what splitting by set
				// avoids — they are cached at runtime instead, as each set is opened.
				globIgnores: ['**/details/*.json'],
				maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
				// The shell to serve for a URL that is not in the precache — an offline hard
				// refresh on /decks/<id>, or on any trailing-slash URL, which is every page
				// the app links to. It must be a *precached* file: 404.html is written by
				// the adapter after this worker is generated, so it never makes the
				// precache and pointing at it leaves those navigations failing offline.
				// The prerendered index is precached, and boots the same client router.
				navigateFallback: `${basePath}/`,
				// Drop precaches from older builds instead of letting them accumulate;
				// catalogue.json alone is 2 MB a time.
				cleanupOutdatedCaches: true,
				runtimeCaching: [
					{
						// Immutable for a given build: rules text does not change once printed.
						urlPattern: /\/details\/[^/]+\.json$/i,
						handler: 'CacheFirst',
						options: {
							cacheName: 'card-details',
							expiration: { maxEntries: 250 },
							cacheableResponse: { statuses: [0, 200] }
						}
					},
					{
						// Card art never changes once published — cache it hard so the grid
						// stays usable offline and on a phone data connection.
						urlPattern: /^https:\/\/assets\.tcgdex\.net\/.*/i,
						handler: 'CacheFirst',
						options: {
							cacheName: 'tcgdex-images',
							expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 60 },
							cacheableResponse: { statuses: [0, 200] }
						}
					},
					{
						// Per-card detail (attacks, abilities, prices). Network first, because
						// prices move; the cached copy keeps a card readable offline once seen.
						urlPattern: /^https:\/\/api\.tcgdex\.net\/.*/i,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'tcgdex-cards',
							networkTimeoutSeconds: 5,
							expiration: { maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 14 },
							cacheableResponse: { statuses: [0, 200] }
						}
					}
				]
			}
		})
	],
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node'
	}
}));
