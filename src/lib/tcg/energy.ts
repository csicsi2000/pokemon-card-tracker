/**
 * Which energy type a card stands for — the fact the app needs to draw an energy card
 * that has no scan.
 *
 * TCGdex publishes no artwork for most basic energy printings, so those tiles fall back
 * to something drawn locally (EnergyCardArt.svelte) instead of a name in a grey box.
 * `card.types` is no help: it is empty for 301 of the 337 basic energy printings in the
 * catalogue, so the name is the only reliable source.
 *
 * Matching is deliberately strict — a name has to point at exactly one type. That keeps
 * the multi-type specials out ("Blend Energy Grass Fire Psychic Darkness", "Unit Energy
 * GrassFireWater") along with the typeless ones ("Rainbow Energy", "Prism Energy", and
 * the handful of specials TCGdex forgot to tag as special), while still covering the
 * flavoured basics ("Nitro Fire Energy", "Basic Fire Energy") and the PTCGL spelling
 * ("Basic {R} Energy").
 */
import type { Card } from '$lib/types';
import { ENERGY_SYMBOLS } from './normalize';

/** The printed energy types, in the order the game lists them. */
export const ENERGY_TYPES = [
	'Grass',
	'Fire',
	'Water',
	'Lightning',
	'Psychic',
	'Fighting',
	'Darkness',
	'Metal',
	'Fairy',
	'Dragon',
	'Colorless'
] as const;

export type EnergyType = (typeof ENERGY_TYPES)[number];

const KNOWN = new Map<string, EnergyType>(ENERGY_TYPES.map((type) => [type.toLowerCase(), type]));

/** The one type a name mentions, or null when it names none or several. */
function typeFromName(name: string): EnergyType | null {
	// "Basic {R} Energy" — PTCGL writes the type as a symbol rather than a word.
	const symbol = name.match(/\{([a-z])\}/i);
	if (symbol) return KNOWN.get(ENERGY_SYMBOLS[symbol[1].toLowerCase()]?.toLowerCase() ?? '') ?? null;

	const lower = name.toLowerCase();
	const hits = ENERGY_TYPES.filter((type) => lower.includes(type.toLowerCase()));
	return hits.length === 1 ? hits[0] : null;
}

/**
 * The energy type this card provides, or null for a non-Energy card and for an energy
 * whose type cannot be pinned down. Callers treat null as "no drawn art for this one".
 */
export function energyType(card: Pick<Card, 'name' | 'supertype' | 'types'>): EnergyType | null {
	if (card.supertype !== 'Energy') return null;

	// Trust the catalogue when it says something, but only when it says one thing.
	const tagged = [...new Set(card.types.flatMap((type) => KNOWN.get(type.toLowerCase()) ?? []))];
	if (tagged.length === 1) return tagged[0];

	return typeFromName(card.name);
}

/**
 * The printing whose scan stands in for a basic energy that has none of its own.
 *
 * TCGdex publishes no artwork for a single Scarlet & Violet basic energy, nor for the
 * Trainer Kit or Mega Evolution ones — 161 printings in all. pokemontcg.io does publish
 * them, so that is where the picture comes from: the current SVE printing of each type,
 * plus the Sun & Moon Fairy Energy (Fairy was retired before SVE existed).
 *
 * It is the type's card, not that exact printing's: an old Trainer Kit "Fire Energy"
 * shows *a* Basic Fire Energy. For the one card whose entire face is its type symbol
 * that is the right trade — the alternative on screen is a grey box with a name in it —
 * and the tile still labels the printing it belongs to.
 *
 * Dragon and Colorless are missing on purpose: neither was ever printed as a basic
 * energy, so they fall through to the drawn pip in EnergyCardArt.svelte.
 */
const ART_PATHS: Partial<Record<EnergyType, string>> = {
	Grass: 'sve/1',
	Fire: 'sve/2',
	Water: 'sve/3',
	Lightning: 'sve/4',
	Psychic: 'sve/5',
	Fighting: 'sve/6',
	Darkness: 'sve/7',
	Metal: 'sve/8',
	Fairy: 'sm1/172'
};

/** Hotlinked like every other card scan; the worker caches it on first sight. */
export function energyArt(type: EnergyType): string | null {
	const path = ART_PATHS[type];
	return path ? `https://images.pokemontcg.io/${path}.png` : null;
}
