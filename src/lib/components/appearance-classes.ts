/**
 * How each palette colour renders. Written out in full (not built from the colour name) so
 * Tailwind sees every class at build time. Tints are the soft background + readable text
 * used by the tile on a card; swatches are the solid dots in the picker.
 *
 * The deck-composition colours at the bottom live here for the same reason: they are
 * class names Tailwind has to see spelled out somewhere.
 */
import type { Supertype } from '$lib/types';

import type { AppearanceColor } from '$lib/data/appearance';

export const TINT: Record<AppearanceColor, string> = {
	red: 'bg-red-500/15 text-red-700 dark:text-red-300',
	orange: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
	amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
	green: 'bg-green-500/15 text-green-700 dark:text-green-300',
	teal: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
	sky: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
	blue: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
	violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
	pink: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
	slate: 'bg-slate-500/15 text-slate-700 dark:text-slate-300'
};

export const SWATCH: Record<AppearanceColor, string> = {
	red: 'bg-red-500',
	orange: 'bg-orange-500',
	amber: 'bg-amber-500',
	green: 'bg-green-500',
	teal: 'bg-teal-500',
	sky: 'bg-sky-500',
	blue: 'bg-blue-500',
	violet: 'bg-violet-500',
	pink: 'bg-pink-500',
	slate: 'bg-slate-500'
};

export const COLOR_LABELS: Record<AppearanceColor, string> = {
	red: 'Red',
	orange: 'Orange',
	amber: 'Amber',
	green: 'Green',
	teal: 'Teal',
	sky: 'Sky',
	blue: 'Blue',
	violet: 'Violet',
	pink: 'Pink',
	slate: 'Slate'
};

/**
 * The colour each card kind wears in a deck breakdown — the bar on the deck page and the
 * dots on a deck card. Red is deliberately absent: on those screens it means "missing".
 */
export const SUPERTYPE_COLOR: Record<Supertype, string> = {
	Pokemon: 'bg-sky-500',
	Trainer: 'bg-violet-500',
	Energy: 'bg-amber-500'
};
