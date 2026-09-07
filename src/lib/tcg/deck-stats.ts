/**
 * A deck at a glance: how many Pokémon, Trainers and Energy, what kind of each, and a
 * few plain-language observations about the build.
 *
 * Pure functions over the same `DeckEntry[]` the legality check works on. Nothing here
 * is a rule — rules live in legality.ts — these are rules of thumb, so every threshold
 * scales with the deck's own size (a 40-card cube deck is not scolded for running fewer
 * Supporters than a 60-card Standard list) and every tip says why it fired.
 */
import type { Card, Supertype } from '$lib/types';
import type { FormatRules } from './format-rules';
import { isBasicEnergy, type DeckEntry } from './legality';
import { normalizeName } from './normalize';

export type Breakdown = { label: string; count: number };

export type DeckGroup = {
	supertype: Supertype;
	label: string;
	count: number;
	/** Share of the whole deck, 0–1. */
	share: number;
	/** Sub-counts in a fixed order, with the empty ones dropped. */
	breakdown: Breakdown[];
};

export type DeckStats = {
	total: number;
	/** Always three, in the order a decklist is written: Pokémon, Trainer, Energy. */
	groups: DeckGroup[];
	/** Copies you can open the game on — what the mulligan odds hang off. */
	basicPokemon: number;
	/** Distinct card names, and how many of those are a single copy (basic energy aside). */
	distinctNames: number;
	singleCopyNames: number;
	/**
	 * Energy types the Pokémon ask for, biggest first. Colorless takes any energy, so it
	 * is not counted as a type the deck has to supply.
	 */
	types: { type: string; count: number }[];
};

const SECTION_ORDER: Supertype[] = ['Pokemon', 'Trainer', 'Energy'];

const SECTION_LABEL: Record<Supertype, string> = {
	Pokemon: 'Pokémon',
	Trainer: 'Trainer',
	Energy: 'Energy'
};

const BUCKET_ORDER: Record<Supertype, string[]> = {
	Pokemon: ['Basic', 'Stage 1', 'Stage 2', 'Other'],
	Trainer: ['Supporter', 'Item', 'Tool', 'Stadium', 'Other'],
	Energy: ['Basic', 'Special']
};

/**
 * Can this card start the game on the bench? Modern cards say so in their subtypes; the
 * ones printed before subtypes existed are basic exactly when nothing evolves into them.
 * V-UNION is the odd one out: it has no stage but is assembled from the discard pile.
 */
export function isBasicPokemon(card: Card): boolean {
	if (card.supertype !== 'Pokemon') return false;
	if (card.subtypes.includes('V-UNION')) return false;
	if (card.subtypes.includes('Basic')) return true;
	return card.evolvesFrom === null && !card.subtypes.some((s) => s === 'Stage1' || s === 'Stage2');
}

function bucketOf(card: Card): string {
	switch (card.supertype) {
		case 'Pokemon':
			if (card.subtypes.includes('Stage2')) return 'Stage 2';
			if (card.subtypes.includes('Stage1')) return 'Stage 1';
			return isBasicPokemon(card) ? 'Basic' : 'Other';
		case 'Trainer':
			// A trainer carries at most one of these today; the order decides what a card
			// from a future set that carried two would be filed as.
			if (card.subtypes.includes('Supporter')) return 'Supporter';
			if (card.subtypes.includes('Stadium')) return 'Stadium';
			if (card.subtypes.includes('Tool')) return 'Tool';
			if (card.subtypes.includes('Item')) return 'Item';
			return 'Other';
		case 'Energy':
			return isBasicEnergy(card) ? 'Basic' : 'Special';
	}
}

export function deckStats(entries: DeckEntry[]): DeckStats {
	const total = entries.reduce((sum, entry) => sum + entry.quantity, 0);

	const buckets = new Map<Supertype, Map<string, number>>(
		SECTION_ORDER.map((supertype) => [supertype, new Map()])
	);
	const byName = new Map<string, { quantity: number; basicEnergy: boolean }>();
	const types = new Map<string, number>();
	let basicPokemon = 0;

	for (const { card, quantity } of entries) {
		const bucket = buckets.get(card.supertype);
		const key = bucketOf(card);
		if (bucket) bucket.set(key, (bucket.get(key) ?? 0) + quantity);

		const nameKey = normalizeName(card.name);
		const seen = byName.get(nameKey);
		if (seen) seen.quantity += quantity;
		else byName.set(nameKey, { quantity, basicEnergy: isBasicEnergy(card) });

		if (isBasicPokemon(card)) basicPokemon += quantity;

		if (card.supertype === 'Pokemon') {
			for (const type of card.types) {
				if (type !== 'Colorless') types.set(type, (types.get(type) ?? 0) + quantity);
			}
		}
	}

	const groups = SECTION_ORDER.map((supertype): DeckGroup => {
		const bucket = buckets.get(supertype) ?? new Map<string, number>();
		const count = [...bucket.values()].reduce((sum, value) => sum + value, 0);
		return {
			supertype,
			label: SECTION_LABEL[supertype],
			count,
			share: total === 0 ? 0 : count / total,
			breakdown: BUCKET_ORDER[supertype]
				.map((label) => ({ label, count: bucket.get(label) ?? 0 }))
				.filter((row) => row.count > 0)
		};
	});

	return {
		total,
		groups,
		basicPokemon,
		distinctNames: byName.size,
		singleCopyNames: [...byName.values()].filter((row) => !row.basicEnergy && row.quantity === 1)
			.length,
		types: [...types]
			.map(([type, count]) => ({ type, count }))
			.sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
	};
}

export type DeckTip = {
	id: string;
	tone: 'warn' | 'info';
	message: string;
};

/** Under this many cards a deck is still being assembled and every rule of thumb fires. */
export const MIN_TIP_SIZE = 30;

/**
 * Rules of thumb about the shape of the list. `rules` only decides which tips make
 * sense — a singleton cube should never be told to play four of anything, and deck size
 * is the legality check's job whenever a format has been chosen.
 */
export function deckTips(stats: DeckStats, rules?: FormatRules | null): DeckTip[] {
	if (stats.total < MIN_TIP_SIZE) return [];

	const count = (supertype: Supertype) =>
		stats.groups.find((group) => group.supertype === supertype)?.count ?? 0;
	const sub = (supertype: Supertype, label: string) =>
		stats.groups
			.find((group) => group.supertype === supertype)
			?.breakdown.find((row) => row.label === label)?.count ?? 0;

	// Thresholds are quoted per 60 cards and scaled to the deck actually in front of us.
	const scale = stats.total / 60;
	const per = (per60: number) => Math.max(1, Math.round(per60 * scale));

	const pokemon = count('Pokemon');
	const trainers = count('Trainer');
	const energy = count('Energy');
	const supporters = sub('Trainer', 'Supporter');

	const warn: DeckTip[] = [];
	const info: DeckTip[] = [];

	if (pokemon > 0 && stats.basicPokemon === 0) {
		warn.push({
			id: 'no-basics',
			tone: 'warn',
			message:
				'No Basic Pokémon. You need at least one in your opening hand to start the game, so this deck cannot be played as it stands.'
		});
	} else if (stats.basicPokemon > 0 && stats.basicPokemon < per(8)) {
		warn.push({
			id: 'few-basics',
			tone: 'warn',
			message: `Only ${stats.basicPokemon} Basic Pokémon — you will mulligan a lot. Around ${per(9)}–${per(12)} is the usual comfort zone.`
		});
	}

	if (supporters === 0 && trainers > 0) {
		warn.push({
			id: 'no-supporters',
			tone: 'warn',
			message:
				'No Supporters. Draw and search Supporters are how a deck refills its hand — most lists run eight or more.'
		});
	} else if (supporters > 0 && supporters < per(6)) {
		info.push({
			id: 'few-supporters',
			tone: 'info',
			message: `${supporters} Supporters is thin. ${per(8)}–${per(12)} draw and search Supporters is what keeps a deck from stalling on a dead hand.`
		});
	}

	if (trainers < per(20)) {
		info.push({
			id: 'few-trainers',
			tone: 'info',
			message: `${trainers} Trainer cards. Modern decks lean on Trainers heavily — ${per(25)}–${per(35)} is common, and they are usually what makes a deck consistent.`
		});
	}

	if (energy === 0 && pokemon > 0) {
		info.push({
			id: 'no-energy',
			tone: 'info',
			message:
				'No Energy cards. That only works if your attackers cost nothing, or you fetch energy from the discard or the deck some other way.'
		});
	} else if (energy > per(18)) {
		info.push({
			id: 'much-energy',
			tone: 'info',
			message: `${energy} Energy is a lot of the deck. Unless you are deliberately accelerating it into play, ${per(10)}–${per(14)} plus a way to search leaves more room for Trainers.`
		});
	}

	if (!rules?.singleton && stats.singleCopyNames >= per(8)) {
		info.push({
			id: 'many-singles',
			tone: 'info',
			message: `${stats.singleCopyNames} cards are single copies. You draw what you play multiples of — three or four of anything you actually want to see beats a wide spread of one-ofs.`
		});
	}

	if (stats.types.length >= 3) {
		info.push({
			id: 'wide-types',
			tone: 'info',
			message: `Your Pokémon span ${stats.types.length} energy types (${stats.types.map((row) => row.type).join(', ')}). Expect awkward hands unless you have energy search or acceleration to cover them.`
		});
	}

	// Deck size is the legality check's business once a format is set; this is for the
	// decks that never got one.
	if (!rules && stats.total !== 60) {
		info.push({
			id: 'not-sixty',
			tone: 'info',
			message: `${stats.total} cards. A constructed deck is exactly 60 — pick a format above to have Cardex check the rest of the rules too.`
		});
	}

	return [...warn, ...info];
}
