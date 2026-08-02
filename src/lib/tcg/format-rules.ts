import { z } from 'zod';

/**
 * A custom play format. Covers the built-in-ish cases (Standard/Expanded are just a
 * pool type) and the ones this app exists for: Cube (an explicit pool, usually
 * singleton) and house formats with their own banlist and deck size.
 */
export const formatRulesSchema = z.object({
	deckSize: z
		.object({ min: z.number().int().min(1), max: z.number().int().min(1) })
		.default({ min: 60, max: 60 }),
	maxCopiesPerName: z.number().int().min(1).default(4),
	/** Basic energy is exempt from the copy limit in every official format. */
	basicEnergyExempt: z.boolean().default(true),
	/** Cube-style: at most one copy of each name, regardless of maxCopiesPerName. */
	singleton: z.boolean().default(false),
	pool: z
		.object({
			type: z.enum(['all', 'standard', 'expanded', 'sets', 'explicit']).default('all'),
			/** Only for type 'sets': the sets a deck may draw from. */
			setIds: z.array(z.string()).default([])
		})
		.default({ type: 'all', setIds: [] }),
	/** Banned card names. Bans apply per name, so every printing is covered. */
	bannedNames: z.array(z.string()).default([])
});

export type FormatRules = z.infer<typeof formatRulesSchema>;

export const DEFAULT_RULES: FormatRules = formatRulesSchema.parse({});

export function parseRules(value: unknown): FormatRules {
	const result = formatRulesSchema.safeParse(value ?? {});
	return result.success ? result.data : DEFAULT_RULES;
}

/** Ready-made starting points offered in the "new format" dialog. */
export const RULE_PRESETS: { id: string; name: string; description: string; rules: FormatRules }[] = [
	{
		id: 'standard',
		name: 'Standard',
		description: '60 cards, 4 copies per name, current Standard-legal sets.',
		rules: parseRules({ pool: { type: 'standard' } })
	},
	{
		id: 'expanded',
		name: 'Expanded',
		description: '60 cards, 4 copies per name, Black & White onwards.',
		rules: parseRules({ pool: { type: 'expanded' } })
	},
	{
		id: 'cube',
		name: 'Cube',
		description: 'Singleton deck built from a hand-picked card pool.',
		rules: parseRules({
			deckSize: { min: 40, max: 60 },
			maxCopiesPerName: 1,
			singleton: true,
			basicEnergyExempt: true,
			pool: { type: 'explicit' }
		})
	},
	{
		id: 'open',
		name: 'Anything goes',
		description: 'Every card ever printed, 4 copies per name.',
		rules: DEFAULT_RULES
	}
];
