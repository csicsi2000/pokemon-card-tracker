/**
 * Which cards are the same card *to play with*.
 *
 * A Trainer or Energy is defined by its name: every Ultra Ball, every professor's
 * Professor's Research, plays the same. A Pokémon is not — Pikachu from one set and
 * Pikachu from another usually have different attacks — so two Pokémon printings are
 * interchangeable only when their name AND their game text match. Reprints with the same
 * attacks (a 151 Charmander in a later promo, a secret rare of a regular card) still
 * count as one.
 *
 * The game text lives in the per-set detail files, far too much to load just to compare
 * cards, so the catalogue carries a short hash of it per Pokémon (`Card.textKey`), worked
 * out when the catalogue is built. `playKey` is the one place that turns a card into the
 * key deck requirements, ownership and wants are counted by.
 *
 * Copy limits are NOT counted by this key: the rules cap four of a name whatever the text
 * — see `deckNameKey` and legality.ts.
 */
import type { CardDetailRow } from '../catalogue-format';
import type { WantPool } from '../data/model';
import type { Card } from '../types';
import { deckNameKey, normalizeName } from './normalize';

/**
 * FNV-1a folded to at most five base-36 characters (60M values). It only has to tell
 * apart the printings of ONE name — a few hundred at most — and every character costs
 * ~17k times over in the catalogue download.
 */
function hash(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i += 1) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return ((h >>> 0) % 36 ** 5).toString(36);
}

const damage = (value: string | undefined) =>
	(value ?? '').toLowerCase().replace(/×/g, 'x').replace(/\s+/g, '');

/**
 * The hash of a Pokémon's game text: HP, abilities and attacks (name, cost, damage,
 * effect). Wording is compared after `normalizeName`, so punctuation, case and accent
 * drift between sets does not split a reprint from its original. Null when there is no
 * text to compare (the source has none for this printing) — `playKey` then treats the
 * printing as its own card rather than guessing it matches another.
 */
export function pokemonTextKey(hp: number | null | undefined, detail: CardDetailRow | null) {
	const abilities = detail?.abilities ?? [];
	const attacks = detail?.attacks ?? [];
	if (!abilities.length && !attacks.length) return null;

	const parts = [
		`hp:${hp ?? ''}`,
		...abilities.map((a) => `a:${normalizeName(a.name)}:${normalizeName(a.effect)}`),
		...attacks.map(
			(a) =>
				`t:${normalizeName(a.name)}:${a.cost.map(normalizeName).join(',')}:${damage(a.damage)}:${normalizeName(a.effect ?? '')}`
		),
		`e:${normalizeName(detail?.effect ?? '')}`
	];
	return hash(parts.join('|'));
}

type PlayKeyCard = Pick<Card, 'id' | 'name' | 'supertype' | 'textKey'>;

/**
 * The key deck requirements, ownership and wants count by: the name for Trainers and
 * Energy, name plus game text for Pokémon.
 */
export function playKey(card: PlayKeyCard): string {
	const name = deckNameKey(card.name);
	if (card.supertype !== 'Pokemon') return name;
	return `${name}#${card.textKey ?? card.id}`;
}

/** Copies owned per `playKey`, over every printing, finish and lot. */
export function ownedByPlayKey(
	collection: readonly { cardId: string; quantity: number }[],
	byId: ReadonlyMap<string, PlayKeyCard>
): Map<string, number> {
	const totals = new Map<string, number>();
	for (const row of collection) {
		const card = byId.get(row.cardId);
		if (!card) continue;
		const key = playKey(card);
		totals.set(key, (totals.get(key) ?? 0) + row.quantity);
	}
	return totals;
}

/**
 * What fills a want (`wantProgress`'s `poolOf`): every copy of the same playable card, in
 * any printing or finish. A want whose printing has left the catalogue can only be
 * filled by that printing in that finish.
 */
export function playPools(
	collection: readonly { cardId: string; variant: string; quantity: number }[],
	byId: ReadonlyMap<string, PlayKeyCard>
): (cardId: string, variant: string) => WantPool {
	const totals = ownedByPlayKey(collection, byId);
	return (cardId, variant) => {
		const card = byId.get(cardId);
		if (card) {
			const pool = playKey(card);
			return { pool, owned: totals.get(pool) ?? 0 };
		}
		const owned = collection
			.filter((row) => row.cardId === cardId && row.variant === variant)
			.reduce((sum, row) => sum + row.quantity, 0);
		return { pool: `${cardId}|${variant}`, owned };
	};
}
