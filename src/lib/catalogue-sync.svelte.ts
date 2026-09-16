/**
 * The app-facing side of the catalogue refresh: reactive status for the UI, and the one
 * call that kicks a check off after the shell has rendered.
 *
 * Deliberately not part of the page `load`. The static catalogue is what the first paint
 * needs, and making it wait on TCGdex would trade a working offline app for a slower
 * online one. The check runs afterwards and, if it found anything, invalidates the
 * layout's catalogue dependency so every page re-reads the merged result.
 */
import { browser } from '$app/environment';
import { invalidate } from '$app/navigation';
import { clearCardTextCache } from './card-details';
import { CATALOGUE_DEP, refreshCatalogue, type RefreshOutcome } from './catalogue';

export type CatalogueSyncStatus = 'idle' | 'checking' | 'current' | 'updated' | 'failed';

class CatalogueSync {
	status = $state<CatalogueSyncStatus>('idle');
	/** Cards gained over the static build, from the run that last changed anything. */
	added = $state(0);
	lastError = $state<string | null>(null);

	private running = false;

	/**
	 * Check TCGdex and merge anything new. Safe to call on every mount: it no-ops while
	 * the previous check is still fresh unless `force` is set.
	 */
	async start(options: { force?: boolean } = {}): Promise<RefreshOutcome | null> {
		if (!browser || this.running) return null;

		this.running = true;
		this.status = 'checking';
		this.lastError = null;

		try {
			const outcome = await refreshCatalogue({ force: options.force });

			if (outcome.changed) {
				this.added = outcome.added;
				this.status = 'updated';
				clearCardTextCache();
				// Re-runs the layout load, so `data.catalogue` everywhere becomes the merged one.
				await invalidate(CATALOGUE_DEP);
			} else if (outcome.failures.length) {
				this.lastError = outcome.failures[0];
				this.status = 'failed';
			} else {
				this.status = 'current';
			}

			return outcome;
		} catch (error) {
			this.lastError = (error as Error).message;
			this.status = 'failed';
			return null;
		} finally {
			this.running = false;
		}
	}
}

export const catalogueSync = new CatalogueSync();
