/**
 * A hybrid logical clock: wall time, but never earlier than any timestamp already seen.
 *
 * Merges pick the newer `updatedAt`, so a device with a slow clock could otherwise make
 * an edit *after* pulling and still lose to what it pulled. Observing every timestamp we
 * load or receive, and always ticking past it, guarantees "later edit wins" locally.
 */
import type { UserData } from './model';

export type Clock = {
	/** A fresh ISO timestamp strictly greater than any this clock has seen or issued. */
	next(): string;
	/** Raise the floor to this timestamp if it is later. */
	observeTime(iso: string): void;
	/** Observe every timestamp in a payload — call after load and after merge. */
	observe(data: UserData): void;
};

export function createClock(now: () => number = Date.now): Clock {
	let floor = 0;

	const observeTime = (iso: string) => {
		const time = Date.parse(iso);
		if (Number.isFinite(time) && time > floor) floor = time;
	};

	return {
		next() {
			floor = Math.max(now(), floor + 1);
			return new Date(floor).toISOString();
		},
		observeTime,
		observe(data) {
			for (const row of data.collection) observeTime(row.updatedAt);
			for (const lot of data.lots) observeTime(lot.updatedAt);
			for (const folder of data.folders) observeTime(folder.updatedAt);
			for (const deck of data.decks) observeTime(deck.updatedAt);
			for (const format of data.formats) observeTime(format.updatedAt);
			for (const tombstone of data.tombstones) observeTime(tombstone.deletedAt);
		}
	};
}
