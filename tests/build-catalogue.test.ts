import { describe, expect, it } from 'vitest';
import { staleSetIds } from '../src/lib/catalogue-delta';
import type { CatalogueFile } from '../src/lib/catalogue-format';

/**
 * scripts/build-catalogue.ts records a set whose cards failed to fetch with a null
 * card count. This is the contract that relies on: such a set is refetched by the
 * browser on its next check, where one recorded at its declared size never would be.
 */
describe('a set the catalogue build failed to fetch', () => {
	const baseline: CatalogueFile = {
		generatedAt: '2026-10-18',
		sets: [['sv08', 'Surging Sparks', 'Scarlet & Violet', 'SSP', '2024-11-08', null, null, null, null, 0, 1, 1]],
		cards: []
	};

	it('is refetched by the browser refresh', () => {
		expect(staleSetIds(baseline, [{ id: 'sv08', name: 'Surging Sparks', cardCount: { total: 252 } }], null)).toEqual([
			'sv08'
		]);
	});
});
