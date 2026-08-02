/**
 * Parser for the PTCGL / pkmn.gg / Limitless decklist text format:
 *
 *   Pokémon: 2
 *   1 Charizard null 1
 *   2 Charmander PR-SW 92
 *
 *   Total Cards: 3
 *
 * Pure and dependency-free so it can be unit tested and reused by the MCP server.
 * Resolving entries to actual card ids is a separate step — see resolver.ts.
 */
import type { Supertype } from '$lib/database.types';

export type ParsedEntry = {
	quantity: number;
	name: string;
	/** PTCGL set code, or null when the export wrote "null" / omitted it. */
	setCode: string | null;
	/** Collector number as printed; text because promos use ids like "SWSH050". */
	number: string | null;
	/** Section the line appeared under, when the list had section headers. */
	section: Supertype | null;
	lineNumber: number;
	raw: string;
};

export type ParsedList = {
	entries: ParsedEntry[];
	/** Value of the trailing "Total Cards: N" line, if present. */
	declaredTotal: number | null;
	/** Total quantity actually parsed. */
	total: number;
	warnings: string[];
};

const SECTION_HEADER = /^(pok[eé]mon|trainer|energy)(?:\s+cards?)?\s*:\s*(\d+)?\s*$/i;
const TOTAL_LINE = /^total\s+cards?\s*:\s*(\d+)\s*$/i;
const QUANTITY_LINE = /^(\d+)\s*x?\s+(.*)$/i;
/** Trailing foil/print markers some exports append after the collector number. */
const PRINT_MARKER = /\s+(ph|rh|h|f)$/i;

const SECTIONS: Record<string, Supertype> = {
	pokemon: 'Pokemon',
	pokémon: 'Pokemon',
	trainer: 'Trainer',
	energy: 'Energy'
};

/**
 * Uppercase words that end card names ("Charizard VMAX"). Without this they would be
 * mistaken for a set code on a line that omits set information.
 */
const NAME_SUFFIXES = new Set([
	'V',
	'VMAX',
	'VSTAR',
	'GX',
	'EX',
	'BREAK',
	'LEGEND',
	'PRIME',
	'STAR',
	'TAG'
]);

function splitSetAndNumber(rest: string): { name: string; setCode: string | null; number: string | null } {
	const match = rest.match(/^(.*?)\s+(null|[A-Za-z0-9][A-Za-z0-9-]{0,7})\s+([A-Za-z0-9-]+)$/);
	if (!match) return { name: rest, setCode: null, number: null };

	const [, name, code, number] = match;

	// A collector number always contains a digit; a set code is "null" or upper-case.
	const numberLooksReal = /\d/.test(number);
	const codeLooksReal = code.toLowerCase() === 'null' || (code === code.toUpperCase() && !NAME_SUFFIXES.has(code));

	if (!name || !numberLooksReal || !codeLooksReal) {
		return { name: rest, setCode: null, number: null };
	}

	return {
		name: name.trim(),
		setCode: code.toLowerCase() === 'null' ? null : code.toUpperCase(),
		number
	};
}

export function parseDecklist(input: string): ParsedList {
	const entries: ParsedEntry[] = [];
	const warnings: string[] = [];
	let section: Supertype | null = null;
	let declaredTotal: number | null = null;

	const lines = input.split(/\r?\n/);

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		const line = raw.trim();
		if (!line || line.startsWith('#') || line.startsWith('//')) continue;

		const total = line.match(TOTAL_LINE);
		if (total) {
			declaredTotal = Number(total[1]);
			continue;
		}

		const header = line.match(SECTION_HEADER);
		if (header) {
			section = SECTIONS[header[1].toLowerCase()] ?? null;
			continue;
		}

		const quantityMatch = line.match(QUANTITY_LINE);
		if (!quantityMatch) {
			warnings.push(`Line ${i + 1}: could not read "${line}"`);
			continue;
		}

		const quantity = Number(quantityMatch[1]);
		const rest = quantityMatch[2].replace(PRINT_MARKER, '').trim();
		if (!rest) {
			warnings.push(`Line ${i + 1}: missing card name`);
			continue;
		}

		entries.push({
			quantity,
			...splitSetAndNumber(rest),
			section,
			lineNumber: i + 1,
			raw: line
		});
	}

	const parsedTotal = entries.reduce((sum, entry) => sum + entry.quantity, 0);
	if (declaredTotal !== null && declaredTotal !== parsedTotal) {
		warnings.push(`List says ${declaredTotal} cards but ${parsedTotal} were parsed.`);
	}

	return { entries, declaredTotal, total: parsedTotal, warnings };
}
