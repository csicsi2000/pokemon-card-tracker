import type { CardWithSet, Supertype } from '../src/lib/database.types';
import { normalizeName } from '../src/lib/tcg/normalize';

let counter = 0;

export function makeCard(overrides: Partial<CardWithSet> & { name: string }): CardWithSet {
	const id = overrides.id ?? `set${++counter}-${counter}`;
	const setId = overrides.set_id ?? id.split('-')[0];

	return {
		id,
		set_id: setId,
		local_id: overrides.local_id ?? String(counter),
		name: overrides.name,
		name_normalized: normalizeName(overrides.name),
		supertype: (overrides.supertype ?? 'Pokemon') as Supertype,
		subtypes: overrides.subtypes ?? [],
		rarity: overrides.rarity ?? null,
		regulation_mark: overrides.regulation_mark ?? null,
		hp: overrides.hp ?? null,
		types: overrides.types ?? [],
		evolves_from: overrides.evolves_from ?? null,
		image_url: overrides.image_url ?? null,
		variants: overrides.variants ?? { normal: true },
		pricing: overrides.pricing ?? null,
		set: overrides.set ?? {
			id: setId,
			name: setId,
			ptcgl_code: setId.toUpperCase(),
			symbol_url: null,
			legal_standard: true,
			legal_expanded: true
		}
	};
}
