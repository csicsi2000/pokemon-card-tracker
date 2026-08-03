import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
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

export default defineConfig({
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
			registerType: 'autoUpdate',
			manifest: {
				name: 'Cardex — Pokémon collection & decks',
				short_name: 'Cardex',
				description: 'Track your Pokémon TCG collection, build decks, and plan what to buy.',
				theme_color: '#0c0a09',
				background_color: '#0c0a09',
				display: 'standalone',
				orientation: 'portrait',
				scope: `${basePath}/`,
				start_url: `${basePath}/`,
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
				maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
				navigateFallback: `${basePath}/404.html`,
				runtimeCaching: [
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
					}
				]
			}
		})
	],
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node'
	}
});
