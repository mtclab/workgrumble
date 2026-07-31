/**
 * Friday: the review, the beer and the end of the week, driven through the
 * shipped driver against the shipped engine.
 *
 * Both outcomes are played rather than described. The threshold is enforced in
 * the guards of the two review verbs, so the only honest way to test it is to
 * put the world on each side of it and let the day arrive at three o'clock on
 * its own - which is also the only way to catch the things a scene cannot: a
 * review that fires twice, a beer that opens during probation, a Friday that
 * rolls into a Saturday.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { EngineApi } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import { DAY_ACTIONS } from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { BEER_STRESS_RELIEF, BEER_SUSPICION } from '../world/consumables';
import { shiftEndTick } from '../world/day';
import { FIELDS } from '../world/fields';
import { createWorldSession } from '../world/session';
import {
  PROBATION_BONUS_PENCE,
  REVIEW_DAY,
  REVIEW_PASS_REPUTATION,
  type ReviewOutcome,
  reviewTick,
} from '../world/week';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

interface Week {
  readonly driver: DayDriver;
  readonly engine: EngineApi;
  readonly reviews: { outcome: ReviewOutcome; tick: number }[];
  readonly beers: number[];
  readonly weekEnds: ReviewOutcome[];
}

function week(): Week {
  const { engine, seed } = createWorldSession();
  const reviews: { outcome: ReviewOutcome; tick: number }[] = [];
  const beers: number[] = [];
  const weekEnds: ReviewOutcome[] = [];
  const driver = new DayDriver(engine, COMPANY_IDS.player, seed, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
    onReview: (outcome, tick) => {
      reviews.push({ outcome, tick });
    },
    onBeerUnlocked: () => {
      beers.push(engine.now());
    },
    onWeekEnd: (outcome) => {
      weekEnds.push(outcome);
    },
  });

  return { driver, engine, reviews, beers, weekEnds };
}

function meter(world: Week, field: string): number {
  const value = world.engine.graph.getField(COMPANY_IDS.player, field);
  return typeof value === 'number' ? value : Number.NaN;
}

/**
 * Puts the reputation where a test needs it, through the shipped meter verb.
 *
 * The review reads one number and the world guards on it, so a test that wants
 * to stand on either side of the threshold has to move that number the way the
 * day moves it rather than by writing the field.
 */
function setReputation(world: Week, target: number): void {
  const now = meter(world, FIELDS.reputation);
  const result = world.engine.dispatch(
    DAY_ACTIONS.metersTick,
    COMPANY_IDS.player,
    null,
    {
      stress_up: 0,
      stress_down: 0,
      suspicion_up: 0,
      suspicion_down: 0,
      reputation_up: Math.max(0, target - now),
      reputation_down: Math.max(0, now - target),
      suspicion_events_up: 0,
      breaches_charged: meter(world, FIELDS.breachesCharged),
      resolve_credit_paid: meter(world, FIELDS.resolveCreditPaid),
    },
  );

  expect(result).toEqual({ ok: true });
  expect(meter(world, FIELDS.reputation)).toBe(target);
}

/** Plays whole days at a time, up to the morning of `untilDay`. */
function playDaysUpTo(world: Week, untilDay: number): void {
  while (world.driver.day() < untilDay) {
    world.driver.startShift();
    world.driver.step(TICK_INTERVAL_MS * (shiftEndTick(world.driver.day())
      - world.engine.now()));
    expect(world.driver.state()).toBe('day_end');
    world.driver.clockOff();
  }
}

/** Monday to Friday lunchtime, with the reputation put where it is wanted. */
function playToTheReview(reputation: number): Week {
  const world = week();
  playDaysUpTo(world, REVIEW_DAY);
  expect(world.driver.day()).toBe(REVIEW_DAY);

  world.driver.startShift();
  setReputation(world, reputation);
  world.driver.step(TICK_INTERVAL_MS * (reviewTick(REVIEW_DAY) - 1
    - world.engine.now()));

  expect(world.reviews).toEqual([]);
  expect(world.driver.reviewOutcome()).toBe('pending');
  return world;
}

describe('the review at three on Friday', () => {
  it('passes a week that stayed above the line, once', () => {
    const world = playToTheReview(REVIEW_PASS_REPUTATION);
    const fundBefore = meter(world, FIELDS.farmFund);

    world.driver.step(TICK_INTERVAL_MS);

    expect(world.engine.now()).toBe(reviewTick(REVIEW_DAY));
    expect(world.reviews).toEqual([
      { outcome: 'passed', tick: reviewTick(REVIEW_DAY) },
    ]);
    expect(world.driver.reviewOutcome()).toBe('passed');
    // The probation ends: the fridge is unlocked and the fund takes the bonus.
    expect(meter(world, FIELDS.beerUnlocked)).toBeNaN();
    expect(world.engine.graph.getField(COMPANY_IDS.player, FIELDS.beerUnlocked))
      .toBe(true);
    expect(meter(world, FIELDS.farmFund))
      .toBe(fundBefore + PROBATION_BONUS_PENCE);

    // And it does not happen again on the way to five o'clock.
    world.driver.step(TICK_INTERVAL_MS * 60);
    expect(world.reviews).toHaveLength(1);
    expect(meter(world, FIELDS.farmFund))
      .toBe(fundBefore + PROBATION_BONUS_PENCE);
  });

  it('fires a week that did not, and one point is the difference', () => {
    const world = playToTheReview(REVIEW_PASS_REPUTATION - 1);
    const fundBefore = meter(world, FIELDS.farmFund);

    world.driver.step(TICK_INTERVAL_MS);

    expect(world.reviews).toEqual([
      { outcome: 'fired', tick: reviewTick(REVIEW_DAY) },
    ]);
    expect(world.driver.reviewOutcome()).toBe('fired');
    expect(world.engine.graph.getField(COMPANY_IDS.player, FIELDS.beerUnlocked))
      .toBe(false);
    expect(meter(world, FIELDS.farmFund)).toBe(fundBefore);
  });

  /** The world is the thing that decides, so it refuses the other answer. */
  it('refuses the verb the meters do not support', () => {
    const world = playToTheReview(REVIEW_PASS_REPUTATION - 1);

    const wrong = world.engine.dispatch(
      DAY_ACTIONS.reviewPassed,
      COMPANY_IDS.player,
      null,
      {},
    );
    expect(wrong.ok).toBe(false);
    expect(wrong.ok ? '' : wrong.reason).toContain('Nothing in the file');

    world.driver.step(TICK_INTERVAL_MS);
    expect(world.driver.reviewOutcome()).toBe('fired');

    // And having happened, it cannot happen again in either direction.
    for (const id of [DAY_ACTIONS.reviewFired, DAY_ACTIONS.reviewPassed]) {
      const again = world.engine.dispatch(id, COMPANY_IDS.player, null, {});
      expect(again.ok).toBe(false);
    }
  });

  it('does not review on any other day of the week', () => {
    const world = week();
    playDaysUpTo(world, REVIEW_DAY);

    expect(world.reviews).toEqual([]);
    expect(world.driver.reviewOutcome()).toBe('pending');
  });
});

describe('the beer', () => {
  it('is locked until the review says otherwise', () => {
    const world = playToTheReview(REVIEW_PASS_REPUTATION - 1);

    const refused = world.driver.beer();
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.reason).toContain('Not during probation');

    world.driver.step(TICK_INTERVAL_MS);
    expect(world.driver.reviewOutcome()).toBe('fired');
    expect(world.driver.beer().ok).toBe(false);
    expect(world.beers).toEqual([]);
  });

  it('turns up at five on a Friday that went well, and pours once', () => {
    const world = playToTheReview(REVIEW_PASS_REPUTATION + 10);
    world.driver.step(TICK_INTERVAL_MS
      * (shiftEndTick(REVIEW_DAY) - world.engine.now()));

    expect(world.driver.state()).toBe('day_end');
    expect(world.beers).toEqual([shiftEndTick(REVIEW_DAY)]);

    const stress = meter(world, FIELDS.stress);
    const suspicion = meter(world, FIELDS.suspicion);
    const cans = meter(world, FIELDS.deskCans);

    expect(world.driver.beer()).toEqual({ ok: true });
    expect(meter(world, FIELDS.stress))
      .toBe(Math.max(0, stress - BEER_STRESS_RELIEF));
    expect(meter(world, FIELDS.suspicion))
      .toBe(Math.min(100, suspicion + BEER_SUSPICION));
    expect(meter(world, FIELDS.deskCans)).toBe(cans + 1);

    // One bottle. It had your name on it; the rest belong to other people.
    const second = world.driver.beer();
    expect(second.ok).toBe(false);
    expect(second.ok ? '' : second.reason).toContain('name on it');
  });
});

describe('the end of the week', () => {
  it('stops on Friday evening instead of rolling into a Saturday', () => {
    const world = playToTheReview(REVIEW_PASS_REPUTATION);
    world.driver.step(TICK_INTERVAL_MS
      * (shiftEndTick(REVIEW_DAY) - world.engine.now()));
    const at = world.engine.now();
    const fund = meter(world, FIELDS.farmFund);

    world.driver.clockOff();

    expect(world.weekEnds).toEqual(['passed']);
    expect(world.driver.weekEnded()).toBe(true);
    expect(world.driver.day()).toBe(REVIEW_DAY);
    expect(world.driver.state()).toBe('day_end');
    expect(world.engine.now()).toBe(at);
    expect(meter(world, FIELDS.farmFund)).toBeGreaterThan(fund);

    // Clocking off twice does not pay the week twice.
    const banked = meter(world, FIELDS.farmFund);
    world.driver.clockOff();
    expect(meter(world, FIELDS.farmFund)).toBe(banked);
    expect(world.weekEnds).toHaveLength(1);
  });

  it('adds the five days up out of the tickets they arrived in', () => {
    const world = playToTheReview(REVIEW_PASS_REPUTATION);
    world.driver.step(TICK_INTERVAL_MS
      * (shiftEndTick(REVIEW_DAY) - world.engine.now()));
    world.driver.clockOff();

    const card = world.driver.weekScorecard();
    const tickets = world.engine.graph.nodesOfKind('ticket');

    expect(card.days).toHaveLength(5);
    expect(card.arrived).toBe(tickets.length);
    expect(card.outcome).toBe('passed');
    expect(card.reputation).toBe(meter(world, FIELDS.reputation));
    expect(card.bankedPence).toBe(meter(world, FIELDS.farmFund));
    // A first week starts at nothing, so everything in the fund is this
    // week's - bonus included, because the bonus is this week's too.
    expect(card.earnedPence).toBe(card.bankedPence);
    expect(card.earnedPence).toBeGreaterThan(PROBATION_BONUS_PENCE);
  });

  it('will not end a week nobody has had the conversation about', () => {
    const world = week();
    playDaysUpTo(world, 2);

    const early = world.engine.dispatch(
      DAY_ACTIONS.endWeek,
      COMPANY_IDS.player,
      null,
      { banked: 0 },
    );
    expect(early.ok).toBe(false);
    expect(world.driver.weekEnded()).toBe(false);
  });
});
