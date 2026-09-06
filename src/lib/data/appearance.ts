/**
 * The look a person can give a lot or a folder: one colour from a fixed palette and one
 * emoji. Pure helpers; the swatch and tint classes that render them live with the
 * components, so this file can be used by the model, migration and CLI alike.
 *
 * Colours are stored by name, not as hex, so a file written on one device renders with the
 * palette of whatever version opens it, and dark mode can pick its own shade.
 */

export const APPEARANCE_COLORS = [
	'red',
	'orange',
	'amber',
	'green',
	'teal',
	'sky',
	'blue',
	'violet',
	'pink',
	'slate'
] as const;

export type AppearanceColor = (typeof APPEARANCE_COLORS)[number];

export const isAppearanceColor = (value: unknown): value is AppearanceColor =>
	typeof value === 'string' && (APPEARANCE_COLORS as readonly string[]).includes(value);

/** Emoji offered first in the picker; anything else can still be typed. */
export const SUGGESTED_ICONS = [
	'📦',
	'🛒',
	'🎁',
	'🔥',
	'⭐',
	'💎',
	'🃏',
	'🎴',
	'📬',
	'🧾',
	'🏷️',
	'🔁',
	'🎄',
	'🎂',
	'✈️',
	'🏆'
] as const;

/**
 * Reduce whatever was typed to one icon: the first user-perceived character (so a flag,
 * a skin-toned emoji or a family stays whole), or null when there is nothing there.
 * Any character is accepted, not just emoji — a plain letter makes a fine marker too.
 */
export function normalizeIcon(input: string | null | undefined): string | null {
	const trimmed = input?.trim() ?? '';
	if (!trimmed) return null;
	if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
		const [first] = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed);
		return first?.segment ?? null;
	}
	return Array.from(trimmed)[0] ?? null;
}
