import { describe, expect, it } from 'vitest';
import { createClock } from '../src/lib/data/clock';
import { makeBattleLog, makeUserData } from './data-helpers';

describe('createClock', () => {
	it('ticks past timestamps it observes, battle logs included', () => {
		const clock = createClock(() => Date.parse('2026-01-01T00:00:00.000Z'));
		clock.observe(
			makeUserData({ battleLogs: [makeBattleLog({ id: 'l1', updatedAt: '2026-01-02T00:00:00.000Z' })] })
		);
		expect(clock.next() > '2026-01-02T00:00:00.000Z').toBe(true);
	});
});
