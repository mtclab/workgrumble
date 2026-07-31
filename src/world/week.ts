/**
 * The probation week, as data.
 *
 * Five days with names, a queue each, a lead who walks the floor on his own
 * schedule, and a conversation at three o'clock on Friday that decides whether
 * there is a week two. All of it is a table: which tickets were already in the
 * queue when the player sat down, which ones turn up while they are working and
 * roughly when, how hard the day is meant to be, and what the lead's rounds are
 * seeded from.
 *
 * Two rules the table obeys and the loader enforces:
 *
 * - A MORNING PILE IS AT MOST TWO. A queue of four before nine o'clock is not a
 *   working day, it is a punishment for logging on, and it is what the first
 *   build shipped. Everything else drips in during the shift, which is the half
 *   of a helpdesk that actually feels like one.
 * - EVERY TICKET ARRIVES ONCE. A ticket is a node in the graph; scheduling one
 *   twice is a day that quietly does nothing, and the loader would rather say so
 *   at boot than let a Thursday be empty for a reason nobody can see.
 *
 * The `load` column is the ramp - Monday light, Thursday heavy, Friday about the
 * review - written down so the content lanes have a shape to fill rather than a
 * feeling. It is deliberately ahead of the roster: five tickets spread across
 * five days is a thin week, and the numbers say what the week is FOR.
 *
 * Nothing here touches the DOM, dispatches, or reads the time of day.
 */

import {
  type DayPlan,
  type DayLedger,
  dayLedger,
  dripWindow,
  minuteOfDay,
  SHIFT_END_MINUTE,
  SHIFT_START_MINUTE,
  shiftStartTick,
} from './day';
import type { ReadOnlyGraphNode } from '../engine-api';

/** Monday to Friday. Saturday does not exist; that is the joke and the scope. */
export const WEEK_DAYS = 5;

/** The day the conversation happens on, and the minute it happens at. */
export const REVIEW_DAY = WEEK_DAYS;
export const REVIEW_MINUTE = 15 * 60;

/** The most tickets that may be waiting in a queue before nine o'clock. */
export const MAX_INHERITED = 2;

/**
 * Reputation at the review, at or above which the probation ends.
 *
 * It is below where the week starts (50) on purpose: the pass condition is
 * "did not go backwards very far", not "excelled". A first week at a helpdesk
 * is survived rather than won, and the engine enforces this number in the
 * guards of the two review verbs so the threshold cannot drift between the
 * screen that shows it and the world that applies it.
 */
export const REVIEW_PASS_REPUTATION = 40;

/**
 * What surviving is worth, in pence, straight into the farm fund.
 *
 * Small enough to be a joke about the size of the farm and large enough to
 * notice on the bar, which is the same job every other number on that screen has.
 */
export const PROBATION_BONUS_PENCE = 25_000;

export const REVIEW_OUTCOMES = ['pending', 'passed', 'fired'] as const;

export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

export function isReviewOutcome(value: unknown): value is ReviewOutcome {
  return typeof value === 'string'
    && REVIEW_OUTCOMES.some((outcome) => outcome === value);
}

/** Which way the conversation goes, from the one number it reads. */
export function reviewOutcomeFor(reputation: number): 'passed' | 'fired' {
  return reputation >= REVIEW_PASS_REPUTATION ? 'passed' : 'fired';
}

/** A ticket that turns up during a shift, and the minute it nominally does. */
export interface DripSlot {
  readonly ticketId: string;
  /** Minute of the day, in the same clock the player reads: 630 is 10:30. */
  readonly minute: number;
}

export interface DayScript {
  readonly day: number;
  /** What the brief calls it. */
  readonly label: string;
  /** Tickets already in the queue at 08:00. Two, at the very most. */
  readonly inherited: readonly string[];
  /** Tickets that arrive while the player is working. */
  readonly drip: readonly DripSlot[];
  /**
   * A twist on the world seed for the lead's rounds, so two days do not walk
   * in lockstep even where their content is identical. Monday takes the seed
   * as it comes: it is the day every other schedule is read against.
   */
  readonly patrolSeed: number;
  /** How heavy the day is MEANT to be, 1-4. The ramp, written down. */
  readonly load: number;
}

/**
 * The week itself.
 *
 * The five shipped tickets are spread across it rather than piled onto Monday:
 * the rotated screen is the gimme you are handed on your first morning, the fan
 * is the one you filed about your own desk and it turns up mid-morning like a
 * conscience, and the wedged spooler - the only office-wide fault in the world -
 * lands on Thursday, which is the day the ramp says should hurt. Friday brings
 * nothing new because Friday is about the conversation at three.
 */
export const WEEK: readonly DayScript[] = validateWeek([
  {
    day: 1,
    label: 'Monday',
    inherited: ['ticket:rotated-screen'],
    drip: [{ ticketId: 'ticket:fan-noise', minute: 10 * 60 + 20 }],
    patrolSeed: 0,
    load: 1,
  },
  {
    day: 2,
    label: 'Tuesday',
    inherited: ['ticket:locked-account'],
    drip: [],
    patrolSeed: 1_301,
    load: 2,
  },
  {
    day: 3,
    label: 'Wednesday',
    inherited: [],
    drip: [{ ticketId: 'ticket:tidied-list', minute: 10 * 60 + 40 }],
    patrolSeed: 5_927,
    load: 3,
  },
  {
    day: 4,
    label: 'Thursday',
    inherited: ['ticket:wedged-spooler'],
    drip: [],
    patrolSeed: 8_803,
    load: 4,
  },
  {
    day: 5,
    label: 'Friday',
    inherited: [],
    drip: [],
    patrolSeed: 2_141,
    load: 2,
  },
]);

/**
 * Load-time content gate for the week.
 *
 * Everything it refuses is a bug nobody would see as one: a day whose queue is
 * a ticket nobody wrote, a ticket scheduled twice and therefore arriving once,
 * a drip at half past six, a Monday with the whole roster on it. All of them
 * look like a quiet day rather than a broken one, which is exactly why they
 * fail the boot.
 */
export function validateWeek(
  scripts: readonly DayScript[],
): readonly DayScript[] {
  if (scripts.length !== WEEK_DAYS) {
    throw new Error(
      `The probation week has ${String(WEEK_DAYS)} days in it; this one has `
      + `${String(scripts.length)}.`,
    );
  }

  const scheduled = new Set<string>();

  scripts.forEach((script, index) => {
    if (script.day !== index + 1) {
      throw new Error(
        `Day ${String(index + 1)} of the week is numbered ${String(script.day)}.`,
      );
    }

    if (script.label.trim().length === 0) {
      throw new Error(`Day ${String(script.day)} has no name.`);
    }

    if (!Number.isSafeInteger(script.load) || script.load < 1) {
      throw new Error(`Day ${String(script.day)} has no difficulty on it.`);
    }

    if (!Number.isSafeInteger(script.patrolSeed) || script.patrolSeed < 0) {
      throw new Error(
        `Day ${String(script.day)} seeds the lead's rounds with something that `
        + 'is not a whole number.',
      );
    }

    if (script.inherited.length > MAX_INHERITED) {
      throw new Error(
        `Day ${String(script.day)} inherits ${String(script.inherited.length)} `
        + `tickets. The most a morning may hand anybody is ${
          String(MAX_INHERITED)
        }: the rest of a day's work arrives during the day.`,
      );
    }

    const window = dripWindow(script.day);

    for (const slot of script.drip) {
      const tick = shiftStartTick(script.day)
        + (slot.minute - SHIFT_START_MINUTE);

      if (
        slot.minute < SHIFT_START_MINUTE
        || slot.minute > SHIFT_END_MINUTE
        || tick < window.from
        || tick > window.to
      ) {
        throw new Error(
          `Day ${String(script.day)} drips "${slot.ticketId}" at `
          + `${String(Math.floor(slot.minute / 60)).padStart(2, '0')}:`
          + `${String(slot.minute % 60).padStart(2, '0')}, which is outside `
          + 'the hours anybody could start it in.',
        );
      }
    }

    for (const id of scheduledIds(script)) {
      if (scheduled.has(id)) {
        throw new Error(
          `"${id}" arrives twice in one week. A ticket is a node in the graph, `
          + 'so the second arrival is a day that quietly does nothing.',
        );
      }

      scheduled.add(id);
    }
  });

  return Object.freeze(scripts.map((script) => Object.freeze({ ...script })));
}

function scheduledIds(script: Readonly<DayScript>): readonly string[] {
  return [...script.inherited, ...script.drip.map((slot) => slot.ticketId)];
}

/** Every ticket the week deals, in the order the week deals it. */
export function scheduledTicketIds(): readonly string[] {
  return WEEK.flatMap(scheduledIds);
}

/** The shape this check needs of a ticket: an id and how it turns up. */
export interface RosterEntry {
  readonly def: { readonly id: string };
  readonly arrival: 'morning' | 'drip' | 'summoned';
}

/**
 * The week against the roster, checked where the roster is built - the same
 * shape the caught-scene gate uses, and for the same reason: content that
 * refers to content is a boot failure rather than a quiet Thursday.
 *
 * Both directions are wrong in a way nobody would notice. A day that schedules
 * a ticket nobody wrote is a day with a gap in it; a ticket written, wired up,
 * KB'd and never put in front of anybody is content that ships dead.
 */
export function assertWeekTickets<Entry extends RosterEntry>(
  roster: readonly Entry[],
): readonly Entry[] {
  const known = new Map(roster.map((entry) => [entry.def.id, entry]));

  for (const script of WEEK) {
    for (const id of scheduledIds(script)) {
      const entry = known.get(id);

      if (entry === undefined) {
        throw new Error(
          `Day ${String(script.day)} schedules "${id}", which nobody wrote.`,
        );
      }

      if (entry.arrival === 'summoned') {
        throw new Error(
          `Day ${String(script.day)} schedules "${id}", which is summoned: it `
          + 'turns up when the man who raised it decides it has, and a slot in '
          + 'the day is a slot the scheduler would then have to ignore.',
        );
      }
    }
  }

  const scheduled = new Set(scheduledTicketIds());

  for (const entry of roster) {
    if (entry.arrival !== 'summoned' && !scheduled.has(entry.def.id)) {
      throw new Error(
        `"${entry.def.id}" is not in anybody's week. Every ticket that is not `
        + 'summoned arrives on a day, or it never arrives at all.',
      );
    }
  }

  return roster;
}

export function dayScript(day: number): DayScript {
  const script = WEEK[day - 1];

  if (script === undefined) {
    throw new Error(
      `Day ${String(day)} is not part of the probation week, which is `
      + `${String(WEEK_DAYS)} days long and does not include a Saturday.`,
    );
  }

  return script;
}

/** Whether a day is inside the week at all. */
export function isWeekDay(day: number): boolean {
  return Number.isSafeInteger(day) && day >= 1 && day <= WEEK_DAYS;
}

export function isReviewDay(day: number): boolean {
  return day === REVIEW_DAY;
}

/** The minute the lead puts his head round the door on Friday. */
export function reviewTick(day: number): number {
  return shiftStartTick(day) + (REVIEW_MINUTE - SHIFT_START_MINUTE);
}

/** What the day scheduler needs from a day: a pile and a drip. */
export function dayPlan(day: number): DayPlan {
  const script = dayScript(day);
  return { inherited: script.inherited, drip: script.drip };
}

/** The tickets waiting in the queue before the day starts. */
export function inheritedTicketIds(day: number): readonly string[] {
  return dayScript(day).inherited;
}

/**
 * The seed the lead's rounds are built from on a given day. The world seed is
 * the spine; the day's own twist is what stops two days with the same shape
 * from producing the same footsteps.
 */
export function patrolSeedFor(day: number, worldSeed: number): number {
  return (worldSeed + dayScript(day).patrolSeed) >>> 0;
}

/* -- the week, scored ----------------------------------------------------- */

export interface WeekDayLine {
  readonly day: number;
  readonly label: string;
  readonly ledger: DayLedger;
}

export interface WeekScorecard {
  readonly days: readonly WeekDayLine[];
  readonly arrived: number;
  readonly closed: number;
  readonly breached: number;
  readonly stillOpen: number;
  /** What the week put in the fund, which is what the week was worth. */
  readonly earnedPence: number;
  readonly bankedPence: number;
  readonly reputation: number;
  readonly outcome: ReviewOutcome;
}

export interface WeekTotals {
  /** The fund as it stands, in pence. */
  readonly banked: number;
  /** What it held when the week started - nought, or a survived firing. */
  readonly opening: number;
  readonly reputation: number;
  readonly outcome: ReviewOutcome;
}

/**
 * Five days, added up, with nothing invented.
 *
 * Every count comes from the ticket nodes themselves - which day they spawned
 * on, whether they closed, whether they went red - and the money is the fund's
 * own movement across the week rather than a second sum kept beside it. A week
 * scorecard that adds up its own numbers is a week scorecard that can disagree
 * with the days it is made of.
 */
export function weekScorecard(
  tickets: readonly ReadOnlyGraphNode[],
  totals: Readonly<WeekTotals>,
): WeekScorecard {
  const days = WEEK.map((script): WeekDayLine => ({
    day: script.day,
    label: script.label,
    ledger: dayLedger(tickets, script.day),
  }));
  const sum = (read: (line: DayLedger) => number): number => days.reduce(
    (total, line) => total + read(line.ledger),
    0,
  );

  return {
    days: Object.freeze(days),
    arrived: sum((ledger) => ledger.arrived),
    closed: sum((ledger) => ledger.closed),
    breached: sum((ledger) => ledger.breached),
    // Not a sum: "still open" is a fact about now, and a ticket that was open
    // on Monday and closed on Thursday must not be counted as still open once
    // per day it was ignored on.
    stillOpen: tickets.filter(
      (ticket) => ticket.fields.state !== 'resolved',
    ).length,
    earnedPence: Math.max(0, totals.banked - totals.opening),
    bankedPence: totals.banked,
    reputation: totals.reputation,
    outcome: totals.outcome,
  };
}

/** Whether a tick is the minute the review lands on. */
export function isReviewTick(tick: number, day: number): boolean {
  return isReviewDay(day) && minuteOfDay(tick) === REVIEW_MINUTE;
}
