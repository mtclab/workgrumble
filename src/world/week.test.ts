/**
 * The week as data, checked the way content is checked: at the boundaries it
 * refuses, and against the roster it is supposed to deal.
 *
 * Everything the loader refuses here is a bug that would look like a quiet day
 * rather than a broken one - a Thursday whose ticket is scheduled twice and
 * therefore arrives once, a drip at half past six, a Monday with the whole
 * roster on it. None of those throw at the point they go wrong; they just make
 * the game duller, which is the kind of bug that ships.
 */

import { describe, expect, it } from 'vitest';

import type { ReadOnlyGraphNode } from '../engine-api';
import { dripWindow, shiftStartTick } from './day';
import { FIELDS } from './fields';
import { minuteOfDay } from './hours';
import { WORLD_TICKETS } from './tickets';
import {
  assertWeekTickets,
  type DayScript,
  dayPlan,
  dayScript,
  inheritedTicketIds,
  isReviewDay,
  isReviewOutcome,
  isWeekDay,
  MAX_INHERITED,
  patrolSeedFor,
  PROBATION_BONUS_PENCE,
  REVIEW_DAY,
  REVIEW_MINUTE,
  REVIEW_PASS_REPUTATION,
  reviewOutcomeFor,
  reviewTick,
  scheduledTicketIds,
  validateWeek,
  WEEK,
  WEEK_DAYS,
  weekScorecard,
} from './week';

function monday(over: Partial<DayScript> = {}): DayScript {
  return {
    day: 1,
    label: 'Monday',
    inherited: [],
    drip: [],
    patrolSeed: 0,
    load: 1,
    ...over,
  };
}

function week(...days: readonly DayScript[]): readonly DayScript[] {
  return validateWeek(days);
}

const FILLER: readonly DayScript[] = [2, 3, 4, 5].map((day) => monday({
  day,
  label: `Day ${String(day)}`,
}));

describe('the shipped week', () => {
  it('is five days, named, ramped and seeded', () => {
    expect(WEEK).toHaveLength(WEEK_DAYS);
    expect(WEEK.map((script) => script.label)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
    ]);
    // The ramp: Monday light, Thursday heavy. It is the shape the content
    // lanes fill, so it is asserted rather than left as a comment.
    expect(dayScript(1).load).toBeLessThan(dayScript(4).load);
    expect(WEEK.slice(0, 4).map((script) => script.load))
      .toEqual([...WEEK.slice(0, 4)].map((script) => script.load).sort(
        (left, right) => left - right,
      ));
  });

  /** The rule the first build broke: a morning is not a punishment. */
  it('never hands anybody more than two tickets before nine o\'clock', () => {
    for (const script of WEEK) {
      expect(script.inherited.length).toBeLessThanOrEqual(MAX_INHERITED);
    }

    // And most of the week's work is not inherited at all.
    const inherited = WEEK.flatMap((script) => script.inherited).length;
    const dripped = WEEK.flatMap((script) => script.drip).length;
    expect(inherited + dripped).toBe(scheduledTicketIds().length);
  });

  it('deals every ticket that is not summoned, exactly once', () => {
    const scheduled = scheduledTicketIds();
    expect(new Set(scheduled).size).toBe(scheduled.length);

    const schedulable = WORLD_TICKETS
      .filter((entry) => entry.arrival !== 'summoned')
      .map((entry) => entry.def.id);
    expect([...scheduled].sort()).toEqual([...schedulable].sort());
  });

  it('drips only into hours a ticket can be started in', () => {
    for (const script of WEEK) {
      const window = dripWindow(script.day);

      for (const slot of script.drip) {
        const tick = shiftStartTick(script.day) + (slot.minute - 9 * 60);
        expect(tick).toBeGreaterThanOrEqual(window.from);
        expect(tick).toBeLessThanOrEqual(window.to);
      }
    }
  });

  it('gives the day scheduler the day it asks for', () => {
    expect(dayPlan(1)).toEqual({
      inherited: dayScript(1).inherited,
      drip: dayScript(1).drip,
    });
    expect(inheritedTicketIds(1)).toEqual(dayScript(1).inherited);
    expect(() => dayScript(6)).toThrow(/does not include a Saturday/);
    expect(isWeekDay(0)).toBe(false);
    expect(isWeekDay(5)).toBe(true);
    expect(isWeekDay(6)).toBe(false);
  });

  /** Two days with the same shape must not produce the same footsteps. */
  it('twists the lead\'s seed per day, and the same way every time', () => {
    const seeds = WEEK.map((script) => patrolSeedFor(script.day, 1_000));
    expect(new Set(seeds).size).toBe(WEEK_DAYS);
    expect(patrolSeedFor(3, 1_000)).toBe(seeds[2]);
    // Monday takes the world seed as it comes: it is the day every other
    // schedule is read against.
    expect(patrolSeedFor(1, 1_000)).toBe(1_000);
  });
});

describe('the review', () => {
  it('happens at three on Friday and nowhere else', () => {
    expect(REVIEW_DAY).toBe(WEEK_DAYS);
    expect(isReviewDay(4)).toBe(false);
    expect(isReviewDay(REVIEW_DAY)).toBe(true);
    expect(minuteOfDay(reviewTick(REVIEW_DAY))).toBe(REVIEW_MINUTE);
    expect(reviewTick(REVIEW_DAY)).toBeGreaterThan(shiftStartTick(REVIEW_DAY));
  });

  it('turns on the threshold, both sides of it', () => {
    expect(reviewOutcomeFor(REVIEW_PASS_REPUTATION)).toBe('passed');
    expect(reviewOutcomeFor(REVIEW_PASS_REPUTATION + 1)).toBe('passed');
    expect(reviewOutcomeFor(REVIEW_PASS_REPUTATION - 1)).toBe('fired');
    expect(reviewOutcomeFor(0)).toBe('fired');
    expect(PROBATION_BONUS_PENCE).toBeGreaterThan(0);
  });

  it('knows the three things it can say about itself', () => {
    expect(isReviewOutcome('pending')).toBe(true);
    expect(isReviewOutcome('passed')).toBe(true);
    expect(isReviewOutcome('fired')).toBe(true);
    expect(isReviewOutcome('promoted')).toBe(false);
    expect(isReviewOutcome(null)).toBe(false);
  });
});

describe('the loader', () => {
  it('takes the week it ships', () => {
    expect(() => validateWeek([...WEEK])).not.toThrow();
  });

  it('refuses a week that is not a week', () => {
    expect(() => week(monday())).toThrow(/5 days in it/);
    expect(() => week(monday({ day: 2 }), ...FILLER)).toThrow(/is numbered 2/);
    expect(() => week(monday({ label: '  ' }), ...FILLER)).toThrow(/has no name/);
    expect(() => week(monday({ load: 0 }), ...FILLER))
      .toThrow(/no difficulty on it/);
    expect(() => week(monday({ patrolSeed: -1 }), ...FILLER))
      .toThrow(/not a whole number/);
  });

  it('refuses a morning pile bigger than a morning', () => {
    expect(() => week(
      monday({ inherited: ['a', 'b', 'c'] }),
      ...FILLER,
    )).toThrow(/The most a morning may hand anybody is 2/);
  });

  it('refuses a drip nobody could start', () => {
    expect(() => week(monday({ drip: [{ ticketId: 'a', minute: 6 * 60 }] }), ...FILLER))
      .toThrow(/outside the hours anybody could start it in/);
    expect(() => week(monday({ drip: [{ ticketId: 'a', minute: 16 * 60 + 30 }] }), ...FILLER))
      .toThrow(/outside the hours anybody could start it in/);
  });

  it('refuses the same ticket arriving twice in one week', () => {
    expect(() => week(
      monday({ inherited: ['ticket:twice'] }),
      monday({ day: 2, label: 'Tuesday', inherited: ['ticket:twice'] }),
      ...FILLER.slice(1),
    )).toThrow(/arrives twice in one week/);
  });
});

describe('the week against the roster', () => {
  it('takes the roster it ships', () => {
    expect(() => assertWeekTickets(WORLD_TICKETS)).not.toThrow();
  });

  it('refuses a day that deals a ticket nobody wrote', () => {
    expect(() => assertWeekTickets(
      WORLD_TICKETS.filter((entry) => entry.def.id !== 'ticket:rotated-screen'),
    )).toThrow(/schedules "ticket:rotated-screen", which nobody wrote/);
  });

  it('refuses a summoned ticket being given a slot', () => {
    const summoned = WORLD_TICKETS.map((entry) => (
      entry.def.id === 'ticket:rotated-screen'
        ? { ...entry, arrival: 'summoned' as const }
        : entry
    ));

    expect(() => assertWeekTickets(summoned)).toThrow(/which is summoned/);
  });

  it('refuses content that ships dead', () => {
    expect(() => assertWeekTickets([
      ...WORLD_TICKETS,
      {
        def: { id: 'ticket:nobody-sees-this' },
        arrival: 'morning' as const,
      },
    ])).toThrow(/is not in anybody's week/);
  });
});

/* -- the scorecard -------------------------------------------------------- */

/**
 * A ticket as the engine leaves one: the minute it arrived, and the minutes
 * the two one-off events happened in. The stamps are not decoration - a day is
 * answerable for what happened IN it, so a resolution with no minute on it
 * belongs to no day at all.
 */
function ticketNode(
  id: string,
  spawnedAt: number,
  state: string,
  stamps: Readonly<{ resolvedAt?: number; breachedAt?: number }> = {},
): ReadOnlyGraphNode {
  return {
    id,
    kind: 'ticket',
    fields: {
      [FIELDS.state]: state,
      [FIELDS.spawnedAt]: spawnedAt,
      [FIELDS.breached]: stamps.breachedAt !== undefined,
      ...(stamps.resolvedAt === undefined
        ? {}
        : { [FIELDS.resolvedAt]: stamps.resolvedAt }),
      ...(stamps.breachedAt === undefined
        ? {}
        : { [FIELDS.breachedAt]: stamps.breachedAt }),
    },
  };
}

describe('the week, scored', () => {
  const tickets: readonly ReadOnlyGraphNode[] = [
    ticketNode('ticket:a', 0, 'resolved', { resolvedAt: 90 }),
    ticketNode('ticket:b', 120, 'breached', { breachedAt: 400 }),
    ticketNode('ticket:c', 1_500, 'resolved', {
      resolvedAt: 1_700,
      breachedAt: 1_650,
    }),
    ticketNode('ticket:d', 4_500, 'open'),
  ];

  it('adds the days up out of the tickets they were made of', () => {
    const card = weekScorecard(tickets, {
      banked: 40_000,
      opening: 5_000,
      reputation: 44,
      outcome: 'passed',
    });

    expect(card.days).toHaveLength(WEEK_DAYS);
    expect(card.days[0]?.ledger.arrived).toBe(2);
    expect(card.days[1]?.ledger.arrived).toBe(1);
    expect(card.days[3]?.ledger.arrived).toBe(1);
    expect(card.arrived).toBe(4);
    expect(card.closed).toBe(2);
    // A ticket that closed late still closed late.
    expect(card.breached).toBe(2);
    expect(card.reputation).toBe(44);
    expect(card.outcome).toBe('passed');
  });

  /**
   * The two numbers a week scorecard could most easily invent. What the week
   * EARNED is the fund's own movement - so a retried week does not report the
   * balance a firing left behind as this week's work - and what is still open
   * is a fact about now rather than a sum of five days that would count the
   * same ticket once per day nobody closed it.
   */
  it('reports what the week earned rather than the balance', () => {
    const card = weekScorecard(tickets, {
      banked: 40_000,
      opening: 5_000,
      reputation: 44,
      outcome: 'passed',
    });

    expect(card.earnedPence).toBe(35_000);
    expect(card.bankedPence).toBe(40_000);
    // Two: the one nobody has opened yet and the one whose deadline ran out.
    // A missed deadline does not fix the printer, so a week that stopped
    // counting a red ticket would be a week that paid you to let it go red.
    expect(card.stillOpen).toBe(2);

    // A week that somehow ended poorer than it started reports nothing owed
    // rather than a negative wage.
    expect(weekScorecard(tickets, {
      banked: 1_000,
      opening: 5_000,
      reputation: 10,
      outcome: 'fired',
    }).earnedPence).toBe(0);
  });
});
