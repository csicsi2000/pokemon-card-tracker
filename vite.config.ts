import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
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
				start_url: '/',
				icons: [
					{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
					{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
				]
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png,webp,woff,woff2}'],
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
