/**
 * Tree helpers for folders. Decks and lots have separate trees of the same shape, so
 * everything here takes the tree it should walk. Pure; the store and the pages both use them.
 */
import type { Folder } from './model';

/** Root → the folder itself. Empty for the root (`null`) or an unknown id. */
export function folderPath(folders: Folder[], id: string | null): Folder[] {
	const byId = new Map(folders.map((folder) => [folder.id, folder]));
	const path: Folder[] = [];
	const seen = new Set<string>();
	let current = id ? byId.get(id) : undefined;
	while (current && !seen.has(current.id)) {
		seen.add(current.id);
		path.unshift(current);
		current = current.parentId ? byId.get(current.parentId) : undefined;
	}
	return path;
}

export const childrenOf = (folders: Folder[], parentId: string | null) =>
	folders
		.filter((folder) => folder.parentId === parentId)
		.sort((a, b) => a.name.localeCompare(b.name));

/** True when `id` is `ancestorId` itself or sits anywhere beneath it. */
export function isDescendant(folders: Folder[], id: string | null, ancestorId: string) {
	return folderPath(folders, id).some((folder) => folder.id === ancestorId);
}

/** Items (decks, lots) directly in the folder plus everything in its sub-folders. */
export function countDeep(
	folders: Folder[],
	items: { folderId: string | null }[],
	folderId: string
) {
	return items.filter((item) => isDescendant(folders, item.folderId, folderId)).length;
}

/** Depth-first listing with depth, for "Move to…" pickers. */
export function flattenTree(
	folders: Folder[],
	parentId: string | null = null,
	depth = 0
): { folder: Folder; depth: number }[] {
	return childrenOf(folders, parentId).flatMap((folder) => [
		{ folder, depth },
		...flattenTree(folders, folder.id, depth + 1)
	]);
}

/** "Binders › 2026" — the folder trail as one line. Empty string at the root. */
export const folderTrail = (folders: Folder[], id: string | null) =>
	folderPath(folders, id)
		.map((folder) => folder.name)
		.join(' › ');
