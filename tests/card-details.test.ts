import { describe, expect, it } from 'vitest';
import { repairText } from '../src/lib/card-details';

describe('repairText', () => {
	it('repairs UTF-8 that was decoded as Latin-1', () => {
		// What TCGdex serves for modern cards: é (bytes C3 A9) read as two Latin-1
		// characters, Ã (U+00C3) then © (U+00A9).
		expect(repairText('PokÃ©mon')).toBe('Pokémon');
		// A non-breaking space (C2 A0) mangled the same way.
		expect(repairText('BasicÂ Energy')).toBe('Basic Energy');
	});

	it('leaves correct text alone', () => {
		expect(repairText('Pokémon')).toBe('Pokémon');
		expect(repairText('Draw a card.')).toBe('Draw a card.');
		expect(repairText("Lysandre's Trump Card")).toBe("Lysandre's Trump Card");
	});

	it('leaves text with no suspicious characters untouched', () => {
		const plain = 'This attack does 30 more damage for each Prize card.';
		expect(repairText(plain)).toBe(plain);
	});

	it('gives up rather than mangling byte pairs that are not valid UTF-8', () => {
		// "Â" then a real space is C2 20 — no continuation byte, so not mojibake.
		expect(repairText('BasicÂ Energy')).toBe('BasicÂ Energy');
		expect(repairText('Ã')).toBe('Ã');
		// Genuine text that merely contains Ã.
		expect(repairText('SÃO PAULO')).toBe('SÃO PAULO');
	});

	it('is idempotent, so repairing twice does no harm', () => {
		expect(repairText(repairText('PokÃ©mon'))).toBe('Pokémon');
	});
});
