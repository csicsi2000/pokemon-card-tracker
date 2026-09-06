import { describe, expect, it } from 'vitest';
import { APPEARANCE_COLORS, isAppearanceColor, normalizeIcon } from '../src/lib/data/appearance';

describe('appearance', () => {
	it('recognises palette colours and nothing else', () => {
		for (const colour of APPEARANCE_COLORS) expect(isAppearanceColor(colour)).toBe(true);
		expect(isAppearanceColor('crimson')).toBe(false);
		expect(isAppearanceColor('#ff0000')).toBe(false);
		expect(isAppearanceColor(null)).toBe(false);
	});

	it('normalizeIcon keeps one user-perceived character', () => {
		expect(normalizeIcon('🔥')).toBe('🔥');
		expect(normalizeIcon('  🔥 hot  ')).toBe('🔥');
		// Multi-code-point emoji stay whole: a flag, a skin tone, a ZWJ family.
		expect(normalizeIcon('🇨🇭 swiss')).toBe('🇨🇭');
		expect(normalizeIcon('👍🏽')).toBe('👍🏽');
		expect(normalizeIcon('👨‍👩‍👧')).toBe('👨‍👩‍👧');
		expect(normalizeIcon('AB')).toBe('A');
	});

	it('normalizeIcon treats blank input as no icon', () => {
		expect(normalizeIcon('')).toBeNull();
		expect(normalizeIcon('   ')).toBeNull();
		expect(normalizeIcon(null)).toBeNull();
		expect(normalizeIcon(undefined)).toBeNull();
	});
});
