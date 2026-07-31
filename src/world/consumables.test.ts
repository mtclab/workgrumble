/**
 * The desk, tested at both ends of every window.
 *
 * The energy drink is a bargain with a bill attached, and a bargain nobody can
 * predict is a punishment. So: the buff shrinks and the crash grows with every
 * can in the run, both are bounded, the run ends when the window does, and the
 * phase at every boundary minute is asserted rather than assumed - an
 * off-by-one here is a player whose hands go one minute before the can was
 * supposed to wear off.
 */

import { describe, expect, it } from 'vitest';

import {
  BEER_TOOLTIP,
  BUFF_TICKS,
  buffTicks,
  CRASH_FUMBLE_THRESHOLD,
  CRASH_STRESS,
  CRASH_TICKS,
  crashEndsAt,
  crashStartsAt,
  crashStress,
  crashTicks,
  DRINK_PRICE_PENCE,
  type DrinkState,
  drinkPhase,
  drinkState,
  fumbleLimit,
  isFumblingWith,
  MAX_TOLERANCE,
  MIN_BUFF_TICKS,
  nextTolerance,
  NO_RUN,
  TOLERANCE_WINDOW_TICKS,
} from './consumables';
import { FUMBLE_THRESHOLD, METER_CEILING } from './meters';

const NO_CAN: DrinkState = { startedAt: null, tolerance: 0 };

function run(startedAt: number, tolerance = 1): DrinkState {
  return { startedAt, tolerance };
}

describe('one can', () => {
  it('costs money and buys a window', () => {
    expect(DRINK_PRICE_PENCE).toBeGreaterThan(0);
    expect(buffTicks(1)).toBe(BUFF_TICKS);
    expect(crashTicks(1)).toBe(CRASH_TICKS);
    expect(crashStress(1)).toBe(CRASH_STRESS);
  });

  it('is wired, then paying for it, then neither', () => {
    const state = run(100);
    const crashAt = crashStartsAt(100, 1);
    const overAt = crashEndsAt(100, 1);

    expect(drinkPhase(state, 100)).toBe('buff');
    expect(drinkPhase(state, crashAt - 1)).toBe('buff');
    expect(drinkPhase(state, crashAt)).toBe('crash');
    expect(drinkPhase(state, overAt - 1)).toBe('crash');
    expect(drinkPhase(state, overAt)).toBe('none');
  });

  it('is nothing at all when nobody has opened one', () => {
    expect(drinkPhase(NO_CAN, 500)).toBe('none');
    // A clock that has gone backwards under a run - an older save loaded over
    // a newer session - is not a run this minute belongs to.
    expect(drinkPhase(run(500), 100)).toBe('none');
  });

  it('refuses a minute that is not one', () => {
    expect(() => drinkPhase(run(10), -1)).toThrow(TypeError);
    expect(() => drinkPhase(run(10), 1.5)).toThrow(TypeError);
    expect(() => crashStartsAt(-2, 1)).toThrow(TypeError);
  });
});

describe('tolerance', () => {
  it('counts a second can inside the window as part of the run', () => {
    const state = run(100, 1);

    expect(nextTolerance(state, 100 + TOLERANCE_WINDOW_TICKS)).toBe(2);
    expect(nextTolerance(state, 100 + TOLERANCE_WINDOW_TICKS + 1)).toBe(1);
    expect(nextTolerance(NO_CAN, 900)).toBe(1);
  });

  it('stops counting somewhere, rather than climbing forever', () => {
    const deep = run(100, MAX_TOLERANCE);

    expect(nextTolerance(deep, 110)).toBe(MAX_TOLERANCE);
    expect(buffTicks(MAX_TOLERANCE + 9)).toBe(buffTicks(MAX_TOLERANCE));
    expect(crashStress(MAX_TOLERANCE + 9)).toBe(crashStress(MAX_TOLERANCE));
  });

  /** The whole bargain: each extra can buys less and costs more. */
  it('makes every extra can a weaker buff and a harder crash', () => {
    for (let cans = 1; cans < MAX_TOLERANCE; cans += 1) {
      expect(buffTicks(cans + 1)).toBeLessThan(buffTicks(cans));
      expect(crashTicks(cans + 1)).toBeGreaterThan(crashTicks(cans));
      expect(crashStress(cans + 1)).toBeGreaterThan(crashStress(cans));
    }

    expect(buffTicks(MAX_TOLERANCE)).toBeGreaterThanOrEqual(MIN_BUFF_TICKS);
  });

  it('never lets the buff shrink away to nothing', () => {
    expect(buffTicks(99)).toBe(MIN_BUFF_TICKS);
    expect(buffTicks(0)).toBe(BUFF_TICKS);
  });
});

describe('what it does to the hands', () => {
  /**
   * "Fumble suppressed" and "higher stress ceiling" are one number, not two
   * rules that could disagree: while the can is working the line the hands go
   * at is above the top of the meter, so no amount of queue reaches it.
   */
  it('puts the fumble line out of reach while the can is working', () => {
    expect(fumbleLimit('buff')).toBeGreaterThan(METER_CEILING);
    expect(isFumblingWith(METER_CEILING, 'buff')).toBe(false);
    expect(isFumblingWith(METER_CEILING, 'none')).toBe(true);
  });

  it('drops it below normal while the crash is on', () => {
    expect(fumbleLimit('crash')).toBe(CRASH_FUMBLE_THRESHOLD);
    expect(fumbleLimit('none')).toBe(FUMBLE_THRESHOLD);
    expect(isFumblingWith(CRASH_FUMBLE_THRESHOLD + 1, 'crash')).toBe(true);
    expect(isFumblingWith(CRASH_FUMBLE_THRESHOLD, 'crash')).toBe(false);
    // The same stress, with nothing in your blood, is a perfectly good day.
    expect(isFumblingWith(CRASH_FUMBLE_THRESHOLD + 1, 'none')).toBe(false);
  });
});

describe('reading the desk off the graph', () => {
  it('reads a run, and reads the absence of one', () => {
    expect(drinkState(120, 2)).toEqual({ startedAt: 120, tolerance: 2 });
    expect(drinkState(NO_RUN, 3)).toEqual({ startedAt: null, tolerance: 0 });
    expect(drinkState(undefined, undefined))
      .toEqual({ startedAt: null, tolerance: 0 });
    expect(drinkState('half past', 1))
      .toEqual({ startedAt: null, tolerance: 0 });
    expect(drinkState(120, 'two')).toEqual({ startedAt: 120, tolerance: 0 });
  });
});

describe('the beer', () => {
  it('says why it is locked, in words, without being told', () => {
    expect(BEER_TOOLTIP).toContain('probation');
  });
});
