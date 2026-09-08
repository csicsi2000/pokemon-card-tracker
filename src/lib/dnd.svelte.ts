/**
 * Dragging a card into a folder, on the Decks and Lots pages.
 *
 * The native HTML5 drag events would be less code, but they are mouse-only and this app
 * is used on a phone as much as on a desktop — so both gestures run through pointer
 * events instead:
 *   - mouse: the drag starts once the pointer has moved a few pixels with the button held;
 *   - touch: the drag starts after a long press, so an ordinary swipe still scrolls.
 *
 * The dragged card stays where it is and a small label follows the pointer (DragGhost).
 * Drop targets register their element here and the one under the pointer is found by
 * hit-testing upwards from it — `pointerenter` on the targets would be simpler, but once
 * a drag is under way every pointer event belongs to the element the gesture started on.
 *
 * The "Move to…" menu item does the same job without a gesture; both stay.
 */
import { canMoveInto } from './data/folders';
import type { Folder } from './data/model';

/** What is being dragged: a leaf (a deck, a lot) or a folder of the same tree. */
export type DragItem = {
	kind: 'item' | 'folder';
	id: string;
	name: string;
	/** The folder it sits in today — `folderId` for a leaf, `parentId` for a folder. */
	parentId: string | null;
	/** Emoji shown on the label that follows the pointer, when the record has one. */
	icon?: string | null;
};

/** How long a finger has to rest on a card before it picks it up. */
const LONG_PRESS_MS = 350;
/** Pointer travel that starts a mouse drag — and that gives up on a long press. */
const THRESHOLD_PX = 6;
/** A click this soon after a drag is the one that ended it, and is swallowed. */
const CLICK_GRACE_MS = 300;

/** Controls that do their own thing; a press on one never starts a drag. */
const INTERACTIVE = 'button, [role="menuitem"], input, select, textarea';

export function createFolderDnd(options: {
	/** The tree that both the dragged folders and the drop targets belong to. */
	folders: () => Folder[];
	/** Called once on a drop, with the folder landed in (`null` is the top level). */
	move: (item: DragItem, folderId: string | null) => void;
}) {
	let item = $state<DragItem | null>(null);
	let target = $state<{ folderId: string | null } | null>(null);
	let x = $state(0);
	let y = $state(0);

	/** When the last drag ended, so the click it finished with can be ignored. */
	let endedAt = 0;
	const zones = new Map<HTMLElement, string | null>();

	const accepts = (folderId: string | null) =>
		item !== null && canMoveInto(options.folders(), item, folderId);

	/** The drop target under the pointer, if there is one and it would take the drag. */
	function zoneAt(px: number, py: number) {
		let node = document.elementFromPoint(px, py) as HTMLElement | null;
		while (node) {
			if (zones.has(node)) {
				const folderId = zones.get(node)!;
				return accepts(folderId) ? { folderId } : null;
			}
			node = node.parentElement;
		}
		return null;
	}

	/**
	 * Makes a card draggable. Attach it to the element that should be picked up, with the
	 * record it stands for: `{@attach dnd.grab({ kind: 'item', id, name, parentId })}`.
	 */
	function grab(dragItem: DragItem) {
		return (node: HTMLElement) => {
			/** The press being watched: where it started, and whether it is a finger. */
			let press: { x: number; y: number; id: number; touch: boolean } | null = null;
			let timer: ReturnType<typeof setTimeout> | undefined;
			let dragging = false;

			function listen(on: boolean) {
				if (on) {
					window.addEventListener('pointermove', onPointerMove);
					window.addEventListener('pointerup', onPointerUp);
					window.addEventListener('pointercancel', onPointerCancel);
					// Not passive: once a finger drag is under way this is what stops the page
					// scrolling under it. A long press does not move, so the browser has not
					// started panning yet and the cancellation still counts.
					document.addEventListener('touchmove', onTouchMove, { passive: false });
				} else {
					window.removeEventListener('pointermove', onPointerMove);
					window.removeEventListener('pointerup', onPointerUp);
					window.removeEventListener('pointercancel', onPointerCancel);
					document.removeEventListener('touchmove', onTouchMove);
				}
			}

			function begin() {
				if (!press) return;
				dragging = true;
				item = dragItem;
				x = press.x;
				y = press.y;
				target = zoneAt(press.x, press.y);
				document.body.classList.add('dragging');
				if (press.touch) navigator.vibrate?.(10);
			}

			/** Stop watching the press. `wasDrag` also swallows the click that follows. */
			function finish(wasDrag: boolean) {
				clearTimeout(timer);
				timer = undefined;
				press = null;
				dragging = false;
				item = null;
				target = null;
				document.body.classList.remove('dragging');
				if (wasDrag) endedAt = Date.now();
				listen(false);
			}

			function onPointerDown(event: PointerEvent) {
				if (event.button !== 0 || press || item) return;
				if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
				press = {
					x: event.clientX,
					y: event.clientY,
					id: event.pointerId,
					touch: event.pointerType !== 'mouse'
				};
				if (press.touch) timer = setTimeout(begin, LONG_PRESS_MS);
				listen(true);
			}

			function onPointerMove(event: PointerEvent) {
				if (!press || event.pointerId !== press.id) return;
				if (!dragging) {
					if (Math.hypot(event.clientX - press.x, event.clientY - press.y) <= THRESHOLD_PX) return;
					// A finger that moves before the long press fires is scrolling, not dragging.
					if (press.touch) return finish(false);
					begin();
				}
				x = event.clientX;
				y = event.clientY;
				target = zoneAt(x, y);
			}

			function onPointerUp(event: PointerEvent) {
				if (!press || event.pointerId !== press.id) return;
				// Read the drop before finish() clears it.
				const landed = dragging && item && target ? { item, folderId: target.folderId } : null;
				finish(dragging);
				if (landed) options.move(landed.item, landed.folderId);
			}

			function onPointerCancel(event: PointerEvent) {
				if (!press || event.pointerId !== press.id) return;
				finish(dragging);
			}

			function onTouchMove(event: TouchEvent) {
				if (dragging) event.preventDefault();
			}

			/** A drag that started on the card's name link must not follow the link. */
			function onClick(event: MouseEvent) {
				if (!dragging && Date.now() - endedAt >= CLICK_GRACE_MS) return;
				event.preventDefault();
				event.stopPropagation();
			}

			const noDefault = (event: Event) => event.preventDefault();
			function onContextMenu(event: Event) {
				if (dragging) event.preventDefault();
			}

			node.addEventListener('pointerdown', onPointerDown);
			node.addEventListener('click', onClick, true);
			// Links and images inside the card would otherwise start a native drag on mouse,
			// and a long press would open the context menu instead of picking the card up.
			node.addEventListener('dragstart', noDefault);
			node.addEventListener('contextmenu', onContextMenu);

			return () => {
				if (press) finish(false);
				node.removeEventListener('pointerdown', onPointerDown);
				node.removeEventListener('click', onClick, true);
				node.removeEventListener('dragstart', noDefault);
				node.removeEventListener('contextmenu', onContextMenu);
			};
		};
	}

	/**
	 * Marks an element as a place things can be dropped: `{@attach dnd.zone(folder.id)}`,
	 * or `dnd.zone(null)` for the top level (the first breadcrumb).
	 */
	function zone(folderId: string | null) {
		return (node: HTMLElement) => {
			zones.set(node, folderId);
			return () => void zones.delete(node);
		};
	}

	return {
		/** The record being dragged, or null when nothing is. */
		get item() {
			return item;
		},
		get x() {
			return x;
		},
		get y() {
			return y;
		},
		/** The folder the pointer is over and would drop into. */
		get target() {
			return target;
		},
		/** True for the card being dragged, so it can fade while it is in the air. */
		isDragging: (id: string) => item?.id === id,
		/** True while the drag hovers this folder — it shows a ring. */
		isOver: (folderId: string | null) => target?.folderId === folderId,
		/** True when the drag could land here; the other folders dim. */
		canDrop: (folderId: string | null) => accepts(folderId),
		grab,
		zone
	};
}

export type FolderDnd = ReturnType<typeof createFolderDnd>;
