/**
 * The pressure layer, source by source and edge by edge.
 *
 * Every rate is asserted on its own and then in combination, and both ends of
 * both meters are driven onto the floor and the ceiling - the arithmetic that
 * applies these lives in Rust behind a clamp, and this is the half that
 * decides HOW MUCH. A meter suite that only checks the middle of the range is
 * a suite that passes while a stress bar reads 140.
 */

import { describe, expect, it } from 'vitest';

import {
  applyDeltas,
  clampMeter,
  COMFORTABLE_QUEUE,
  DEFAULT_SLACK_RATE,
  FUMBLE_THRESHOLD,
  fumbleThreshold,
  isFumbling,
  isMeterTick,
  isRefocusing,
  METER_CEILING,
  METER_FLOOR,
  METER_INTERVAL_TICKS,
  type MeterDeltas,
  meterDeltas,
  type MeterInputs,
  type MeterState,
  movesAnything,
  REFOCUS_FUMBLE_DROP,
  REFOCUS_TICKS,
  REPUTATION_PER_BREACH,
  slackRate,
  STARTING_REPUTATION,
  STRESS_LUNCH_RELIEF,
  STRESS_PER_BREACH,
  STRESS_PER_EXCESS_TICKET,
  SUSPICION_CLEAN_DRAIN,
} from './meters';

const QUIET: MeterInputs = {
  openTickets: 0,
  breachedTickets: 0,
  breachesCharged: 0,
  resolveCredit: 0,
  resolveCreditPaid: 0,
  openSlackApps: [],
  focusedSlackApp: null,
  lunch: false,
};

/** On screen AND in front of the player: the shape of one window, open. */
function inFrontOf(appId: string): Partial<MeterInputs> {
  return { openSlackApps: [appId], focusedSlackApp: appId };
}

function deltas(overrides: Partial<MeterInputs> = {}): MeterDeltas {
  return meterDeltas({ ...QUIET, ...overrides });
}

const FRESH: MeterState = {
  stress: 0,
  suspicion: 0,
  reputation: STARTING_REPUTATION,
  suspicionEvents: 0,
  breachesCharged: 0,
  resolveCreditPaid: 0,
};

describe('stress', () => {
  it('costs nothing while the queue is one you can hold in your head', () => {
    expect(deltas({ openTickets: COMFORTABLE_QUEUE }).stressUp).toBe(0);
    expect(deltas({ openTickets: 0 }).stressUp).toBe(0);
  });

  it('charges for every ticket past that, one at a time', () => {
    expect(deltas({ openTickets: COMFORTABLE_QUEUE + 1 }).stressUp)
      .toBe(STRESS_PER_EXCESS_TICKET);
    expect(deltas({ openTickets: COMFORTABLE_QUEUE + 4 }).stressUp)
      .toBe(STRESS_PER_EXCESS_TICKET * 4);
  });

  /** A missed deadline arrives all at once, because that is how it feels. */
  it('lands a breach as a lump, once', () => {
    expect(deltas({ breachedTickets: 1 }).stressUp).toBe(STRESS_PER_BREACH);
    expect(deltas({ breachedTickets: 3 }).stressUp).toBe(STRESS_PER_BREACH * 3);

    // Already billed for two of the three.
    expect(deltas({ breachedTickets: 3, breachesCharged: 2 }).stressUp)
      .toBe(STRESS_PER_BREACH);
    expect(deltas({ breachedTickets: 3, breachesCharged: 3 }).stressUp).toBe(0);
  });

  it('drains while something restful is genuinely on screen', () => {
    const one = deltas(inFrontOf('bubbles'));
    expect(one.stressDown).toBe(slackRate('bubbles').stressRelief);
  });

  /**
   * Relief is about what the player is DOING; suspicion is about what a man
   * walking past can see. A second window behind the ticket queue used to
   * double the medicine while the work carried on in front of it, which made
   * the safest thing to do with the boss key the opposite of what it is for.
   */
  it('gives nothing back for a window the player is not in', () => {
    const background = deltas({
      openSlackApps: ['browser', 'bubbles'],
      focusedSlackApp: null,
    });

    expect(background.stressDown).toBe(0);
    expect(background.suspicionUp).toBe(
      slackRate('browser').suspicion + slackRate('bubbles').suspicion,
    );
    expect(background.suspicionEvent).toBe(true);

    // And two open, one focused: charged for both, soothed by one.
    const working = deltas({
      openSlackApps: ['browser', 'bubbles'],
      focusedSlackApp: 'bubbles',
    });

    expect(working.stressDown).toBe(slackRate('bubbles').stressRelief);
    expect(working.suspicionUp).toBe(background.suspicionUp);
  });

  /** The safe window: the drain doubles and nobody is walking past. */
  it('doubles the drain at lunch and throws in the half hour itself', () => {
    const lunch = deltas({ ...inFrontOf('bubbles'), lunch: true });

    expect(lunch.stressDown)
      .toBe(slackRate('bubbles').stressRelief * 2 + STRESS_LUNCH_RELIEF);
    expect(deltas({ lunch: true }).stressDown).toBe(STRESS_LUNCH_RELIEF);
  });

  it('rates an app nobody has rated at the house rate', () => {
    expect(slackRate('a-game-nobody-wrote-down')).toEqual(DEFAULT_SLACK_RATE);
  });
});

describe('suspicion', () => {
  it('rises only while something is on screen, per app', () => {
    expect(deltas({ openSlackApps: ['bubbles'] }).suspicionUp)
      .toBe(slackRate('bubbles').suspicion);
    expect(deltas({ openSlackApps: ['bubbles', 'bubbles'] }).suspicionUp)
      .toBe(slackRate('bubbles').suspicion * 2);
    expect(deltas().suspicionUp).toBe(0);
  });

  /**
   * Lunch is the tutorial. The boss is not patrolling, so a game on screen at
   * half twelve costs nothing - which is the lesson the whole mechanic is
   * trying to teach before it starts charging for it.
   */
  it('costs nothing at lunch, however visible the screen is', () => {
    const lunch = deltas({ ...inFrontOf('bubbles'), lunch: true });

    expect(lunch.suspicionUp).toBe(0);
    expect(lunch.suspicionEvent).toBe(false);
    expect(lunch.suspicionDown).toBe(SUSPICION_CLEAN_DRAIN);
  });

  it('bleeds away over clean work and not otherwise', () => {
    expect(deltas().suspicionDown).toBe(SUSPICION_CLEAN_DRAIN);
    expect(deltas({ openSlackApps: ['bubbles'] }).suspicionDown).toBe(0);
  });

  /** The scorecard counts the minutes, not the meter: a drained meter lies. */
  it('marks an interval the review would count', () => {
    expect(deltas({ openSlackApps: ['bubbles'] }).suspicionEvent).toBe(true);
    expect(deltas().suspicionEvent).toBe(false);
  });
});

describe('reputation', () => {
  it('pays for what has been closed, minus what has been paid already', () => {
    expect(deltas({ resolveCredit: 5 }).reputationUp).toBe(5);
    expect(deltas({ resolveCredit: 5, resolveCreditPaid: 5 }).reputationUp)
      .toBe(0);
    expect(deltas({ resolveCredit: 9, resolveCreditPaid: 5 }).reputationUp)
      .toBe(4);
  });

  it('bills a breach once and never again', () => {
    expect(deltas({ breachedTickets: 2 }).reputationDown)
      .toBe(REPUTATION_PER_BREACH * 2);
    expect(deltas({ breachedTickets: 2, breachesCharged: 2 }).reputationDown)
      .toBe(0);
  });

  /**
   * A watermark that ran backwards - a ticket un-breaching, a save from an
   * older day - must not turn into a refund.
   */
  it('never pays out for history running backwards', () => {
    const backwards = deltas({
      breachedTickets: 1,
      breachesCharged: 4,
      resolveCredit: 1,
      resolveCreditPaid: 8,
    });

    expect(backwards.reputationUp).toBe(0);
    expect(backwards.reputationDown).toBe(0);
    expect(backwards.stressUp).toBe(0);
  });
});

describe('applying the deltas', () => {
  it('clamps to the floor and the ceiling, at both ends', () => {
    expect(clampMeter(METER_FLOOR - 40)).toBe(METER_FLOOR);
    expect(clampMeter(METER_CEILING + 40)).toBe(METER_CEILING);
    expect(clampMeter(50)).toBe(50);
  });

  /**
   * Add then clamp, subtract then clamp - in that order. One step instead
   * would let a hit of 30 against a meter at 95 come back DOWN through the
   * ceiling and land at 65, making the ceiling a place a value passes through
   * rather than one it stops at.
   */
  it('stops at the ceiling rather than passing through it', () => {
    const near: MeterState = { ...FRESH, stress: 95 };
    const next = applyDeltas(near, deltas({ breachedTickets: 3 }));

    expect(next.stress).toBe(METER_CEILING);
  });

  it('cannot push a meter below the floor', () => {
    const next = applyDeltas(FRESH, deltas(inFrontOf('bubbles')));

    expect(next.stress).toBe(METER_FLOOR);
    expect(next.suspicion).toBe(slackRate('bubbles').suspicion);
  });

  it('carries the watermarks and the suspicious-minute count', () => {
    const next = applyDeltas(FRESH, deltas({
      breachedTickets: 2,
      resolveCredit: 3,
      ...inFrontOf('bubbles'),
    }));

    expect(next.breachesCharged).toBe(2);
    expect(next.resolveCreditPaid).toBe(3);
    expect(next.suspicionEvents).toBe(1);
  });

  /**
   * The reason `movesAnything` reads the watermarks and not just the meters: a
   * breach landing while stress is pinned at 100 moves nothing visible, and
   * skipping the dispatch would leave it uncharged to be billed all over again
   * the next time the meters had room.
   */
  it('still dispatches when only the watermark would move', () => {
    const pinned: MeterState = {
      ...FRESH,
      stress: METER_CEILING,
      reputation: METER_FLOOR,
      suspicion: METER_FLOOR,
    };
    const breach = deltas({ breachedTickets: 1 });

    expect(applyDeltas(pinned, breach).stress).toBe(METER_CEILING);
    expect(applyDeltas(pinned, breach).reputation).toBe(METER_FLOOR);
    expect(movesAnything(pinned, breach)).toBe(true);
  });

  it('skips an interval in which genuinely nothing happens', () => {
    expect(movesAnything(FRESH, deltas())).toBe(false);
    expect(movesAnything({ ...FRESH, suspicion: 4 }, deltas())).toBe(true);
  });
});

describe('the cadence and the fumble line', () => {
  it('fires on the interval and nowhere between', () => {
    expect(isMeterTick(0)).toBe(true);
    expect(isMeterTick(METER_INTERVAL_TICKS)).toBe(true);
    expect(isMeterTick(METER_INTERVAL_TICKS * 12)).toBe(true);
    expect(isMeterTick(METER_INTERVAL_TICKS - 1)).toBe(false);
    expect(isMeterTick(-METER_INTERVAL_TICKS)).toBe(false);
    expect(isMeterTick(1.5)).toBe(false);
  });

  it('starts fumbling above the line and not on it', () => {
    expect(isFumbling(FUMBLE_THRESHOLD)).toBe(false);
    expect(isFumbling(FUMBLE_THRESHOLD + 1)).toBe(true);
    expect(isFumbling(0)).toBe(false);
    expect(isFumbling(METER_CEILING)).toBe(true);
  });
});

/**
 * The debuff the research is named after: for a short window after an
 * interruption that had nothing to do with the work in hand, the line the
 * hands go at is lower. It is one field with an expiry and two pure functions,
 * and it is deliberately not a state the player can manage.
 */
describe('finding your place again', () => {
  it('lowers the line while the window is open and puts it back after', () => {
    expect(fumbleThreshold(false)).toBe(FUMBLE_THRESHOLD);
    expect(fumbleThreshold(true)).toBe(FUMBLE_THRESHOLD - REFOCUS_FUMBLE_DROP);
    expect(REFOCUS_FUMBLE_DROP).toBeGreaterThan(0);
  });

  it('makes a stress that was fine a minute ago the stress that fumbles', () => {
    const fine = FUMBLE_THRESHOLD - REFOCUS_FUMBLE_DROP + 1;

    expect(isFumbling(fine)).toBe(false);
    expect(isFumbling(fine, true)).toBe(true);
    // And the line still exists: a debuff is not "always fumbling".
    expect(isFumbling(FUMBLE_THRESHOLD - REFOCUS_FUMBLE_DROP, true)).toBe(false);
  });

  it('runs for the twenty-three minutes the research measured', () => {
    const started = 400;
    const until = started + REFOCUS_TICKS;

    expect(REFOCUS_TICKS).toBe(23);
    expect(isRefocusing(until, started)).toBe(true);
    expect(isRefocusing(until, until - 1)).toBe(true);
    expect(isRefocusing(until, until)).toBe(false);
    expect(isRefocusing(until, until + 1)).toBe(false);
  });

  it('reads an absent or nonsense field as "no", which is most players', () => {
    expect(isRefocusing(undefined, 100)).toBe(false);
    expect(isRefocusing(null, 100)).toBe(false);
    expect(isRefocusing('soon', 100)).toBe(false);
    expect(isRefocusing(1.5, 100)).toBe(false);
    expect(isRefocusing(200, 1.5)).toBe(false);
  });

  it('never puts the line below the bottom of the meter', () => {
    expect(fumbleThreshold(true)).toBeGreaterThanOrEqual(METER_FLOOR);
  });
});

describe('inputs the world could not have produced', () => {
  it.each([
    ['openTickets', { openTickets: -1 }],
    ['breachedTickets', { breachedTickets: 1.5 }],
    ['breachesCharged', { breachesCharged: -3 }],
    ['resolveCredit', { resolveCredit: Number.NaN }],
    ['resolveCreditPaid', { resolveCreditPaid: -1 }],
  ])('refuses a %s that is not a count', (_name, override) => {
    expect(() => deltas(override)).toThrow(TypeError);
  });
});
