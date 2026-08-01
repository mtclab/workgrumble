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
  SHIFT_END_MINUTE,
  SHIFT_START_MINUTE,
  shiftStartTick,
} from './day';
import type { ReadOnlyGraphNode } from '../engine-api';
import { buildPatrolSchedule, patrolWindows } from './boss';
import { COMPANY_IDS } from './company';
import { FIELDS } from './fields';
import { findIncident, INCIDENTS } from './incidents';
import { FLAVOR, flavorText, type InterruptionPlan, type InterruptionSlot } from './interruptions';
import {
  HYGIENE_SYNC_MINUTE,
  HYGIENE_SYNC_MINUTES,
  meetingRuns,
  meetingScene,
  TICKET_HYGIENE_SYNC,
} from './scenes/meeting';

/** Monday to Friday. Saturday does not exist; that is the joke and the scope. */
export const WEEK_DAYS = 5;

/** The day the conversation happens on, and the minute it happens at. */
export const REVIEW_DAY = WEEK_DAYS;
export const REVIEW_MINUTE = 15 * 60;

/** The most tickets that may be waiting in a queue before nine o'clock. */
export const MAX_INHERITED = 2;

/**
 * The mark the week has to reach for the probation to continue, out of a
 * hundred - and it is a percentage of the work rather than a score.
 *
 * Forty-five, and the number is borrowed rather than invented. MetricNet run
 * hundreds of real service desks through a balanced scorecard built exactly
 * the way `weekPerformance` is built - weighted ratios, normalised so that the
 * answer always lands between nought and a hundred - and the distribution that
 * comes out of it is centred on 50, with the third quartile from 39 to 50 and
 * the bottom quartile below 39. A probation bar just under the median is
 * therefore a bar with a published meaning: not "excellent", not "the worst
 * desk in the country", but somewhere a real first-line desk actually sits.
 *
 * It replaced a bar of 40 on a summed reputation meter, and it is not the same
 * 40 wearing a new hat. Under the meter a week that quietly let half the queue
 * go red read 63 and cleared the line by twenty-three points, and got SAFER
 * with every ticket added to the roster. Under the ratio that week reads about
 * fifty and clears the line by a handful, which is what a first week at a
 * helpdesk is supposed to feel like: survived rather than won.
 *
 * The engine enforces it in the guards of the two review verbs, so it cannot
 * drift between the screen that shows it and the world that applies it.
 */
export const REVIEW_PASS_PERFORMANCE = 45;

/**
 * What surviving is worth, in pence, straight into the farm fund.
 *
 * Small enough to be a joke about the size of the farm and large enough to
 * notice on the bar, which is the same job every other number on that screen has.
 */
export const PROBATION_BONUS_PENCE = 25_000;

/**
 * The four things the conversation can end as, and `redundant` is the one that
 * is not a loss.
 *
 * Being made redundant is unfair by construction - it is decided by a ranking
 * against people whose length of service you cannot do anything about - which
 * is exactly why it must not end the run. The fund is kept, a payment goes
 * into it, the file does not travel (it belongs to the people who wrote it),
 * and what is on the other side is a different employer rather than the same
 * Monday again. `fired` stays a loss state and stays reserved FOR CAUSE: the
 * numbers, or a conduct file that landed because the numbers were not there to
 * shield it.
 *
 * Being cut for the weather changes your employer. Being cut for cause ends
 * the run. That distinction is the moral spine of the whole layer, and it is
 * enforced where it is decided - in `reviewOutcomeFor` and in the guards of
 * the three verbs it chooses between.
 */
export const REVIEW_OUTCOMES = [
  'pending',
  'passed',
  'fired',
  'redundant',
] as const;

export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

export function isReviewOutcome(value: unknown): value is ReviewOutcome {
  return typeof value === 'string'
    && REVIEW_OUTCOMES.some((outcome) => outcome === value);
}

/**
 * What one week of somebody's notice is worth, in pence.
 *
 * A week's pay at the shipped day rate, and it is a week rather than a lump
 * sum because that is what the law actually gives this person. Statutory
 * redundancy pay needs two years of continuous service; under two years there
 * is none at all, and what is left is pay in lieu of the one week's notice
 * anybody past their first month is owed. So the payment is real, it is
 * correct, and it is small - which is a better joke than a windfall and a
 * truer thing to teach: the fund survives, and being made redundant nine weeks
 * into a job is worth about a week.
 */
export const REDUNDANCY_PAYMENT_PENCE = 5 * 9_600;

/**
 * Which way the conversation goes: the mark against the bar it was held to,
 * and then - only then - the ranking.
 *
 * The bar defaults to the published figure because that is what it is in a
 * week nobody had a reason to look into. It is a PARAMETER because it moves -
 * a conduct file somebody opened raises it (`src/world/conduct.ts`) - and
 * because the same comparison is made twice, once here so the driver knows
 * which verb to offer and once in the guards of the verbs themselves, so the
 * two must be one function rather than two readings of one constant.
 *
 * The order of the two questions is the moral spine and it is worth being
 * exact about. THE BAR IS ASKED FIRST: a week that did not clear the line it
 * was held to is a firing whether or not there was a round on, so a round can
 * never launder a week somebody actually lost - the lump sum and the clean
 * file are for people cut by the weather. Only a week that CLEARED the bar can
 * be made redundant, and then the ranking decides whether it was enough to be
 * harder to justify losing than the person at the next desk.
 */
export function reviewOutcomeFor(
  performance: number,
  bar: number = REVIEW_PASS_PERFORMANCE,
  inTheCut = false,
): 'passed' | 'fired' | 'redundant' {
  if (performance < bar) {
    return 'fired';
  }

  return inTheCut ? 'redundant' : 'passed';
}

/**
 * How much of the review's number is TODAY.
 *
 * A half. Which makes the day before it a quarter, the day before that an
 * eighth, and Monday - by the time anybody is reading this out in a small room
 * on a Friday - worth about a sixteenth of the answer. That is the shape of
 * the thing being modelled: a lead who has an impression of your week, mostly
 * made of the last two days of it, and a Monday he could not swear to.
 */
export const REVIEW_WEIGHT = 0.5;

/**
 * The week's standing after a day of it, folded into the days behind it.
 *
 * Whole numbers, and rounded rather than truncated, because the review reads
 * this out and half a percentage point is not a thing anybody says.
 */
export function weightedWeekPerformance(
  carried: number,
  today: number,
): number {
  return Math.round(carried * (1 - REVIEW_WEIGHT) + today * REVIEW_WEIGHT);
}

/* -- the performance axis -------------------------------------------------- */

/**
 * How much of the mark each half of it is worth.
 *
 * Even, and both halves are ratios of the same denominator, which is what
 * makes them comparable. Closing the queue and closing it in time are two
 * different competences - a desk can resolve everything late, and a desk can
 * hit every deadline by triaging fast and fixing nothing - so the mark asks
 * both and averages them rather than crediting one twice.
 */
export const RESOLUTION_WEIGHT = 0.5;
export const SLA_WEIGHT = 1 - RESOLUTION_WEIGHT;

/** What the week handed over, and what happened to it. */
export interface WeekWork {
  readonly arrived: number;
  readonly closed: number;
  readonly breached: number;
}

/**
 * The week as a percentage of the work it was given, and the whole reason the
 * review stopped reading a meter.
 *
 * The meter was a SUM. Every ticket resolved paid its own `reward.reputation`,
 * every added ticket therefore put more credit on the table, and the price of
 * being seen on a forum was a function of the clock rather than of the roster:
 * the lead walks the corridor fifteen times a week whether the week holds
 * twenty tickets or sixty. Two lines, one scaling with content and one flat,
 * and the shipped roster of twenty-five was about two tickets short of the
 * crossover where closing the lot with the browser up beats quietly letting
 * half the queue go red. The pass bar drifted with it: a half-effort week
 * scored 63 at twenty-five tickets and would have scored more at forty,
 * because the denominator was nothing at all.
 *
 * So the answer is a fraction of what was available, in the shape service
 * desks actually use - MetricNet's balanced scorecard, COPC's weighted
 * categories - which is a weighted composite of ratios that always lands
 * between nought and a hundred:
 *
 *     resolution   = closed / arrived
 *     attainment   = (arrived - breached) / arrived
 *     mark         = 100 * (0.5 * resolution + 0.5 * attainment)
 *
 * Both are counted over the same arrivals, so a week twice the size scores
 * exactly the same for the same proportion of work done. That is the property
 * `week.test.ts` re-walks at a doubled roster and refuses to lose.
 *
 * A ticket closed after its deadline ran out is credited in the first term and
 * not in the second, which is the honest reading: it was done, and it was late.
 * Nought arrivals is not a nought mark - it is no evidence - so it answers null
 * and the standing stands.
 */
export function weekPerformance(work: Readonly<WeekWork>): number | null {
  if (work.arrived <= 0) {
    return null;
  }

  const share = (part: number): number => Math.min(
    1,
    Math.max(0, part / work.arrived),
  );

  return Math.round(100 * (
    RESOLUTION_WEIGHT * share(work.closed)
    + SLA_WEIGHT * share(work.arrived - work.breached)
  ));
}

/**
 * Where the week stands once a day of it is over: the mark for the week SO
 * FAR, folded into what the days before it read.
 *
 * The fold is what it always was and it is doing the same job - a lead whose
 * impression of you is mostly made of the last two days - but it now folds a
 * percentage rather than a meter, and the two behave differently in the one
 * way that matters. A meter accumulated: what happened on the Monday was still
 * physically in it on the Friday. A ratio does not, so the fold is the only
 * thing carrying the early week at all, and it carries it at a sixteenth.
 *
 * The mark is taken over the week TO DATE rather than over the day alone,
 * because a day's own counts do not divide: a ticket that arrives at ten to
 * five on the Monday goes red on the Tuesday, so the Tuesday would be five
 * arrivals and six breaches and a negative attainment. Arrivals and their
 * outcomes only balance once you look at the same tickets, which the week to
 * date does and a single day does not.
 */
export function weekStanding(
  carried: number,
  work: Readonly<WeekWork>,
): number {
  const mark = weekPerformance(work);
  return mark === null ? carried : weightedWeekPerformance(carried, mark);
}

/** A ticket that turns up during a shift, and the minute it nominally does. */
export interface DripSlot {
  readonly ticketId: string;
  /** Minute of the day, in the same clock the player reads: 630 is 10:30. */
  readonly minute: number;
}

/**
 * Something the world does to itself, at a minute of its own choosing.
 *
 * A cleaner's trolley wants a socket at four minutes to five. A maintenance
 * window opens at nine. Neither is a ticket and neither has any jitter on it:
 * the whole point of the recurring arc is that the two outages are at the SAME
 * minute two days apart, and a schedule that wandered by twelve minutes would
 * be a schedule with the clue taken out of it.
 */
export interface IncidentSlot {
  readonly incidentId: string;
  /** Minute of the day, on the clock the player reads. */
  readonly minute: number;
}

/**
 * Somebody messaging you directly instead of raising a ticket.
 *
 * Not an arrival: there is nothing in the queue and there is no clock. It is a
 * conversation that opens itself, with a favour already in it, and both answers
 * are legitimate - which is exactly why it is scheduled like everything else
 * rather than being a special case somewhere in the shell.
 */
export interface DmSlot {
  /** The person node who messages you. Their tree carries the opening. */
  readonly speaker: string;
  readonly minute: number;
  /** The ticket they raise, properly, if you send them to the form. */
  readonly raises: string;
  /** How long it takes them to get round to raising it. */
  readonly filesAfter: number;
  /**
   * The world fact that says you did it for them instead.
   *
   * A tick on a node: if it holds a number at or after the minute they asked,
   * the favour was done and there is nothing left to raise. It is expressed as
   * a field rather than as a flag on the conversation because the FAVOUR is a
   * change to the world - a password actually reset - and reading the world is
   * the only way to know whether it happened, whichever surface did it.
   */
  readonly doneWhen: { readonly node: string; readonly field: string };
}

export interface DayScript {
  readonly day: number;
  /** What the brief calls it. */
  readonly label: string;
  /** Tickets already in the queue at 08:00. Two, at the very most. */
  readonly inherited: readonly string[];
  /** Tickets that arrive while the player is working. */
  readonly drip: readonly DripSlot[];
  /** What the world does today, whether or not anybody is watching. */
  readonly incidents?: readonly IncidentSlot[];
  /** Who messages you directly today, and when. */
  readonly dms?: readonly DmSlot[];
  /**
   * What takes the screen off you today: the calls, the summons, the meeting.
   *
   * Three of them in the shipped week, one per shape the cost model has: a
   * call that CAN be benign because it carries the ticket it is about
   * (Tuesday), a block nobody can refuse (Wednesday), and a call about
   * nothing anybody here is responsible for (Thursday). Monday is left alone
   * because Monday is the day the two basic tools are taught, and Friday
   * because Friday already has a conversation at three o'clock in it.
   */
  readonly interruptions?: readonly InterruptionSlot[];
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
 * Monday hands the player the two tickets the two basic tools are taught on -
 * a screen somebody has rotated and an account somebody has locked - and drips
 * in the one they filed about their own desk, mid-morning, like a conscience.
 * The office-wide fault, which is the only one in the shipped world, waits for
 * Thursday, because Thursday is the day the ramp says should hurt. Friday
 * brings nothing new: Friday is about the conversation at three.
 *
 * Wednesday and Friday carry no shipped ticket at all, and that is what the
 * `load` column is for. Five tickets across five days is a thin week; the
 * numbers say what each day is FOR, and lane C fills them.
 *
 * The two drive tickets went into the two afternoons the week had left. Both
 * are read the same way - a directory listing, held against what the person on
 * the phone believes - and both close on one verb, so neither changes what its
 * day is FOR. Wednesday's morning is a flood, which is bookkeeping rather than
 * diagnosis, and its afternoon had nothing in it at all; Friday was a whole
 * ticket lighter than every other day and did not open until half past ten.
 * Monday was left alone deliberately: it is four tickets at difficulty one
 * already, and it is the day the two basic tools are taught.
 */
export const WEEK: readonly DayScript[] = validateWeek([
  {
    day: 1,
    label: 'Monday',
    inherited: ['ticket:rotated-screen', 'ticket:locked-account'],
    drip: [
      { ticketId: 'ticket:fan-noise', minute: 10 * 60 + 20 },
      { ticketId: 'ticket:flat-mouse', minute: 13 * 60 + 40 },
    ],
    // Four minutes to five, in a corridor nobody from this floor is in. The
    // ticket about it is Tuesday's; tonight it is two lines in a log.
    incidents: [
      {
        incidentId: INCIDENTS.cleanerNeedsTheSocket,
        minute: 16 * 60 + 56,
      },
    ],
    patrolSeed: 0,
    load: 1,
  },
  {
    day: 2,
    label: 'Tuesday',
    inherited: ['ticket:vacuum-tuesday', 'ticket:wedged-spooler'],
    drip: [
      { ticketId: 'ticket:tidied-list', minute: 11 * 60 },
      { ticketId: 'ticket:mailbox-access', minute: 13 * 60 },
    ],
    // Five past ten, and the woman whose printer it is has remembered
    // something. It carries the ticket it is about, which is what makes it
    // capable of being BENIGN - and whether it actually is one is decided at
    // the minute it lands, by whether the player is on that ticket. A call
    // about the work in hand costs no focus and moves the ticket; the same
    // call to somebody who has wandered off it costs the twenty-three
    // minutes, and the row cannot know which it will be.
    interruptions: [
      {
        id: 'interruption:spooler-call',
        source: 'call',
        minute: 10 * 60 + 5,
        minutes: 6,
        relatedTicket: 'ticket:wedged-spooler',
        declinable: true,
        synchronous: true,
        severity: 1,
        // Somebody deciding to pick the phone up is not an appointment, so it
        // is allowed to wander - unlike the meeting two days later, which is
        // announced and therefore cannot.
        jitter: 4,
        flavor: {
          [FLAVOR.caller]: COMPANY_IDS.nina,
          [FLAVOR.subject]: 'The printer, and a thing she left off the ticket',
          [FLAVOR.opens]: 'ringing-spooler',
          [FLAVOR.opensFumbling]: 'ringing-spooler-shaky',
        },
      },
    ],
    // Half past two, and somebody who would rather message you than file
    // anything. Say no politely and there is a ticket at twenty past.
    dms: [
      {
        speaker: COMPANY_IDS.terry,
        minute: 14 * 60 + 10,
        raises: 'ticket:must-change-password',
        // Ten minutes, which is how long it takes him to find the form in a
        // folder called Later.
        filesAfter: 10,
        doneWhen: {
          node: COMPANY_IDS.terryAccount,
          field: FIELDS.passwordResetAt,
        },
      },
    ],
    patrolSeed: 1_301,
    load: 2,
  },
  {
    day: 3,
    label: 'Wednesday',
    inherited: ['ticket:licence-exhausted'],
    drip: [
      { ticketId: 'ticket:mfa-reregister', minute: 9 * 60 + 50 },
      { ticketId: 'ticket:share-maintenance', minute: 10 * 60 + 20 },
      { ticketId: 'ticket:share-dup-terry', minute: 11 * 60 + 10 },
      // Wednesday's whole morning was a flood, which is bookkeeping rather
      // than diagnosis, and its afternoon was empty. This is the day's one
      // piece of arithmetic: a listing's own byte total held against the free
      // space in its footer, on a box that has been quietly full since 1997.
      { ticketId: 'ticket:disk-full', minute: 14 * 60 + 40 },
    ],
    incidents: [
      { incidentId: INCIDENTS.maintenanceWindow, minute: 9 * 60 },
      {
        incidentId: INCIDENTS.cleanerNeedsTheSocket,
        minute: 16 * 60 + 56,
      },
    ],
    // Half past ten, mid-week, prime working time, on the morning the flood
    // arrives - which is the whole of the mechanic. It is announced from the
    // Monday, it takes no jitter because a wandering appointment would make
    // the summons mail a lie, and it is neither declinable nor deferrable:
    // the two refusals exist to say WHY, which is the point of them.
    interruptions: [
      {
        id: 'interruption:hygiene-sync',
        source: 'meeting',
        minute: HYGIENE_SYNC_MINUTE,
        minutes: HYGIENE_SYNC_MINUTES,
        relatedTicket: null,
        declinable: false,
        synchronous: true,
        severity: 3,
        flavor: {
          [FLAVOR.scene]: TICKET_HYGIENE_SYNC.id,
          [FLAVOR.subject]: TICKET_HYGIENE_SYNC.subject,
        },
      },
    ],
    patrolSeed: 5_927,
    load: 3,
  },
  {
    day: 4,
    label: 'Thursday',
    inherited: ['ticket:vacuum-thursday', 'ticket:stale-device-relock'],
    drip: [
      { ticketId: 'ticket:vpn-cert-expired', minute: 10 * 60 },
      { ticketId: 'ticket:vpn-cert-dup-ada', minute: 10 * 60 + 15 },
      { ticketId: 'ticket:vpn-cert-dup-gary', minute: 10 * 60 + 35 },
    ],
    // Twenty past eleven, in the middle of a certificate flood, about a
    // printer in a building this desk does not hold the contract for. It
    // carries no ticket at all, which is not an omission - it is the malignant
    // half of the cost model, and the reason it costs what it costs.
    interruptions: [
      {
        id: 'interruption:annexe-printer',
        source: 'call',
        minute: 11 * 60 + 20,
        minutes: 5,
        relatedTicket: null,
        declinable: true,
        synchronous: true,
        severity: 2,
        jitter: 6,
        flavor: {
          [FLAVOR.caller]: COMPANY_IDS.vic,
          [FLAVOR.subject]: 'A printer in the annexe, making a noise',
          [FLAVOR.opens]: 'ringing-annexe',
          [FLAVOR.opensFumbling]: 'ringing-annexe-shaky',
        },
      },
    ],
    patrolSeed: 8_803,
    load: 4,
  },
  {
    day: 5,
    label: 'Friday',
    inherited: ['ticket:phishing-report'],
    drip: [
      // Twenty to ten, which is when somebody who needs a file for a run that
      // goes today finds out it is not where they left it. Friday was the
      // lightest day in the week by a whole ticket and its first arrival was
      // not until half past ten; this one is a hunt with a one-line fix, and
      // the day it belongs to is the day somebody has time to look.
      { ticketId: 'ticket:saved-into-temp', minute: 9 * 60 + 40 },
      { ticketId: 'ticket:coverup-backup', minute: 10 * 60 + 30 },
      { ticketId: 'ticket:hr-report-macro', minute: 11 * 60 + 15 },
    ],
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
  const interruptions = new Set<string>();

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

    // Everything else in a day happens at a minute somebody chose, and a
    // minute outside the hours anybody is at the desk is a beat nobody sees.
    // No jitter on either: an incident is a timetable, which is the clue, and
    // a message that wandered would be a message that could land at lunch.
    for (const slot of script.incidents ?? []) {
      if (findIncident(slot.incidentId) === undefined) {
        throw new Error(
          `Day ${String(script.day)} runs "${slot.incidentId}", which nobody `
          + 'wrote.',
        );
      }

      requireWorkingMinute(script.day, slot.minute, slot.incidentId);
    }

    for (const slot of script.dms ?? []) {
      requireWorkingMinute(script.day, slot.minute, slot.speaker);
      // And the ticket they eventually raise has to land inside the day as
      // well: a favour refused at ten to five is a ticket nobody is here for.
      requireWorkingMinute(
        script.day,
        slot.minute + slot.filesAfter,
        slot.raises,
      );
    }

    // An interruption's id is what the world records the player's decision
    // against, so two of them sharing one would share the record - and the
    // second would arrive already answered. The check is week-wide rather than
    // per day for the same reason a ticket's is: the field it is written into
    // is not cleared overnight.
    for (const slot of script.interruptions ?? []) {
      requireWorkingMinute(script.day, slot.minute, slot.id);
      requireMeetingContent(script.day, slot);

      if (interruptions.has(slot.id)) {
        throw new Error(
          `"${slot.id}" interrupts twice in one week. Two interruptions with `
          + 'one id share the record of what was done about them, so the '
          + 'second arrives already answered.',
        );
      }

      interruptions.add(slot.id);
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

function requireWorkingMinute(
  day: number,
  minute: number,
  what: string,
): void {
  if (minute < SHIFT_START_MINUTE || minute > SHIFT_END_MINUTE) {
    throw new Error(
      `Day ${String(day)} puts "${what}" at `
      + `${String(Math.floor(minute / 60)).padStart(2, '0')}:`
      + `${String(minute % 60).padStart(2, '0')}, which is outside the hours `
      + 'anybody is at the desk.',
    );
  }
}

/**
 * A meeting has a room in it, and the room has to have been written.
 *
 * `interruptions.ts` already refuses a meeting that carries no scene NAME -
 * that is structure, and it is the only half that module can check without
 * knowing what a meeting scene is. This is the other half: the name has to be
 * one somebody wrote, and the block has to be long enough to hold everything
 * said in it. Both failures look identical in play - a window that goes quiet
 * halfway through - and neither looks like a bug in the file.
 */
function requireMeetingContent(
  day: number,
  slot: Readonly<InterruptionSlot>,
): void {
  if (slot.source !== 'meeting') {
    return;
  }

  const named = flavorText(slot, FLAVOR.scene) ?? '';
  const scene = meetingScene(named);

  if (scene === undefined) {
    throw new Error(
      `Day ${String(day)} sits the player in "${named}", which nobody wrote.`,
    );
  }

  if (meetingRuns(scene) >= slot.minutes) {
    throw new Error(
      `Day ${String(day)} books ${String(slot.minutes)} minutes for `
      + `"${scene.id}" and the room is still talking at minute `
      + `${String(meetingRuns(scene))}. A beat nobody hears is a beat nobody `
      + 'wrote.',
    );
  }
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

  // A message that raises a ticket nobody wrote is a Tuesday afternoon that
  // throws at twenty past two, in front of a player, on a beat that only fires
  // when they were polite about it.
  for (const script of WEEK) {
    for (const slot of script.dms ?? []) {
      const entry = known.get(slot.raises);

      if (entry === undefined) {
        throw new Error(
          `Day ${String(script.day)} lets "${slot.speaker}" raise `
          + `"${slot.raises}", which nobody wrote.`,
        );
      }

      if (entry.arrival !== 'summoned') {
        throw new Error(
          `"${slot.raises}" is raised by a message and arrives `
          + `"${entry.arrival}". A ticket somebody files because you said no `
          + 'cannot also be dealt by the morning.',
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

/** What the world does today, and who messages you, earliest first. */
export function incidentsOn(day: number): readonly IncidentSlot[] {
  return isWeekDay(day) ? dayScript(day).incidents ?? [] : [];
}

export function directMessagesOn(day: number): readonly DmSlot[] {
  return isWeekDay(day) ? dayScript(day).dms ?? [] : [];
}

/** What takes the screen off you today, as the week's table declares it. */
export function interruptionsOn(day: number): readonly InterruptionSlot[] {
  return isWeekDay(day) ? dayScript(day).interruptions ?? [] : [];
}

/**
 * Everything `buildInterruptionSchedule` needs for a day of this week: what
 * was authored, and which minutes the screen is already spoken for.
 *
 * This is where the two schedules meet, and it is the only place they do. The
 * lead's rounds are built first and handed over as windows, so an interruption
 * cannot land on top of a patrol, a caught scene, or the walk back from one -
 * one takeover at a time - and the boss cannot be at your shoulder while he is
 * also chairing the meeting. `interruptions.ts` stays ignorant of what a
 * patrol is shaped like, which is what lets a test construct a collision by
 * hand instead of reverse-engineering a seed that produces one.
 */
export function interruptionPlanFor(
  day: number,
  worldSeed: number,
): InterruptionPlan {
  if (!isWeekDay(day)) {
    return { slots: [], blocked: [] };
  }

  return {
    slots: interruptionsOn(day),
    blocked: patrolWindows(
      buildPatrolSchedule(day, patrolSeedFor(day, worldSeed)),
    ),
  };
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
  /** The mark out of a hundred the conversation on Friday was had about. */
  readonly performance: number;
  /**
   * And the mark it had to reach, which is not always the published one: a
   * conduct file somebody had a reason to open raises it.
   */
  readonly bar: number;
  /** Why the bar is that number, in the world's own words. Empty until read. */
  readonly conduct: string;
  /**
   * And what the round read, if there was one on: the ranking, the three lines
   * it was scored from and the person immediately either side of the player.
   * Empty in a quiet week, which is every week the probation has.
   */
  readonly criteria: string;
  readonly outcome: ReviewOutcome;
}

export interface WeekTotals {
  /** The fund as it stands, in pence. */
  readonly banked: number;
  /** What it held when the week started - nought, or a survived firing. */
  readonly opening: number;
  readonly performance: number;
  readonly bar: number;
  readonly conduct: string;
  readonly criteria: string;
  readonly outcome: ReviewOutcome;
}

/**
 * The work the week has handed over up to and including a day, out of the
 * ticket nodes themselves.
 *
 * The same day ledgers the scorecard is built from, added up - so the number
 * the review is decided on and the numbers on the screen beside it cannot come
 * from two different readings of the same week. Days that have not happened
 * yet contribute nothing, because a ticket that has not arrived is not a node.
 */
export function weekWorkThrough(
  tickets: readonly ReadOnlyGraphNode[],
  day: number,
): WeekWork {
  const through = Math.min(Math.max(day, 0), WEEK_DAYS);
  const days = Array.from(
    { length: through },
    (_, index) => dayLedger(tickets, index + 1),
  );
  const sum = (read: (line: DayLedger) => number): number => days.reduce(
    (total, ledger) => total + read(ledger),
    0,
  );

  return {
    arrived: sum((ledger) => ledger.arrived),
    closed: sum((ledger) => ledger.closed),
    breached: sum((ledger) => ledger.breached),
  };
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
    performance: totals.performance,
    bar: totals.bar,
    conduct: totals.conduct,
    criteria: totals.criteria,
    outcome: totals.outcome,
  };
}
