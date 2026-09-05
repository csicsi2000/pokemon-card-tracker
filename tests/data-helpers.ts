import { createClock, type Clock } from '../src/lib/data/clock';
import {
	emptyData,
	type CollectionEntry,
	type Deck,
	type Folder,
	type Lot,
	type UserData,
	type WantEntry,
	type WantList
} from '../src/lib/data/model';

/** A clock that starts at a fixed instant and ticks one millisecond per call. */
export function fixedClock(startIso = '2026-01-01T00:00:00.000Z'): Clock {
	let current = Date.parse(startIso);
	return createClock(() => (current += 1));
}

export const at = (iso: string) => iso;

export function makeRow(overrides: Partial<CollectionEntry> & { cardId: string }): CollectionEntry {
	return {
		variant: 'normal',
		quantity: 1,
		lotId: null,
		updatedAt: '2026-01-01T00:00:00.000Z',
		...overrides
	};
}

export function makeWant(overrides: Partial<WantEntry> & { cardId: string }): WantEntry {
	return {
		variant: 'normal',
		quantity: 1,
		listId: null,
		priority: 'normal',
		note: null,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...overrides
	};
}

export function makeWantList(overrides: Partial<WantList> & { id: string }): WantList {
	return {
		name: overrides.id,
		note: null,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...overrides
	};
}

export function makeLot(overrides: Partial<Lot> & { id: string }): Lot {
	return {
		name: overrides.id,
		note: null,
		acquiredOn: null,
		folderId: null,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...overrides
	};
}

export function makeFolder(overrides: Partial<Folder> & { id: string }): Folder {
	return {
		name: overrides.id,
		parentId: null,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...overrides
	};
}

export function makeDeck(overrides: Partial<Deck> & { id: string }): Deck {
	return {
		name: overrides.id,
		description: null,
		formatId: null,
		folderId: null,
		cards: [],
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...overrides
	};
}

export function makeUserData(overrides: Partial<UserData> = {}): UserData {
	return { ...emptyData(), ...overrides };
}
