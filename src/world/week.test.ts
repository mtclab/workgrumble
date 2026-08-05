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
import { buildPatrolSchedule, patrolWindows } from './boss';
import {
  DAY_RATE_PENCE,
  dripWindow,
  shiftEndTick,
  shiftStartTick,
} from './day';
import { FIELDS } from './fields';
import { minuteOfDay, tickAtMinute } from './hours';
import { COMPANY_IDS } from './company';
import {
  buildInterruptionSchedule,
  FLAVOR,
  type InterruptionSlot,
  interruptionsClearOf,
} from './interruptions';
import { STARTING_REPUTATION } from './meters';
import { HYGIENE_SYNC_MINUTE, HYGIENE_SYNC_MINUTES } from './scenes/meeting';
import { seedForAttempt } from './session';
import { MSP_WEEK } from './msp-week';
import { SECOND_WEEK } from './second-week';
import { WORLD_TICKETS } from './tickets';
import {
  arrivesBeforeClose,
  assertWeekGreetings,
  assertWeekTickets,
  type DayScript,
  dayPlan,
  type WalkUpSlot,
  dayScript,
  dripMinute,
  inheritedTicketIds,
  isReviewDay,
  interruptionPlanFor,
  interruptionsOn,
  isReviewOutcome,
  isWeekDay,
  MAX_INHERITED,
  patrolSeedFor,
  PROBATION_BONUS_PENCE,
  REDUNDANCY_PAYMENT_PENCE,
  REVIEW_DAY,
  REVIEW_MINUTE,
  REVIEW_PASS_PERFORMANCE,
  reviewOutcomeFor,
  reviewTick,
  scheduledTicketIds,
  validateWeek,
  WEEK,
  WEEK_DAYS,
  weekPerformance,
  weekScorecard,
  weekStanding,
  type WeekWork,
  weekWorkThrough,
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

/** A walk-up fixture: the ask is fine, so the refusals are about the entry. */
function walkUp(id: string, minute: number): WalkUpSlot {
  return {
    slot: {
      id,
      source: 'walk_up',
      minute,
      minutes: 6,
      relatedTicket: null,
      declinable: true,
      severity: 2,
      flavor: {
        [FLAVOR.caller]: COMPANY_IDS.gary,
        [FLAVOR.subject]: 'A fixture, and not somebody anybody meets',
        [FLAVOR.opens]: 'at-the-desk',
      },
    },
    raises: 'ticket:gary-restart',
    filesAfter: 8,
    doneWhen: { node: COMPANY_IDS.garyMachine, field: FIELDS.uptimeSince },
  };
}

function interruption(
  id: string,
  minute: number,
  minutes = 6,
): InterruptionSlot {
  return {
    id,
    source: 'call',
    minute,
    minutes,
    relatedTicket: null,
    declinable: true,
    severity: 2,
    flavor: {
      caller: 'Somebody in accounts',
      subject: 'The printer again',
      opens: 'ringing',
    },
  };
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
    // Every employer's week (0.6.0 slice 3, 0.8.0): the roster is shared, so
    // "every non-summoned ticket is dealt on some day" spans the probation week,
    // Bodgeworth's AND the MSP's. `scheduledTicketIds` reads the active week (the
    // default, probation); the other shops' are read straight off their tables.
    const otherScheduled = [...SECOND_WEEK, ...MSP_WEEK].flatMap((script) => [
      ...script.inherited,
      ...script.drip.map((slot) => slot.ticketId),
    ]);
    const scheduled = [...scheduledTicketIds(), ...otherScheduled];
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
        // The 4:55 class is deliberately outside this window - being outside
        // it is the whole of what it is - so it is held to the shift instead,
        // which is the bound that is not negotiable.
        const tick = shiftStartTick(script.day) + (dripMinute(slot) - 9 * 60);

        if (arrivesBeforeClose(slot)) {
          expect(tick).toBeGreaterThan(window.to);
          expect(tick).toBeLessThanOrEqual(shiftEndTick(script.day));
          continue;
        }

        expect(tick).toBeGreaterThanOrEqual(window.from);
        expect(tick).toBeLessThanOrEqual(window.to);
      }
    }
  });

  it('gives the day scheduler the day it asks for', () => {
    expect(dayPlan(1)).toEqual({
      inherited: dayScript(1).inherited,
      drip: dayScript(1).drip.map((slot) => ({
        ticketId: slot.ticketId,
        minute: dripMinute(slot),
        pinned: arrivesBeforeClose(slot),
      })),
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
    expect(reviewOutcomeFor(REVIEW_PASS_PERFORMANCE)).toBe('passed');
    expect(reviewOutcomeFor(REVIEW_PASS_PERFORMANCE + 1)).toBe('passed');
    expect(reviewOutcomeFor(REVIEW_PASS_PERFORMANCE - 1)).toBe('fired');
    expect(reviewOutcomeFor(0)).toBe('fired');
    expect(PROBATION_BONUS_PENCE).toBeGreaterThan(0);
  });

  it('knows the four things it can say about itself', () => {
    expect(isReviewOutcome('pending')).toBe(true);
    expect(isReviewOutcome('passed')).toBe(true);
    expect(isReviewOutcome('fired')).toBe(true);
    expect(isReviewOutcome('redundant')).toBe(true);
    expect(isReviewOutcome('promoted')).toBe(false);
    expect(isReviewOutcome(null)).toBe(false);
  });

  /**
   * THE MORAL SPINE, as an assertion.
   *
   * Being cut for the weather changes your employer; being cut for cause ends
   * the run. Which means the order of the two questions is not a detail: the
   * bar is asked FIRST, so a round can never be used to hand somebody a
   * payment and a clean file for a week they actually lost, and a week that
   * cleared its bar can never be quietly fired for a ranking.
   *
   * If a later slice reverses these two lines, every outcome above the bar
   * still looks right and the one case that matters - a bad week in a
   * redundancy week - starts paying out. This is the test that goes red.
   */
  it('asks the bar first and the ranking second', () => {
    const bar = REVIEW_PASS_PERFORMANCE;

    // No round on: exactly the game that shipped, both sides of the line.
    expect(reviewOutcomeFor(bar, bar, false)).toBe('passed');
    expect(reviewOutcomeFor(bar - 1, bar, false)).toBe('fired');

    // A round on, and the week cleared the line it was held to. The only
    // thing left to decide is whether somebody was easier to lose.
    expect(reviewOutcomeFor(bar, bar, true)).toBe('redundant');
    expect(reviewOutcomeFor(100, bar, true)).toBe('redundant');

    // And the case the order exists for: in the cut, and under the bar. That
    // is a firing, with no cheque and no clean sheet, because the round is not
    // why they are going.
    expect(reviewOutcomeFor(bar - 1, bar, true)).toBe('fired');
    expect(reviewOutcomeFor(0, bar, true)).toBe('fired');

    // A raised bar - a conduct file somebody had a reason to open - carries
    // through both branches rather than being skipped in a pressure week.
    expect(reviewOutcomeFor(56, 70, true)).toBe('fired');
    expect(reviewOutcomeFor(70, 70, true)).toBe('redundant');
  });

  it('pays a week of notice, and a week is what it is worth', () => {
    // Statutory redundancy pay needs two years of continuous service and
    // nobody in this game has two years, so what is owed is pay in lieu of
    // one week's notice. Five days at the shipped rate, and no more.
    expect(REDUNDANCY_PAYMENT_PENCE).toBe(WEEK_DAYS * DAY_RATE_PENCE);
    expect(REDUNDANCY_PAYMENT_PENCE).toBeLessThan(PROBATION_BONUS_PENCE * 3);
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

  it('refuses an interruption outside the hours anybody is at the desk', () => {
    expect(() => week(
      monday({ interruptions: [interruption('call:dawn', 6 * 60)] }),
      ...FILLER,
    )).toThrow(/outside the hours anybody is at the desk/);
  });

  /**
   * Two interruptions with one id would share the record of what was done
   * about them, so the second would arrive already answered and its window
   * would refuse every button on it. That is a Thursday that quietly does
   * nothing, which is the class of bug this loader exists for.
   */
  it('refuses the same interruption id twice in one week', () => {
    expect(() => week(
      monday({ interruptions: [interruption('call:twice', 10 * 60)] }),
      monday({
        day: 2,
        label: 'Tuesday',
        interruptions: [interruption('call:twice', 14 * 60)],
      }),
      ...FILLER.slice(1),
    )).toThrow(/interrupts twice in one week/);
  });

  /**
   * And the walk-up column is held to every one of those rules, because
   * `interruptionsOn` folds it into the same list the schedule reads.
   *
   * It is worth being exact about what would otherwise have shipped: a walk-up
   * was checked for its ASK - the ticket it raises and when - and for nothing
   * else at all. Its id, its minute and its shape went straight past the
   * loader, so a second entry sharing an id would have booted clean and then
   * shared the record of what was decided about it, and one authored at half
   * past six would have been a beat nobody was ever at the desk for.
   */
  it('holds a walk-up to every rule an interruption is held to', () => {
    expect(() => week(
      monday({ walkUps: [walkUp('walk_up:dawn', 6 * 60)] }),
      ...FILLER,
    )).toThrow(/outside the hours anybody is at the desk/);

    expect(() => week(
      monday({ walkUps: [walkUp('walk_up:twice', 10 * 60)] }),
      monday({
        day: 2,
        label: 'Tuesday',
        walkUps: [walkUp('walk_up:twice', 14 * 60)],
      }),
      ...FILLER.slice(1),
    )).toThrow(/interrupts twice in one week/);

    // And across the two columns, which is the case a per-column check could
    // never see: one id, one record, two entries claiming it.
    expect(() => week(
      monday({ interruptions: [interruption('both:twice', 10 * 60)] }),
      monday({
        day: 2,
        label: 'Tuesday',
        walkUps: [walkUp('both:twice', 14 * 60)],
      }),
      ...FILLER.slice(1),
    )).toThrow(/interrupts twice in one week/);
  });

  /**
   * The 4:55 field, at both ends of the one boundary that is easy to get
   * wrong.
   *
   * Nought is not "the hardest version of this ticket": the field says how
   * long BEFORE close, so nought is a ticket raised in the minute the shift
   * ends, with no workable minutes in the day at all. One is the shipped
   * class - five minutes is what the week actually authors - and it has to
   * stay legal, or the refusal has swallowed the feature.
   */
  it('refuses a ticket that arrives AT close, and allows one before it', () => {
    expect(() => week(
      monday({ drip: [{ ticketId: 'a', arrivesMinutesBeforeClose: 0 }] }),
      ...FILLER,
    )).toThrow(/nought is the minute the shift ends/);

    expect(() => week(
      monday({ drip: [{ ticketId: 'a', arrivesMinutesBeforeClose: -1 }] }),
      ...FILLER,
    )).toThrow(/at least one of them/);

    expect(() => week(
      monday({ drip: [{ ticketId: 'a', arrivesMinutesBeforeClose: 1 }] }),
      ...FILLER,
    )).not.toThrow();
    expect(() => week(
      monday({ drip: [{ ticketId: 'a', arrivesMinutesBeforeClose: 5 }] }),
      ...FILLER,
    )).not.toThrow();
  });

  /**
   * A greeting nobody can say.
   *
   * Both halves are silent in play and identical from the outside - the thread
   * never opens and the indicator never appears - so the minute the week
   * booked for the beat is a minute in which nothing whatever happens. That is
   * a typo reading as a quiet Monday, which is the whole class this loader is
   * for.
   */
  it('refuses a bare hello from somebody who cannot say one', () => {
    const trees = [
      { id: 'dialogue/a', speaker: 'person:owen', hello_root: 'hello' },
      { id: 'dialogue/b', speaker: 'person:kwame', hello_root: 'hello' },
    ];

    expect(() => assertWeekGreetings(trees)).not.toThrow();
    expect(() => assertWeekGreetings(
      trees.filter((tree) => tree.speaker !== 'person:owen'),
    )).toThrow(/nobody of that name talks to anybody/);
    expect(() => assertWeekGreetings(
      trees.map((tree) => ({ id: tree.id, speaker: tree.speaker })),
    )).toThrow(/no greeting written for them/);
  });
});

describe('the day\'s interruptions', () => {
  /**
   * The shipped column, named day by day.
   *
   * This assertion replaced the one that said the column was empty everywhere,
   * which is the line lane A left as the marker for "the goldens may now
   * move". It is written as an exact per-day list rather than as a count
   * because the SHAPE is the claim the slice makes: one call that carries a
   * ticket, one block nobody can refuse, one call that carries nothing, one
   * machine that carries nobody at all, and - from 0.3.4 - one person who
   * came to the desk. A week that quietly grew a sixth, or lost the malignant
   * one, would still have "some interruptions in it" and would no longer be
   * teaching the cost model.
   *
   * The Thursday holds two, which is the only day that does, and they are two
   * different lessons an hour and a half apart: a person you may wave off at
   * twenty past eleven, and a machine you may not at ten past two.
   *
   * The Friday's entry is in this list at all because `interruptionsOn` folds
   * the walk-up column in: the schedule must see one takeover family rather
   * than two, or two lists would book minutes against each other and neither
   * would know.
   */
  it('authors one of each shape into the shipped probation week', () => {
    expect(WEEK.map((script) => interruptionsOn(script.day).map(
      (slot) => [slot.id, slot.source, slot.relatedTicket],
    ))).toEqual([
      [],
      [['call:spooler', 'call', 'ticket:wedged-spooler']],
      [['meeting:hygiene-sync', 'meeting', null]],
      [
        // The chat beat that makes the dot cost something (0.4.3, F4): a
        // declinable, dot-reading message with no ticket behind it, earliest of
        // the day's three and so first in the folded list.
        ['chat:dennis-calendar', 'chat', null],
        ['call:annexe-printer', 'call', null],
        ['machine:reboot', 'machine', null],
      ],
      [['walk_up:gary-restart', 'walk_up', null]],
    ]);

    expect(interruptionsOn(0)).toEqual([]);
    expect(interruptionsOn(WEEK_DAYS + 1)).toEqual([]);
  });

  /**
   * The announced one lands on the minute it was announced for, and it is
   * pinned against THE SHIPPED SEED rather than in the abstract.
   *
   * Two ways for that to stop being true, and both are silent: a jitter typed
   * onto the row, or the lead's rounds moving over the half hour so the block
   * slides out from under the mail that names it. Either way the summons in
   * the inbox becomes a lie about the day, which is the one thing this beat
   * cannot survive - the dread is the mechanic, and dread needs a time.
   */
  it('lands the announced meeting on the minute the summons names', () => {
    const seed = seedForAttempt(1);
    const schedule = buildInterruptionSchedule(
      seed,
      3,
      interruptionPlanFor(3, seed),
    );
    const meeting = schedule.entries.find(
      (entry) => entry.source === 'meeting',
    );

    expect(meeting?.tick).toBe(tickAtMinute(3, HYGIENE_SYNC_MINUTE));
    expect(meeting?.endsTick)
      .toBe(tickAtMinute(3, HYGIENE_SYNC_MINUTE + HYGIENE_SYNC_MINUTES));
    // Not merely "it is at half ten": it never had to move to get there.
    expect(meeting?.slidFrom).toBeNull();
    expect(schedule.dropped).toEqual([]);
  });

  /**
   * Where the two schedules meet. The lead's rounds are handed over as blocked
   * windows so that nothing can be authored on top of a patrol - the boss
   * cannot be at your shoulder while he is also chairing the meeting - and the
   * whole plan is a function of the day and the world seed.
   */
  it('hands the builder the lead\'s rounds as minutes already spoken for', () => {
    const seed = 0x5eed_0303;
    const plan = interruptionPlanFor(3, seed);
    const patrol = buildPatrolSchedule(3, patrolSeedFor(3, seed));

    expect(plan.slots).toEqual(interruptionsOn(3));
    expect(plan.blocked).toEqual(patrolWindows(patrol));
    expect(plan.blocked.length).toBe(patrol.visits.length);
    expect(plan.blocked.length).toBeGreaterThan(0);
    // Same day, same seed, same plan - which is what the schedule's
    // determinism rests on.
    expect(interruptionPlanFor(3, seed)).toEqual(plan);
  });

  it('deals a day off the end of the week nothing at all', () => {
    expect(interruptionPlanFor(WEEK_DAYS + 1, 1))
      .toEqual({ slots: [], blocked: [] });
  });

  it('builds a schedule that clears the rounds it was handed', () => {
    const seed = 0x5eed_0303;
    const plan = interruptionPlanFor(4, seed);
    const schedule = buildInterruptionSchedule(seed, 4, {
      slots: [interruption('call:accounts', 10 * 60, 12)],
      blocked: plan.blocked,
    });

    expect(schedule.entries).toHaveLength(1);
    expect(interruptionsClearOf(schedule, plan.blocked)).toBeNull();
  });
});

describe('the week against the roster', () => {
  it('takes the roster it ships', () => {
    // Both weeks, because the shared roster spans both employers (0.6.0 slice 3).
    expect(() => assertWeekTickets(WORLD_TICKETS, [WEEK, SECOND_WEEK, MSP_WEEK]))
      .not.toThrow();
  });

  it('refuses a day that deals a ticket nobody wrote', () => {
    expect(() => assertWeekTickets(
      WORLD_TICKETS.filter((entry) => entry.def.id !== 'ticket:rotated-screen'),
      [WEEK, SECOND_WEEK, MSP_WEEK],
    )).toThrow(/schedules "ticket:rotated-screen", which nobody wrote/);
  });

  it('refuses a summoned ticket being given a slot', () => {
    const summoned = WORLD_TICKETS.map((entry) => (
      entry.def.id === 'ticket:rotated-screen'
        ? { ...entry, arrival: 'summoned' as const }
        : entry
    ));

    expect(() => assertWeekTickets(summoned, [WEEK, SECOND_WEEK, MSP_WEEK]))
      .toThrow(/which is summoned/);
  });

  it('refuses content that ships dead', () => {
    expect(() => assertWeekTickets([
      ...WORLD_TICKETS,
      {
        def: { id: 'ticket:nobody-sees-this' },
        arrival: 'morning' as const,
      },
    ], [WEEK, SECOND_WEEK, MSP_WEEK])).toThrow(/is not in anybody's week/);
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
      performance: 44,
      bar: REVIEW_PASS_PERFORMANCE,
      conduct: 'Nobody has a reason to open your file.',
      criteria: '',
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
    expect(card.performance).toBe(44);
    // And the bar it was held to, which is on the card because it is not
    // always the published one: a conduct file somebody opened raises it, and
    // a screen that printed the constant beside a verdict the constant did not
    // produce would be a screen arguing with itself.
    expect(card.bar).toBe(REVIEW_PASS_PERFORMANCE);
    expect(card.conduct).toContain('file');
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
      performance: 44,
      bar: REVIEW_PASS_PERFORMANCE,
      conduct: 'Nobody has a reason to open your file.',
      criteria: '',
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
      performance: 10,
      bar: REVIEW_PASS_PERFORMANCE,
      conduct: 'Somebody has a reason to open your file.',
      criteria: '',
      outcome: 'fired',
    }).earnedPence).toBe(0);
  });
  /**
   * And the same days, added up the way the REVIEW adds them: everything the
   * week has handed over up to a given day, out of the same ledgers. Read
   * through the Tuesday and the Thursday ticket is not in it yet, which is
   * what "the week so far" has to mean.
   */
  it('reads the week to date out of the same ticket nodes', () => {
    expect(weekWorkThrough(tickets, 2))
      .toEqual({ arrived: 3, closed: 2, breached: 2 });
    expect(weekWorkThrough(tickets, WEEK_DAYS))
      .toEqual({ arrived: 4, closed: 2, breached: 2 });
    expect(weekWorkThrough(tickets, 0))
      .toEqual({ arrived: 0, closed: 0, breached: 0 });
  });
});

/* -- the performance axis, and the gate that stops it scaling -------------- */

describe('the mark the review reads', () => {
  const work = (
    arrived: number,
    closed: number,
    breached: number,
  ): WeekWork => ({ arrived, closed, breached });

  it('is a percentage of the work that arrived', () => {
    // Everything closed, nothing late.
    expect(weekPerformance(work(25, 25, 0))).toBe(100);
    // Half closed, half of them left to go red: the two halves of the mark
    // are 54 and 50, and the mark is what they average to.
    expect(weekPerformance(work(24, 13, 12))).toBe(52);
    // Nothing closed and everything red.
    expect(weekPerformance(work(24, 0, 24))).toBe(0);
    // The deadline half on its own: everything answered in time and nothing
    // finished is exactly half a week's work.
    expect(weekPerformance(work(10, 0, 0))).toBe(50);
    // And a week closed entirely after the fact scores the resolution half
    // and none of the other, which is the honest reading of "done, but late".
    expect(weekPerformance(work(10, 10, 10))).toBe(50);
  });

  /**
   * A day nobody was given anything is not a bad day, it is no evidence - so
   * it answers null and the standing carries rather than being averaged with
   * a nought or, worse, a free hundred for having nothing to do.
   */
  it('has nothing to say about a week with nothing in it', () => {
    expect(weekPerformance(work(0, 0, 0))).toBeNull();
    expect(weekStanding(61, work(0, 0, 0))).toBe(61);
  });

  it('never leaves the hundred it is out of', () => {
    // Counts that cannot happen, in case one day they do: a ledger that
    // double-counted would otherwise print a mark of 150 on the week screen.
    expect(weekPerformance(work(4, 9, 0))).toBe(100);
    expect(weekPerformance(work(4, 0, 9))).toBe(0);
  });

  it('folds today into the week behind it, half and half', () => {
    expect(weekStanding(50, work(10, 10, 0))).toBe(75);
    expect(weekStanding(75, work(20, 20, 0))).toBe(88);
  });
});

/**
 * THE SCALING GATE.
 *
 * This is the assertion the defect in `docs/research/review-scoring.md` walked
 * straight through, and the reason the review stopped reading a meter.
 *
 * The meter was a SUM: resolution credit scaled with the roster, the price of
 * being caught was fixed by the lead's rounds, and the pass bar therefore
 * drifted every time content was added. Measured, over one content slice: the
 * gap between "did half the job" and "did the lot with the browser up" fell
 * from sixteen points to seven when the roster went from twenty-three tickets
 * to twenty-five, and the modelled crossover was about twenty-six. The next
 * ticket added would have made openly slacking the better week, and nobody
 * would have decided that.
 *
 * So the five profiles are walked here against the shipped roster AND against
 * a roster doubled and quadrupled, and the mark has to come out IDENTICAL. Any
 * model with a term that grows with content fails this, which is the point:
 * it is not a test of today's numbers, it is a test that today's numbers are
 * not a function of how much content the game has.
 *
 * The day rows are the ledgers the five shipped weeks actually produced, taken
 * from `scripted-week.test.ts`. The numbers below are NOT a second golden for
 * that file - the review happens at three o'clock and this walks whole days -
 * so they are asserted for their SHAPE (order, separation, which side of the
 * bar) rather than pinned to the minute.
 */
describe('the week as a fraction of itself, at any roster size', () => {
  /** Per day: arrived, closed, went red. */
  type DayRow = readonly [number, number, number];

  const PROFILES: readonly {
    readonly name: string;
    readonly days: readonly DayRow[];
  }[] = [
    {
      name: 'worked properly',
      days: [[5, 5, 0], [6, 6, 0], [5, 5, 0], [5, 5, 0], [4, 4, 0]],
    },
    {
      name: 'half the roster',
      days: [[5, 4, 0], [5, 2, 4], [5, 2, 2], [5, 4, 3], [4, 1, 3]],
    },
    {
      name: 'nothing at all',
      days: [[5, 0, 4], [5, 0, 5], [5, 0, 5], [5, 0, 6], [4, 0, 4]],
    },
  ];

  /**
   * The week walked the way the driver walks it: the mark for the week TO
   * DATE, folded into the days behind it, once per clock-off.
   */
  function walk(days: readonly DayRow[], roster: number): number {
    let standing = STARTING_REPUTATION;
    let arrived = 0;
    let closed = 0;
    let breached = 0;

    for (const [day, done, red] of days) {
      arrived += day * roster;
      closed += done * roster;
      breached += red * roster;
      standing = weekStanding(standing, { arrived, closed, breached });
    }

    return standing;
  }

  const SIZES: readonly number[] = [1, 2, 4];

  it('reads the same week the same way however much content there is', () => {
    for (const profile of PROFILES) {
      const marks = SIZES.map((size) => walk(profile.days, size));
      const [shipped] = marks;

      for (const [index, mark] of marks.entries()) {
        expect(
          mark,
          `${profile.name} at ${String(SIZES[index] ?? 0)}x the roster`,
        ).toBe(shipped);
      }
    }
  });

  it('keeps the order and the room between them at every size', () => {
    for (const size of SIZES) {
      const [worked, half, idle] = PROFILES.map(
        (profile) => walk(profile.days, size),
      ) as [number, number, number];
      const at = `at ${String(size)}x the roster`;

      expect(worked, at).toBeGreaterThan(half);
      expect(half, at).toBeGreaterThan(idle);
      // Room rather than a tie-break, on both gaps, and most of the scale
      // used across the three: a review that told these apart inside ten
      // points would be a review nobody could read.
      expect(worked - half, at).toBeGreaterThanOrEqual(20);
      expect(half - idle, at).toBeGreaterThanOrEqual(20);
      expect(worked - idle, at).toBeGreaterThanOrEqual(60);

      // And the bar still falls between doing half the job and doing none of
      // it, which is the thing the drifting sum quietly stopped doing.
      expect(half, at).toBeGreaterThanOrEqual(REVIEW_PASS_PERFORMANCE);
      expect(idle, at).toBeLessThan(REVIEW_PASS_PERFORMANCE);
      // Always a percentage, whatever the roster.
      expect(worked, at).toBeLessThanOrEqual(100);
      expect(idle, at).toBeGreaterThanOrEqual(0);
    }
  });
});
