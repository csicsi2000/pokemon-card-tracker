/** Tree helpers for deck folders. Pure; the store and the pages both use them. */
import type { Deck, DeckFolder } from './model';

/** Root → the folder itself. Empty for the root (`null`) or an unknown id. */
export function folderPath(folders: DeckFolder[], id: string | null): DeckFolder[] {
	const byId = new Map(folders.map((folder) => [folder.id, folder]));
	const path: DeckFolder[] = [];
	const seen = new Set<string>();
	let current = id ? byId.get(id) : undefined;
	while (current && !seen.has(current.id)) {
		seen.add(current.id);
		path.unshift(current);
		current = current.parentId ? byId.get(current.parentId) : undefined;
	}
	return path;
}

export const childrenOf = (folders: DeckFolder[], parentId: string | null) =>
	folders
		.filter((folder) => folder.parentId === parentId)
		.sort((a, b) => a.name.localeCompare(b.name));

/** True when `id` is `ancestorId` itself or sits anywhere beneath it. */
export function isDescendant(folders: DeckFolder[], id: string | null, ancestorId: string) {
	return folderPath(folders, id).some((folder) => folder.id === ancestorId);
}

/** Decks directly in the folder plus everything in its sub-folders. */
export function deckCountDeep(folders: DeckFolder[], decks: Deck[], folderId: string) {
	return decks.filter((deck) => isDescendant(folders, deck.folderId, folderId)).length;
}

/** Depth-first listing with depth, for "Move to…" pickers. */
export function flattenTree(
	folders: DeckFolder[],
	parentId: string | null = null,
	depth = 0
): { folder: DeckFolder; depth: number }[] {
	return childrenOf(folders, parentId).flatMap((folder) => [
		{ folder, depth },
		...flattenTree(folders, folder.id, depth + 1)
	]);
}
