/**
 * Prices for a whole list of cards rather than one open card.
 *
 * TCGdex only quotes a price per card over REST, so pricing a wants list of forty cards
 * is forty requests. They go out a few at a time and land in a reactive map, so each row
 * fills in as its quote arrives instead of the page waiting for the slowest one. What
 * comes back is cached in this browser by card-details.ts, so coming back to the list
 * later in the day costs nothing.
 *
 * A missing price is normal — Energy cards, brand-new sets and anything the marketplaces
 * have never listed simply have none — so a failure here is recorded and never thrown.
 */
import { loadPrices, type MarketPrice } from './card-details';

/** Requests in flight at once. Enough to fill a screen quickly, few enough to be polite. */
const CONCURRENCY = 6;

class PriceBook {
	#prices = $state<Record<string, MarketPrice[]>>({});
	/** Cards whose lookup failed — retried only when the caller asks for a refresh. */
	#failed = $state<Record<string, true>>({});
	#pending = $state(0);

	#queue: string[] = [];
	#running = 0;
	/** Every card asked for, so a list redrawing does not queue the same card twice. */
	#seen = new Set<string>();

	/** How many quotes are still on their way; drives the "pricing…" hint. */
	get pending() {
		return this.#pending;
	}

	/** The quotes for one card: `undefined` until they land, `[]` when there are none. */
	get(cardId: string): MarketPrice[] | undefined {
		return this.#prices[cardId];
	}

	failed(cardId: string): boolean {
		return this.#failed[cardId] === true;
	}

	/** Queue every card not already fetched, in flight, or known to have failed. */
	request(cardIds: Iterable<string>) {
		for (const cardId of cardIds) {
			if (this.#seen.has(cardId)) continue;
			this.#seen.add(cardId);
			this.#queue.push(cardId);
			this.#pending += 1;
		}
		this.#pump();
	}

	/** Forget everything and fetch the given cards again — the refresh button. */
	refresh(cardIds: Iterable<string>) {
		this.#prices = {};
		this.#failed = {};
		this.#seen.clear();
		this.request(cardIds);
	}

	#pump() {
		while (this.#running < CONCURRENCY && this.#queue.length > 0) {
			const cardId = this.#queue.shift()!;
			this.#running += 1;
			loadPrices(cardId)
				.then((prices) => {
					this.#prices = { ...this.#prices, [cardId]: prices };
				})
				.catch(() => {
					// Offline, or TCGdex is having a moment. The row just shows no price.
					this.#failed = { ...this.#failed, [cardId]: true };
				})
				.finally(() => {
					this.#running -= 1;
					this.#pending -= 1;
					this.#pump();
				});
		}
	}
}

export const priceBook = new PriceBook();
