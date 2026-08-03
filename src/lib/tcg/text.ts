/**
 * Card text repair, shared by the build script (which cleans text before writing it)
 * and the app (which cleans anything still coming from the live API).
 *
 * Dependency-free on purpose: the build script imports this directly, so it must not
 * pull in anything from SvelteKit.
 */

/**
 * TCGdex serves some newer cards' text as UTF-8 that was decoded as Latin-1, so
 * "Pokémon" arrives as "PokÃ©mon". Re-encoding the characters back to bytes and
 * decoding them as UTF-8 undoes it. Only safe when every character fits in a byte,
 * and the strict decoder rejects anything that was not mojibake to begin with —
 * which is what keeps genuine text containing "Ã" intact.
 */
export function repairText(value: string): string {
	if (!/[ÃÂ]/.test(value)) return value;

	const bytes = new Uint8Array(value.length);
	for (let i = 0; i < value.length; i++) {
		const code = value.charCodeAt(i);
		if (code > 0xff) return value;
		bytes[i] = code;
	}

	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return value;
	}
}

/** Repaired string, or null when there was nothing usable there. */
export const cleanText = (value: unknown): string | null =>
	typeof value === 'string' && value.trim() ? repairText(value) : null;
