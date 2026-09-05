import { describe, expect, it } from 'vitest';
import {
	parseStoredToken,
	parseTokenFragment,
	tokenUsable,
	TOKEN_MARGIN_MS
} from '../src/lib/sync/google-token';

const NOW = 1_700_000_000_000;

describe('stored Google token', () => {
	it('is usable while it has more than the safety margin left', () => {
		expect(tokenUsable({ value: 'ya29.x', expiresAt: NOW + TOKEN_MARGIN_MS + 1 }, NOW)).toBe(true);
		expect(tokenUsable({ value: 'ya29.x', expiresAt: NOW + TOKEN_MARGIN_MS }, NOW)).toBe(false);
		expect(tokenUsable({ value: '', expiresAt: NOW + 3_600_000 }, NOW)).toBe(false);
		expect(tokenUsable(null, NOW)).toBe(false);
	});

	it('round-trips through storage and drops expired or broken records', () => {
		const fresh = { value: 'ya29.fresh', expiresAt: NOW + 3_600_000 };
		expect(parseStoredToken(JSON.stringify(fresh), NOW)).toEqual(fresh);
		expect(parseStoredToken(JSON.stringify({ value: 'old', expiresAt: NOW - 1 }), NOW)).toBeNull();
		expect(parseStoredToken('not json', NOW)).toBeNull();
		expect(parseStoredToken('{"value":"x"}', NOW)).toBeNull();
		expect(parseStoredToken(null, NOW)).toBeNull();
	});
});

describe('OAuth redirect fragment', () => {
	it('reads a token and its lifetime', () => {
		const result = parseTokenFragment(
			'#state=abc&access_token=ya29.t&token_type=Bearer&expires_in=3599',
			NOW
		);
		expect(result).toEqual({
			ok: true,
			state: 'abc',
			token: { value: 'ya29.t', expiresAt: NOW + 3599 * 1000 }
		});
	});

	it('falls back to an hour when the lifetime is missing or nonsense', () => {
		const missing = parseTokenFragment('#access_token=t', NOW);
		const junk = parseTokenFragment('#access_token=t&expires_in=soon', NOW);
		for (const result of [missing, junk]) {
			expect(result.ok).toBe(true);
			if (result.ok) expect(result.token.expiresAt).toBe(NOW + 3_600_000);
		}
	});

	it('surfaces the error Google sends when the user has to act', () => {
		expect(parseTokenFragment('#error=interaction_required&state=abc', NOW)).toEqual({
			ok: false,
			error: 'interaction_required',
			state: 'abc'
		});
		expect(
			parseTokenFragment('#error=access_denied&error_description=No%20consent&state=s', NOW)
		).toEqual({ ok: false, error: 'No consent', state: 's' });
		expect(parseTokenFragment('', NOW)).toEqual({
			ok: false,
			error: 'Google did not return a token',
			state: null
		});
	});
});
