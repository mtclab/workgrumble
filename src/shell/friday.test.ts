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
import { DAY_ACTIONS, HELPDESK_ACTIONS } from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { BEER_STRESS_RELIEF, BEER_SUSPICION } from '../world/consumables';
import { shiftEndTick, shiftStartTick } from '../world/day';
import { FIELDS } from '../world/fields';
import { createWorldSession } from '../world/session';
import { spawnWorldTicket } from '../world/tickets';
import { PHISH_PRAISE } from '../world/tickets/desk';
import {
  PROBATION_BONUS_PENCE,
  REVIEW_DAY,
  REVIEW_PASS_PERFORMANCE,
  type ReviewOutcome,
  reviewTick,
  weekPerformance,
  weekWorkThrough,
} from '../world/week';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

/** Friday's own inherited ticket, and the only one closable at 14:59. */
const PHISHING_TICKET = 'ticket:phishing-report';

/**
 * A ticket nobody's idle week ever raises - it is summoned by a fix that never
 * happened - so it is the one this file can put into a Friday at a minute of
 * its own choosing.
 */
const LATE_TICKET = 'ticket:sendas-missing';

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

/**
 * The same world, through a save and a reload.
 *
 * A fresh session, the serialized world put into it, and the driver told to
 * pick the day back up - which is exactly what the shipped load does. Anything
 * that is only true in the session that produced it is not true.
 */
function reloaded(world: Week): Week {
  const state = world.engine.serialize();
  const next = week();
  next.engine.restore(state);
  next.driver.resync();
  return next;
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

/**
 * Puts the number the REVIEW will read where a test needs it.
 *
 * The conversation does not read the reputation meter at all any more. It
 * reads a mark out of a hundred - how much of the week's own work was closed,
 * how much of it never went red - folded into the days behind it, half and
 * half. Today's half is a fact about the tickets and cannot be dialled, so
 * what this moves is the CARRIED half: the days before, set to whatever makes
 * the fold come out where the test asked.
 *
 * It goes through the shipped verb rather than writing the field, and the
 * result is checked rather than assumed, because a helper that quietly missed
 * the line would turn every threshold test in this file into a test of
 * nothing.
 */
function setReviewReading(world: Week, target: number): void {
  const mark = weekPerformance(weekWorkThrough(
    world.engine.graph.nodesOfKind('ticket'),
    world.driver.day(),
  ));

  expect(mark, 'a Friday with no week behind it cannot be read')
    .not.toBeNull();

  const carried = 2 * target - (mark ?? 0);

  expect(carried, 'the target is not reachable from this week')
    .toBeGreaterThanOrEqual(0);
  expect(carried, 'the target is not reachable from this week')
    .toBeLessThanOrEqual(100);

  setWeekStanding(world, carried);
  expect(world.driver.weekReading()).toBe(target);
}

/**
 * The week's standing as the WORLD holds it, through the verb that holds it.
 *
 * Not the same number as the one above: this is the days behind today, which
 * is what the review guards actually read - the driver folds today into it in
 * the minute the conversation happens, and then asks.
 */
function setWeekStanding(world: Week, standing: number): void {
  const result = world.engine.dispatch(
    DAY_ACTIONS.weekReading,
    COMPANY_IDS.player,
    null,
    { reading: standing },
  );

  expect(result).toEqual({ ok: true });
  expect(meter(world, FIELDS.weekReputation)).toBe(standing);
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

/**
 * Monday to one minute before three on Friday, with the reputation put where
 * it is wanted.
 *
 * The meter is moved at the LAST minute rather than at nine, because these
 * tests are about the threshold and nothing else: a week nobody works loses
 * reputation all the way through Friday, so setting it at the start of the day
 * and walking six hours is a test that measures the drain instead of the line
 * it was written about. The drain has its own gate, in the golden week.
 */
function playToTheReview(reading: number): Week {
  const world = week();
  playDaysUpTo(world, REVIEW_DAY);
  expect(world.driver.day()).toBe(REVIEW_DAY);

  world.driver.startShift();
  world.driver.step(TICK_INTERVAL_MS * (reviewTick(REVIEW_DAY) - 1
    - world.engine.now()));
  setReviewReading(world, reading);

  expect(world.reviews).toEqual([]);
  expect(world.driver.reviewOutcome()).toBe('pending');
  return world;
}

describe('the review at three on Friday', () => {
  it('passes a week that stayed above the line, once', () => {
    const world = playToTheReview(REVIEW_PASS_PERFORMANCE);
    const fundBefore = meter(world, FIELDS.farmFund);

    world.driver.step(TICK_INTERVAL_MS);

    expect(world.engine.now()).toBe(reviewTick(REVIEW_DAY));
    expect(world.reviews).toEqual([
      { outcome: 'passed', tick: reviewTick(REVIEW_DAY) },
    ]);
    expect(world.driver.reviewOutcome()).toBe('passed');
    // The fund takes the bonus at three. The fridge does NOT: the probation
    // ends at three and the WEEK ends at five, and there are two hours of
    // shift in between in which a bottle at the desk is a different joke and
    // a shorter career.
    expect(meter(world, FIELDS.beerUnlocked)).toBeNaN();
    expect(world.engine.graph.getField(COMPANY_IDS.player, FIELDS.beerUnlocked))
      .toBe(false);
    expect(world.driver.beer().ok).toBe(false);
    expect(meter(world, FIELDS.farmFund))
      .toBe(fundBefore + PROBATION_BONUS_PENCE);

    // And it does not happen again on the way to five o'clock.
    world.driver.step(TICK_INTERVAL_MS * 60);
    expect(world.reviews).toHaveLength(1);
    expect(meter(world, FIELDS.farmFund))
      .toBe(fundBefore + PROBATION_BONUS_PENCE);
    // Still shift, still locked - a minute past four is not the end of a week.
    expect(world.driver.beer().ok).toBe(false);
  });

  /**
   * The bottle, at the two minutes that decide it.
   *
   * The lock used to come off inside the review verb, so from 15:00 the desk
   * had a working beer on it and two hours of shift left to drink it in - the
   * tooltip's joke told early, at a desk, in front of the man who had just
   * decided to keep you on. It comes off at the day_end transition now, and
   * both halves are asserted through a save and a load because the day state
   * is the thing a reload restores.
   */
  it('keeps the bottle in the fridge until the week has actually ended', () => {
    const world = playToTheReview(REVIEW_PASS_PERFORMANCE);
    world.driver.step(TICK_INTERVAL_MS);
    expect(world.driver.reviewOutcome()).toBe('passed');

    // 15:01: reviewed, passed, and still working.
    expect(world.driver.state()).toBe('shift');
    expect(world.driver.beer().ok).toBe(false);
    expect(reloaded(world).driver.beer().ok).toBe(false);

    world.driver.step(TICK_INTERVAL_MS
      * (shiftEndTick(REVIEW_DAY) - world.engine.now()));

    // 17:00: the day has ended, so the week has.
    expect(world.driver.state()).toBe('day_end');
    expect(world.engine.graph.getField(COMPANY_IDS.player, FIELDS.beerUnlocked))
      .toBe(true);
    // Through a save and a load, because a bottle that only works in the
    // session that unlocked it is a bottle nobody can come back to.
    const later = reloaded(world);
    expect(later.driver.state()).toBe('day_end');
    expect(later.driver.beer().ok).toBe(true);
    // One bottle.
    expect(later.driver.beer().ok).toBe(false);
  });

  /** And a week that was fired never gets one, at any hour. */
  it('never unlocks the bottle for a week that was not continued', () => {
    const world = playToTheReview(REVIEW_PASS_PERFORMANCE - 1);
    world.driver.step(TICK_INTERVAL_MS);
    expect(world.driver.reviewOutcome()).toBe('fired');

    world.driver.step(TICK_INTERVAL_MS
      * (shiftEndTick(REVIEW_DAY) - world.engine.now()));

    expect(world.driver.state()).toBe('day_end');
    expect(world.engine.graph.getField(COMPANY_IDS.player, FIELDS.beerUnlocked))
      .toBe(false);
    expect(world.driver.beer().ok).toBe(false);
  });

  /**
   * The conversation reads the minute it happens IN, not the minute before it.
   *
   * The review used to be settled before the parent cascades and before the
   * meters, so a ticket resolved at 14:59 was work the lead had not been told
   * about when he made his decision. One point below the line, one closed
   * ticket, and fired for a job that was already done.
   *
   * The mark is a ledger rather than a meter now, so the close lands on it the
   * moment it happens - but the conversation still has to be settled AFTER the
   * minute has been played out, and that is what this holds.
   */
  it('counts a ticket closed at 14:59 in the conversation at 15:00', () => {
    const world = playToTheReview(REVIEW_PASS_PERFORMANCE - 1);
    expect(world.engine.now()).toBe(reviewTick(REVIEW_DAY) - 1);

    // Friday's own inherited ticket, closed one minute before the meeting.
    const closed = world.driver.dispatch(
      HELPDESK_ACTIONS.mailRuleEnable,
      COMPANY_IDS.player,
      COMPANY_IDS.phishBlock,
      {},
    );
    expect(closed).toEqual({ ok: true });
    const replied = world.driver.dispatch(
      HELPDESK_ACTIONS.ticketReplyToReporter,
      COMPANY_IDS.player,
      PHISHING_TICKET,
      { comment: PHISH_PRAISE },
    );
    expect(replied).toEqual({ ok: true });
    expect(world.engine.ticketState(PHISHING_TICKET)).toBe('resolved');

    // One ticket of a week's worth, half of it in the resolution term: it is
    // worth exactly the point that was missing.
    expect(world.driver.weekReading()).toBe(REVIEW_PASS_PERFORMANCE);

    world.driver.step(TICK_INTERVAL_MS);

    expect(world.engine.now()).toBe(reviewTick(REVIEW_DAY));
    // The close reached the conversation, weighted like everything else.
    expect(meter(world, FIELDS.reviewReputation))
      .toBeGreaterThanOrEqual(REVIEW_PASS_PERFORMANCE);
    expect(world.driver.reviewOutcome()).toBe('passed');
  });

  /**
   * And the meter it used to read is not read at all, which is the whole of
   * this slice in one assertion.
   *
   * Reputation still moves - closures pay it, breaches take from it, the lead
   * finding a forum on your screen costs six - and it still drives the things
   * it always drove. It does not decide the probation. A week put on the line
   * and then stripped of every point of reputation it had is a week that still
   * passes, because the queue was dealt with either way.
   */
  it('does not read the reputation meter, whatever is left of it', () => {
    const world = playToTheReview(REVIEW_PASS_PERFORMANCE);
    setReputation(world, 0);

    expect(meter(world, FIELDS.reputation)).toBe(0);
    expect(world.driver.weekReading()).toBe(REVIEW_PASS_PERFORMANCE);

    world.driver.step(TICK_INTERVAL_MS);

    expect(world.driver.reviewOutcome()).toBe('passed');
  });

  /** And the same minute, taken through a save and a load at 14:59. */
  it('reaches the same conversation across a save at 14:59', () => {
    const world = playToTheReview(REVIEW_PASS_PERFORMANCE - 1);

    world.driver.dispatch(
      HELPDESK_ACTIONS.mailRuleEnable,
      COMPANY_IDS.player,
      COMPANY_IDS.phishBlock,
      {},
    );
    world.driver.dispatch(
      HELPDESK_ACTIONS.ticketReplyToReporter,
      COMPANY_IDS.player,
      PHISHING_TICKET,
      { comment: PHISH_PRAISE },
    );

    const later = reloaded(world);
    expect(later.engine.now()).toBe(reviewTick(REVIEW_DAY) - 1);
    expect(later.driver.reviewOutcome()).toBe('pending');

    later.driver.step(TICK_INTERVAL_MS);

    expect(later.driver.reviewOutcome()).toBe('passed');
    expect(later.reviews).toEqual([
      { outcome: 'passed', tick: reviewTick(REVIEW_DAY) },
    ]);
  });

  /**
   * And the other direction, which is the same bug wearing the other face: a
   * deadline crossed AT 15:00 is charged at 15:00, and the review has to have
   * been told before it decides. Passing on a number that was already stale by
   * the time it was read is a pass the player cannot account for either.
   */
  it('counts a deadline missed at 15:00 in the conversation at 15:00', () => {
    const world = week();
    playDaysUpTo(world, REVIEW_DAY);
    world.driver.startShift();

    // Eleven o'clock, which is four hours - an untriaged ticket's whole SLA -
    // before the meeting. Its deadline therefore lands on the meeting's own
    // minute, which is the only way to ask which of the two the driver
    // settles first.
    world.driver.step(TICK_INTERVAL_MS
      * (shiftStartTick(REVIEW_DAY) + 120 - world.engine.now()));
    spawnWorldTicket(world.engine, LATE_TICKET);
    expect(world.engine.graph.getField(LATE_TICKET, FIELDS.slaDeadline))
      .toBe(reviewTick(REVIEW_DAY));

    world.driver.step(TICK_INTERVAL_MS
      * (reviewTick(REVIEW_DAY) - 1 - world.engine.now()));
    // Standing exactly ON the line at 14:59, so the only thing that can take
    // this week under it is the deadline that goes at 15:00.
    setReviewReading(world, REVIEW_PASS_PERFORMANCE);
    expect(world.engine.ticketState(LATE_TICKET)).toBe('open');
    expect(world.driver.reviewOutcome()).toBe('pending');

    world.driver.step(TICK_INTERVAL_MS);

    expect(world.engine.now()).toBe(reviewTick(REVIEW_DAY));
    expect(world.engine.ticketState(LATE_TICKET)).toBe('breached');
    expect(world.driver.reviewOutcome()).toBe('fired');
    // And it was the miss that did it: the week was on the line a minute ago,
    // and what the conversation read is below it.
    expect(meter(world, FIELDS.reviewReputation))
      .toBeLessThan(REVIEW_PASS_PERFORMANCE);
  });

  it('fires a week that did not, and one point is the difference', () => {
    const world = playToTheReview(REVIEW_PASS_PERFORMANCE - 1);
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

  /**
   * The world is the thing that decides, so it refuses the other answer.
   *
   * Put to the guard the way the driver puts it: the guard reads the week's
   * standing off the player node, and the driver's contract is to fold today
   * into that field BEFORE it offers either verb. So the field is set to a
   * week that has not reached the line, and the wrong verb is offered.
   */
  it('refuses the verb the week does not support', () => {
    const world = playToTheReview(REVIEW_PASS_PERFORMANCE - 1);
    setWeekStanding(world, REVIEW_PASS_PERFORMANCE - 1);

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
    const world = playToTheReview(REVIEW_PASS_PERFORMANCE - 1);

    const refused = world.driver.beer();
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.reason).toContain('Not during probation');

    world.driver.step(TICK_INTERVAL_MS);
    expect(world.driver.reviewOutcome()).toBe('fired');
    expect(world.driver.beer().ok).toBe(false);
    expect(world.beers).toEqual([]);
  });

  it('turns up at five on a Friday that went well, and pours once', () => {
    // On the line rather than above it: the mark is a fact about the tickets
    // and only the carried half can be dialled, so a Friday nobody worked
    // cannot be put far above the line however hard a test asks.
    const world = playToTheReview(REVIEW_PASS_PERFORMANCE);
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
    const world = playToTheReview(REVIEW_PASS_PERFORMANCE);
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
    const world = playToTheReview(REVIEW_PASS_PERFORMANCE);
    world.driver.step(TICK_INTERVAL_MS
      * (shiftEndTick(REVIEW_DAY) - world.engine.now()));
    world.driver.clockOff();

    const card = world.driver.weekScorecard();
    const tickets = world.engine.graph.nodesOfKind('ticket');

    expect(card.days).toHaveLength(5);
    expect(card.arrived).toBe(tickets.length);
    expect(card.outcome).toBe('passed');
    // The number the CONVERSATION was decided on, which stopped moving at
    // three o'clock. Reading it live let this screen print "37 of 45 needed"
    // directly above "Probation: passed".
    expect(card.performance).toBe(meter(world, FIELDS.reviewReputation));
    expect(card.performance).toBe(REVIEW_PASS_PERFORMANCE);
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
