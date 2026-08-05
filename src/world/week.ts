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
  SHIFT_MINUTES,
  SHIFT_START_MINUTE,
  shiftStartTick,
  tickAtMinute,
} from './day';
import type { ReadOnlyGraphNode } from '../engine-api';
import type { AfterHoursSlot } from './after-hours';
import { buildPatrolSchedule, patrolWindows } from './boss';
import {
  CHANNELS,
  type ChannelMessage,
  channelMessageAt,
  type ChannelMessageSlot,
  validateChannelSlots,
} from './channels';
import {
  type LinkedRequestSlot,
  validateRequestSlots,
} from './requests';
import { COMPANY_IDS } from './company';
import { FIELDS } from './fields';
import { findIncident, INCIDENTS } from './incidents';
import {
  FLAVOR,
  flavorText,
  INTERRUPTION_CLOSES_BEFORE,
  type InterruptionPlan,
  type InterruptionSlot,
} from './interruptions';
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

/**
 * A ticket that turns up during a shift, and when.
 *
 * Two ways to say when, and exactly one of them per row - the loader refuses
 * both and refuses neither, because a slot with two answers is a slot whose
 * arrival depends on which field a reader looked at first.
 */
export interface DripSlot {
  readonly ticketId: string;
  /** Minute of the day, in the same clock the player reads: 630 is 10:30. */
  readonly minute?: number;
  /**
   * Or the same minute counted BACKWARDS from the end of the shift, which is
   * the whole of the 4:55 class.
   *
   * It is data rather than a feature and it is written this way round on
   * purpose: what makes the request land is its distance from home time, not
   * the hour on the clock, and a row that typed 1015 would say nothing about
   * why. Five means five to five; the loader turns it into a minute, refuses a
   * negative one and refuses one longer than the shift, and the arrival is
   * PINNED - no jitter, no pulling it back inside the ordinary drip window,
   * because being outside that window is the point.
   *
   * What it costs the player is honest arithmetic rather than a scripted
   * cruelty: the response clock runs in business minutes, so a ticket raised
   * five minutes before close with an hour on it is not late until tomorrow
   * morning - and it is somebody's tomorrow morning either way.
   */
  readonly arrivesMinutesBeforeClose?: number;
}

/**
 * The minute a drip slot actually asks for, whichever way it asked.
 *
 * One reader, so the loader, the day plan and any test all get the same
 * answer. It trusts the loader for sense: `validateWeek` has already refused
 * a row with both fields, a row with neither, and a distance from close that
 * is not a distance.
 */
export function dripMinute(slot: Readonly<DripSlot>): number {
  return slot.minute
    ?? SHIFT_END_MINUTE - (slot.arrivesMinutesBeforeClose ?? 0);
}

/** Whether this row is the 4:55 class, which places differently. */
export function arrivesBeforeClose(slot: Readonly<DripSlot>): boolean {
  return slot.arrivesMinutesBeforeClose !== undefined;
}

/**
 * Somebody who did not message and did not ring: they walked over.
 *
 * The interruption row is the half that takes the screen - it is an ordinary
 * `walk_up` entry and goes through the same schedule, the same precedence and
 * the same three answers as everything else in the family. What is here as
 * well is the half a call does not have: the ASK. A walk-up is somebody
 * standing at the desk with something that should be a ticket, so it carries
 * the same three fields the direct message carries, for the same reason and
 * read by the same rule - the world fact that says the job got done, the
 * ticket they raise when it did not, and how long they take to get round to
 * raising it.
 *
 * Both answers are legitimate. Doing it off the books costs the minutes it
 * costs and leaves nothing behind: no ticket, no clock, no line on Friday's
 * card. Sending them to the form leaves a ticket with a deadline on it and
 * credit at the end of the week. The difference turns up on the scorecard
 * rather than in a telling-off, which is the whole of the lesson and is the
 * same shape `DmSlot` already teaches from a chat window.
 */
export interface WalkUpSlot {
  /** The interruption that puts them at your shoulder. */
  readonly slot: InterruptionSlot;
  /** The ticket they raise, properly, if the job does not get done. */
  readonly raises: string;
  /** How long after they walk away it takes them to get round to it. */
  readonly filesAfter: number;
  /**
   * The world fact that says you did it for them instead.
   *
   * A tick on a node: if it holds a number at or after the minute they asked,
   * the favour was done and there is nothing left to raise. Read off the graph
   * rather than off which button was pressed, because the FAVOUR is a change
   * to the world and reading the world is the only way to know it happened -
   * whichever surface did it, and whether or not the conversation was the
   * thing that prompted it.
   */
  readonly doneWhen: { readonly node: string; readonly field: string };
}

/**
 * Somebody opening a chat with the word "Hi." and then nothing.
 *
 * Not an arrival, not a takeover, and not a cost the world charges: the whole
 * mechanic is the GAP. The thread opens with a greeting and no question in it,
 * a typing indicator cycles, and the minutes it cycles for are minutes of the
 * shift like any other. Asking what they want gets the question immediately;
 * waiting gets it when they have finished typing it, which is the same
 * question and several minutes later.
 *
 * It is scheduled like everything else rather than being a special case in the
 * chat window, because a beat nobody can put on a calendar is a beat nobody
 * can balance.
 */
export interface NoHelloSlot {
  /** The person node who says hello. Their tree carries what comes next. */
  readonly speaker: string;
  readonly minute: number;
  /**
   * How long they take to type the actual question, in simulated minutes.
   *
   * The number is the cost, said out loud in data: waiting it out is these
   * many minutes of a shift that does not stop, and the reply that skips it is
   * one click. Both are legitimate; only one of them is free.
   */
  readonly typingMinutes: number;
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
   * What takes the screen off you today: the calls, the summons, the meeting,
   * the message.
   *
   * One per shape the cost model has: a call that CAN be benign because it
   * carries the ticket it is about (Tuesday), a block nobody can refuse
   * (Wednesday), a call about nothing anybody here is responsible for
   * (Thursday), and - on that same Thursday - a chat message that reads the
   * dot, which is what makes Do Not Disturb finally cost something the player
   * can discover inside probation. The chat beat does not hold the desk, so it
   * is not a takeover and Thursday's takeover load is unchanged. Monday is left
   * alone because Monday is the day the two basic tools are taught, and Friday
   * because Friday already has a conversation at three o'clock in it.
   */
  readonly interruptions?: readonly InterruptionSlot[];
  /**
   * And who comes to the desk in person, which is an interruption with an ask
   * attached to it.
   *
   * A column of its own rather than a flag on the one above, because the
   * interruption is only half of a walk-up: the other half is the favour, and
   * a favour has a ticket, a delay and a world fact behind it. `interruptionsOn`
   * folds the two columns together so the schedule never learns the
   * difference - one takeover at a time still means one takeover at a time.
   */
  readonly walkUps?: readonly WalkUpSlot[];
  /** And who opens a chat with "Hi." and then makes you wait for the rest. */
  readonly noHello?: readonly NoHelloSlot[];
  /**
   * And what lands in the Hubbub rooms today - the channel client the company
   * rolled out, which is the third coat a request can arrive in.
   *
   * The 0.5.0 intake seam (`src/world/channels.ts`): a message has a room, an
   * author, a body, an arrival minute, and optionally the player's name on it,
   * a ticket it is about, and a thread it answers into. Nothing about one
   * dispatches - a scripted week that never opens the window produces the
   * same world, byte for byte - and slices 2 and 3 build on this column
   * rather than on any window.
   */
  readonly channels?: readonly ChannelMessageSlot[];
  /**
   * And the same question arriving in several places at once (0.5.0 slice 2).
   *
   * A linked request is one human asking one thing in mail, in one-to-one chat
   * and in a Hubbub room on the same morning. The mail and chat copies are
   * authored here; the Hubbub copy is a `ChannelMessageSlot` in the column
   * above carrying this request's id, and the loader checks the two agree. The
   * player converts it into a ticket (credited), answers the human off the
   * books (grateful, invisible), or sends them to the form - and resolving it
   * on any one surface quietens all three. Nothing dispatches on arrival, so a
   * week that ignores it is byte-identical to one from before it existed.
   */
  readonly requests?: readonly LinkedRequestSlot[];
  /**
   * And who pings you AFTER you clock off, in the gap before the next login.
   *
   * These are a property of the day BOUNDARY rather than of the shift: they
   * arrive overnight, they are read on the next morning's brief, and they are
   * neither tickets nor interruptions. A day authored here shows its pings on
   * the FOLLOWING morning, so Friday's night has nowhere to be read and the last
   * day carries none. See `src/world/after-hours.ts` for the trade they teach.
   */
  readonly afterHours?: readonly AfterHoursSlot[];
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
    // Ten to eleven, and the man with eleven years' service opening with the
    // word "Hi." and nothing else. Monday keeps its rule - nothing takes the
    // desk on the day the two basic tools are taught - because this takes
    // nothing: it is a line in a chat window, and what it costs is the five
    // minutes somebody spends watching a typing indicator instead of asking.
    noHello: [
      {
        speaker: COMPANY_IDS.owen,
        minute: 10 * 60 + 50,
        typingMinutes: 5,
      },
    ],
    // And the rooms, on the morning the rollout lands. Three messages, all
    // Monday, all inert on a scripted walk: the welcome nobody asked for in
    // #announcements, and - in #helpdesk - the week's first request wearing
    // its third coat: the man whose account is locked, asking the queue's
    // question in a room, with the player's name on it, plus the colleague
    // answering INTO the thread so the window has a thread to draw. The
    // ticket it names is Monday's own inherited one, so the message and the
    // queue agree about what the morning is about. #water-cooler is left
    // empty on purpose: the empty room is a state the window must be honest
    // about, and shipped data is how that stays tested.
    channels: [
      {
        id: 'hub:welcome',
        channel: 'chan:announcements',
        author: COMPANY_IDS.boss,
        body: 'Welcome to Hubbub! From today this is where work happens. '
          + 'No more long email chains - just drop it in the room! Please '
          + 'keep tickets going through the ticket system as normal.',
        minute: 9 * 60 + 5,
      },
      {
        id: 'hub:gary-account',
        channel: 'chan:helpdesk',
        author: COMPANY_IDS.gary,
        body: '@you any movement on my account? Raising it here as well in '
          + 'case the ticket system is also locked out.',
        minute: 9 * 60 + 40,
        mentionsPlayer: true,
        relatedTicket: 'ticket:locked-account',
      },
      {
        id: 'hub:owen-reply',
        channel: 'chan:helpdesk',
        author: COMPANY_IDS.owen,
        body: 'It is never the ticket system.',
        minute: 9 * 60 + 48,
        replyTo: 'hub:gary-account',
      },
    ],
    // And, sometime after you have gone home, the man with eleven years'
    // service remembering the thing he did not say on the phone. It is read on
    // Tuesday's brief, it can be waved off by an overnight Do Not Disturb (he
    // would not ping a busy dot), and answering it is a point of being the sort
    // of person who answers, paid for with a point of it following you in.
    afterHours: [
      {
        id: 'after:owen-monitor',
        speaker: COMPANY_IDS.owen,
        subject: 'Meant to say - the second screen has gone again. Not urgent, '
          + 'it is gone eight, I only just sat down.',
        declinable: true,
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
        id: 'call:spooler',
        source: 'call',
        minute: 10 * 60 + 5,
        minutes: 6,
        relatedTicket: 'ticket:wedged-spooler',
        declinable: true,
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
    // Ten to ten, and the same question in three windows at once: Bev on
    // reception needs the VPN for a day working from home, and has asked in the
    // inbox, in a one-to-one chat, and in #helpdesk, all within a couple of
    // minutes, because she is not sure which one anybody reads. It is the
    // modern pathology made playable (0.5.0 slice 2): the copies are noise,
    // answering her anywhere satisfies her, and only converting it into a
    // ticket is worth anything on Friday. The Hubbub copy is the channel
    // message below carrying this id; the mail and chat copies are here.
    //
    // Nothing about it dispatches on arrival - a walk that ignores it is
    // byte-identical to before it existed - and the summoned ticket it converts
    // into (Bev not being in VPN Users) closes on the same one directory move
    // Marcus's month-end request does.
    requests: [
      {
        id: 'req:bev-vpn',
        reporter: COMPANY_IDS.bev,
        subject: 'VPN for a day working from home',
        raises: 'ticket:bev-vpn-request',
        minute: 9 * 60 + 50,
        mail: 'Morning - I am working from home on Thursday while the boiler is '
          + 'off and I cannot get the remote thing to let me in. Could you sort '
          + 'it? Sorry if this is the wrong place to ask.',
        chat: 'hiya - did you see my email about the VPN? working from home '
          + 'thurs and it will not have me. also put it in the helpdesk room in '
          + 'case!',
      },
    ],
    // And the room copy of the same request, in #helpdesk, with the player's
    // name on it. It carries the request id, which is what turns it from a post
    // into the surface the convert / answer / deflect bar hangs off - and what
    // makes resolving it here quieten the mail and the chat as well.
    channels: [
      {
        id: 'hub:bev-vpn',
        channel: 'chan:helpdesk',
        author: COMPANY_IDS.bev,
        body: '@you sorry to chase - VPN for Thursday, working from home. '
          + 'Emailed and messaged too, not sure which you use!',
        minute: 9 * 60 + 50,
        mentionsPlayer: true,
        request: 'req:bev-vpn',
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
      /**
       * And five minutes before everybody goes home, which is the whole of
       * what this row says.
       *
       * It is written as a distance from close rather than as 16:55 because
       * the distance is the content: what makes it the request it is has
       * nothing to do with the hour on the clock and everything to do with
       * there being five minutes of shift left. The loader turns it into a
       * minute, it takes no jitter, and it is deliberately outside the window
       * every other arrival is pulled back inside - the rule that says "a
       * ticket you cannot start is a cheat" is the rule this class exists to
       * be the honest exception to.
       *
       * Wednesday rather than Friday, and that is the point of shipping it at
       * all: the seed this generalizes was a Friday-at-17:55 cliffhanger, and
       * a field that only ever appeared on a Friday would be a Friday wearing
       * a field's clothes. Mid-week, its response window crosses the night by
       * the business-hours arithmetic that was already there - an hour from
       * 16:55 is five minutes of tonight and fifty-five of tomorrow, so it is
       * not late until 09:55 on the Thursday, and nobody had to script that.
       */
      { ticketId: 'ticket:vpn-month-end', arrivesMinutesBeforeClose: 5 },
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
        id: 'meeting:hygiene-sync',
        source: 'meeting',
        minute: HYGIENE_SYNC_MINUTE,
        minutes: HYGIENE_SYNC_MINUTES,
        relatedTicket: null,
        declinable: false,
        severity: 3,
        flavor: {
          [FLAVOR.scene]: TICKET_HYGIENE_SYNC.id,
          [FLAVOR.subject]: TICKET_HYGIENE_SYNC.subject,
        },
      },
    ],
    // And, late on, somebody trying to log in from home about the month-end
    // run and finding the VPN will not have him. Read on Thursday's brief, waved
    // off by an overnight Do Not Disturb like Owen's - the second of the week's
    // two pings, which is what makes the surface a habit rather than a one-off.
    afterHours: [
      {
        id: 'after:terry-vpn',
        speaker: COMPANY_IDS.terry,
        subject: 'Trying to get on from home for the month end and the VPN is '
          + 'having none of it. Is that a tonight thing or a tomorrow thing?',
        declinable: true,
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
    // Ten to eleven, and the anxious one from Marketing messaging you a quick
    // question that is not a ticket and never will be - the shared calendar is
    // an hour out and it is the clocks, not IT. It is the presence triangle's
    // whole point made playable: a red dot slides it (chat READS_THE_DOT and it
    // is declinable), so a player who has been sitting on Do Not Disturb all
    // morning to dodge it collects the working-dot drip and, past the mark with
    // the lead reading the dot, the "on Do Not Disturb all morning" beat; an
    // honest dot takes the message and the malignant refocus window it leaves.
    // A chat beat, not a takeover - it does not hold the desk - so Thursday's
    // takeover load (the printer and the workstation) is unchanged. Ten to
    // eleven is deliberate: by then a morning spent behind the dot has dripped
    // close to the beat's mark, so dodging this and meeting the lead are the
    // same morning.
    interruptions: [
      {
        id: 'chat:dennis-calendar',
        source: 'chat',
        minute: 10 * 60 + 50,
        // Four minutes: a quick question is a quick question. It takes the call
        // window and the clock, like any interruption that reads the dot, and
        // it hands them straight back - it is the lightest shape in the family,
        // which is what keeps the week from being a wall of takeovers (F0).
        minutes: 4,
        // No ticket, by construction: it is about no work anybody is holding,
        // which makes it malignant every time and costs the refocus window at
        // the far end of it - the same half the annexe printer teaches, one
        // register over.
        relatedTicket: null,
        declinable: true,
        severity: 1,
        // No jitter. A message is not an appointment, but it is also not
        // somebody deciding to pick a phone up mid-thought - it is pinned so the
        // beat lands where a morning of the dot has dripped it to, which is the
        // whole reason it is on this minute.
        flavor: {
          [FLAVOR.caller]: COMPANY_IDS.dennis,
          [FLAVOR.subject]: 'A quick question about the shared calendar',
          [FLAVOR.opens]: 'chat-dennis',
          [FLAVOR.opensFumbling]: 'chat-dennis-shaky',
        },
      },
      {
        id: 'call:annexe-printer',
        source: 'call',
        minute: 11 * 60 + 20,
        minutes: 5,
        relatedTicket: null,
        declinable: true,
        severity: 2,
        jitter: 6,
        flavor: {
          [FLAVOR.caller]: COMPANY_IDS.vic,
          [FLAVOR.subject]: 'A printer in the annexe, making a noise',
          [FLAVOR.opens]: 'ringing-annexe',
          [FLAVOR.opensFumbling]: 'ringing-annexe-shaky',
        },
      },
      /**
       * And ten past two, on the one day of the week that had no machine in
       * it, which is the whole reason it is on this day: Tuesday rings,
       * Wednesday books half an hour, Thursday is where the workstation gets
       * its turn, and the fourth shape of the family joins the day that had
       * none.
       *
       * It takes no jitter. An announced hour cannot wander, and this one has
       * been announced since September in a dialog nobody read - but the real
       * reason is meaner than that: an update is not a person deciding to
       * pick the phone up. It happens at the minute it was scheduled for by
       * somebody who has never met you.
       *
       * Twelve minutes, and three windows of ten, five and two. The worst
       * case is 14:10 + 17 + 12 = 14:39, which is the loader's arithmetic and
       * lands with two hours of shift still to run - so every one of the
       * three windows is genuinely the player's to spend, and spending all of
       * them cannot push the outage out of the day. The afternoon is warm by
       * then (a certificate flood with two duplicates hanging off it), so the
       * budget is a real decision rather than a formality: ten minutes is
       * long enough to finish a ticket, five to write a work note, two to
       * save.
       */
      {
        id: 'machine:reboot',
        source: 'machine',
        minute: 14 * 60 + 10,
        minutes: 12,
        // Nobody's ticket, by construction rather than by omission: a
        // workstation restarting is about no work anybody is holding, which
        // is what makes it malignant every time and costs the refocus window
        // at the far end of it.
        relatedTicket: null,
        declinable: false,
        severity: 3,
        postpones: [10, 5, 2],
        flavor: {
          [FLAVOR.subject]: 'Security updates outstanding since September',
        },
      },
    ],
    // Twenty-five to ten, and the new starter doing it for the opposite
    // reason to Owen: he has been told not to be abrupt with people. Thursday
    // is the heavy day and this is the cheapest beat in the week - one line in
    // a chat window, three minutes of typing indicator, and a question that
    // was never worth a ticket in the first place.
    noHello: [
      {
        speaker: COMPANY_IDS.kwame,
        minute: 9 * 60 + 35,
        typingMinutes: 3,
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
    /**
     * Twenty to twelve, and somebody at the desk rather than on the phone.
     *
     * Friday is the day that had nothing taking the screen at all - the call
     * is Tuesday's, the room is Wednesday's, the workstation is Thursday's -
     * so the fifth shape of the family joins the day that had none, exactly
     * as the fourth did. It is also the right day for it in fiction: the
     * queue is light, the review is at three, and a two-minute favour is at
     * its most tempting on the morning where there is obviously time.
     *
     * It carries no ticket of its own (`relatedTicket: null`) because it is
     * about no work anybody is holding, which makes it malignant by
     * construction and costs the refocus window at the far end. It is
     * declinable - you can say not now to a person, which is more than you
     * can say to a workstation - and it takes no jitter, because he came down
     * on his way past and payroll runs to a timetable.
     *
     * PAYROLL-04 is deliberately a machine no other ticket in the roster is
     * about. A dispatch aimed at a ticket's estate stops that ticket's
     * response clock, so a favour done on a machine that some OTHER ticket is
     * also about would quietly mark that one as answered - which is a real
     * mechanic being used by accident, and the sort of cross-talk that reads
     * as a bug in the conduct file rather than as a choice here.
     *
     * What the dot does to it is nothing at all: `walk_up` is exempt in
     * `READS_THE_DOT`, because a body at the desk can see you.
     */
    walkUps: [
      {
        slot: {
          id: 'walk_up:gary-restart',
          source: 'walk_up',
          minute: 11 * 60 + 40,
          minutes: 6,
          relatedTicket: null,
          declinable: true,
          severity: 2,
          flavor: {
            [FLAVOR.caller]: COMPANY_IDS.gary,
            [FLAVOR.subject]: 'At your desk, about a restart she keeps '
              + 'putting off',
            [FLAVOR.opens]: 'at-the-desk',
            [FLAVOR.opensFumbling]: 'at-the-desk-shaky',
          },
        },
        raises: 'ticket:gary-restart',
        // Long enough to walk back to Sales and find the form, short enough
        // that the ticket is a consequence of the conversation rather than an
        // event later in the day nobody connects to it.
        filesAfter: 8,
        // The world fact, not the button: the machine's uptime is stamped by
        // the reboot itself, so doing it from Remote Assist an hour later
        // counts exactly as much as doing it while she stood there - and
        // saying "I will get to it" and not getting to it counts as nothing,
        // which is the honest reading of that answer.
        doneWhen: {
          node: COMPANY_IDS.garyMachine,
          field: FIELDS.uptimeSince,
        },
      },
    ],
    patrolSeed: 2_141,
    load: 2,
  },
]);

/**
 * The week whose world is currently stood up (0.6.0 slice 3).
 *
 * Every reader below - the day scheduler, the interruption plan, the channel
 * feed, the scorecard - reads THIS rather than `WEEK` directly, so a second
 * employer's five days play through the shipped driver without the driver
 * learning a second table exists. It defaults to the probation week, which is
 * the whole of the byte-identical claim: a shell that never switches, and every
 * test that stands up no session, reads exactly the week it read before this
 * pointer existed, and the probation goldens do not move.
 *
 * It is a module pointer selected by the save-carried employer id and set by
 * `createWorldSession` on every stand-up (boot and load), so the active week is
 * `f(employer)` deterministically - content selection, not world state. The
 * LOAD-TIME validators (`assertWeekTickets`, `assertWeekGreetings`) do NOT read
 * it: they take the weeks to check explicitly, because every employer's week
 * must be proven against the roster at boot, not just whichever is active.
 */
let activeWeek: readonly DayScript[] = WEEK;

/** Point the day readers at an employer's week. */
export function setActiveWeek(week: readonly DayScript[]): void {
  activeWeek = week;
}

/** The week the readers are currently dealing from. */
export function activeWeekScripts(): readonly DayScript[] {
  return activeWeek;
}

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
  /**
   * The rooms this week's employer created - the closed set its channel
   * messages are allowed to land in (0.6.0 slice 3). A week is validated at
   * MODULE LOAD, before any employer is active, so the valid rooms are passed
   * in rather than read off the active pointer: the probation week is checked
   * against the probation rooms, and a second employer's week against its own.
   * Defaults to the probation shop's rooms so the shipped `WEEK` call is
   * unchanged.
   */
  validChannelIds: ReadonlySet<string> = new Set(
    CHANNELS.map((room) => room.id),
  ),
): readonly DayScript[] {
  if (scripts.length !== WEEK_DAYS) {
    throw new Error(
      `A working week has ${String(WEEK_DAYS)} days in it; this one has `
      + `${String(scripts.length)}.`,
    );
  }

  const scheduled = new Set<string>();
  const interruptions = new Set<string>();
  const afterHours = new Set<string>();
  const channelIds = new Set<string>();
  const requestIds = new Set<string>();

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
      requireDripSlot(script.day, slot);
      const minute = dripMinute(slot);
      const tick = shiftStartTick(script.day) + (minute - SHIFT_START_MINUTE);

      // The 4:55 class is the exception to the drip window and to nothing
      // else. It still has to land inside a shift, because a ticket that
      // arrived at half past five arrived at a desk nobody is at - and that
      // is quiet wrongness rather than a mechanic.
      if (arrivesBeforeClose(slot)) {
        requireWorkingMinute(script.day, minute, slot.ticketId);
        continue;
      }

      if (
        minute < SHIFT_START_MINUTE
        || minute > SHIFT_END_MINUTE
        || tick < window.from
        || tick > window.to
      ) {
        throw new Error(
          `Day ${String(script.day)} drips "${slot.ticketId}" at `
          + `${clockAt(minute)}, which is outside the hours anybody could `
          + 'start it in.',
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

    // Somebody saying hello and nothing else. Both ends of the gap have to be
    // inside the hours: a greeting at ten to five whose question arrives at
    // five past is a question nobody is at the desk to read, which is a beat
    // that silently does not happen.
    for (const slot of script.noHello ?? []) {
      requireWorkingMinute(script.day, slot.minute, slot.speaker);

      if (
        !Number.isSafeInteger(slot.typingMinutes)
        || slot.typingMinutes < 1
      ) {
        throw new Error(
          `Day ${String(script.day)} has "${slot.speaker}" typing for `
          + `${String(slot.typingMinutes)} minutes. A gap that costs nothing `
          + 'is a greeting with the question already in it, which is the one '
          + 'thing this beat is not.',
        );
      }

      requireWorkingMinute(
        script.day,
        slot.minute + slot.typingMinutes,
        slot.speaker,
      );
    }

    // And whoever pinged after hours. There is no minute to check - they land
    // in the gap between one day and the next, not at a time on the clock - so
    // what is checked is that the ping can be drawn and read: a person to be
    // from, a line to be about, and an id the world can record the answer
    // against. The id is week-wide unique for the same reason an interruption's
    // is: two pings sharing one would share the record, so the second would
    // arrive already answered.
    //
    // Friday's night is refused outright. A ping is read on the FOLLOWING
    // morning, and Friday's following morning is a Saturday this game does not
    // have - so a ping authored there is a ping nobody can ever reach, which is
    // the quiet wrongness the loader exists to turn into a boot failure.
    for (const slot of script.afterHours ?? []) {
      const where = `Day ${String(script.day)}'s after-hours ping "${slot.id}"`;

      if (slot.id.trim().length === 0) {
        throw new Error(
          `Day ${String(script.day)} carries an after-hours ping with no id.`,
        );
      }

      if (isReviewDay(script.day)) {
        throw new Error(
          `${where} lands after the last day of the week, and a ping is read on `
          + 'the following morning. There is no Saturday, so nobody ever reads '
          + 'it.',
        );
      }

      if (slot.speaker.trim().length === 0) {
        throw new Error(`${where} is from nobody.`);
      }

      if (slot.subject.trim().length === 0) {
        throw new Error(
          `${where} says nothing. A ping with no subject is a blank line on the `
          + 'morning surface with a point of stress behind it.',
        );
      }

      if (afterHours.has(slot.id)) {
        throw new Error(
          `"${slot.id}" pings twice in one week. Two pings with one id share `
          + 'the record of what was done about them, so the second arrives '
          + 'already answered.',
        );
      }

      afterHours.add(slot.id);
    }

    // And somebody at the desk. The interruption half is checked with all the
    // others below (`interruptionsOn` folds the columns together); what is
    // checked here is the ask - the same two minutes the direct message is
    // held to, because a walk-up is the same beat standing up.
    for (const walkUp of script.walkUps ?? []) {
      // The LATEST it could possibly happen rather than the minute it was
      // authored for: a walk-up slides out of the lead's way like everything
      // else, and a push buys twenty minutes on top of that, so the ticket it
      // raises has to still land inside the day at the far end of both. The
      // authored minute is the easy case and is not the one that goes wrong.
      const leaves = SHIFT_END_MINUTE
        - INTERRUPTION_CLOSES_BEFORE
        + walkUp.slot.minutes
        + walkUp.filesAfter;

      if (!Number.isSafeInteger(walkUp.filesAfter) || walkUp.filesAfter < 1) {
        throw new Error(
          `Day ${String(script.day)} has "${walkUp.slot.id}" raising `
          + `"${walkUp.raises}" after ${String(walkUp.filesAfter)} minutes. `
          + 'Nobody walks back to their desk and files a ticket in no time at '
          + 'all, and a ticket that arrives in the same minute as the '
          + 'conversation is a conversation that decided nothing.',
        );
      }

      requireWorkingMinute(script.day, leaves, walkUp.raises);

      if (walkUp.slot.source !== 'walk_up') {
        throw new Error(
          `Day ${String(script.day)} files "${walkUp.slot.id}" as a walk-up `
          + `and it comes from "${walkUp.slot.source}". A person at the desk `
          + 'is the one source a status cannot turn away, and the exemption '
          + 'reads the source.',
        );
      }
    }

    // And the rooms. The channel module owns what a well-formed message is -
    // a room somebody created, an author, a body, a working minute, a thread
    // that answers something already posted - and the week owns the id set,
    // because the read ledger the ids key is not cleared overnight.
    validateChannelSlots(
      script.day,
      script.channels ?? [],
      channelIds,
      validChannelIds,
    );

    // And the linked requests - the same question in three windows. The module
    // owns what a well-formed one is (an id, a reporter, a subject, two copies,
    // a working minute); the week owns the id set, because the resolution
    // ledger the ids key is not cleared overnight, and the CROSS-SURFACE half:
    // every request has exactly one Hubbub copy carrying its id, and every
    // channel message that claims to be a request copy names a request that
    // exists that day. Both failures are silent in play - a card with no
    // buttons, or a room post that acts on nothing - which is why they fail the
    // boot instead.
    validateRequestSlots(script.day, script.requests ?? [], requestIds);

    const requestsToday = new Map(
      (script.requests ?? []).map((request) => [request.id, request]),
    );
    const channelCopies = new Map<string, number>();

    for (const message of script.channels ?? []) {
      if (message.request === undefined) {
        continue;
      }

      if (!requestsToday.has(message.request)) {
        throw new Error(
          `Day ${String(script.day)}'s channel message "${message.id}" is the `
          + `Hubbub copy of request "${message.request}", which nobody asked `
          + 'that day. A room post that acts on a request nobody made is a '
          + 'button wired to nothing.',
        );
      }

      channelCopies.set(
        message.request,
        (channelCopies.get(message.request) ?? 0) + 1,
      );
    }

    for (const request of script.requests ?? []) {
      const copies = channelCopies.get(request.id) ?? 0;

      if (copies !== 1) {
        throw new Error(
          `Day ${String(script.day)}'s linked request "${request.id}" has `
          + `${String(copies)} Hubbub copies, and it needs exactly one: the `
          + 'mail and chat copies are authored on the request, and the room '
          + 'copy is the channel message that carries its id.',
        );
      }
    }

    // An interruption's id is what the world records the player's decision
    // against, so two of them sharing one would share the record - and the
    // second would arrive already answered. The check is week-wide rather than
    // per day for the same reason a ticket's is: the field it is written into
    // is not cleared overnight.
    // BOTH columns, because `interruptionsOn` folds them together and the
    // schedule therefore sees one family. A walk-up validated only for its ASK
    // is a walk-up whose id, minute and shape were never checked at all - so a
    // second one sharing an id, or one authored at half past six, would boot
    // clean and then quietly share the record of what was decided about it
    // with whatever else holds that id.
    for (const slot of [
      ...script.interruptions ?? [],
      ...(script.walkUps ?? []).map((walkUp) => walkUp.slot),
    ]) {
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

/** A minute of the day as the clock on the taskbar writes it. */
function clockAt(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:`
    + `${String(minute % 60).padStart(2, '0')}`;
}

function requireWorkingMinute(
  day: number,
  minute: number,
  what: string,
): void {
  if (minute < SHIFT_START_MINUTE || minute > SHIFT_END_MINUTE) {
    throw new Error(
      `Day ${String(day)} puts "${what}" at ${clockAt(minute)}, which is `
      + 'outside the hours anybody is at the desk.',
    );
  }
}

/**
 * A drip row has to say when it arrives, once.
 *
 * Both fields is a row with two answers and no rule about which wins; neither
 * is a row that arrives at nine o'clock because `?? 0` had to mean something.
 * Both look like a working file and neither looks like a bug in play - the
 * first is a ticket that turns up at the wrong time on some seeds, the second
 * is a ticket that turns up before the shift and is quietly pulled forward.
 */
function requireDripSlot(day: number, slot: Readonly<DripSlot>): void {
  const where = `Day ${String(day)}'s "${slot.ticketId}"`;

  if (slot.minute !== undefined && slot.arrivesMinutesBeforeClose !== undefined) {
    throw new Error(
      `${where} says both which minute it arrives on and how long before `
      + 'close. Those are two answers to one question.',
    );
  }

  if (slot.minute === undefined && slot.arrivesMinutesBeforeClose === undefined) {
    throw new Error(`${where} never says when it arrives.`);
  }

  const before = slot.arrivesMinutesBeforeClose;

  if (before === undefined) {
    return;
  }

  // Nought is refused as firmly as a negative one, and the reason is easy to
  // miss in the file: the field says how long BEFORE close, so nought means AT
  // close - a ticket raised in the minute the shift ends, with no workable
  // minutes in the day at all. That is not the hard version of the 4:55
  // request, it is a row nobody can do anything with, and in play it reads as
  // a ticket that appeared on the scorecard out of nowhere.
  if (!Number.isSafeInteger(before) || before < 1) {
    throw new Error(
      `${where} arrives ${String(before)} minutes before close. A distance `
      + 'from home time is a whole number of minutes and at least one of '
      + 'them: nought is the minute the shift ends, which is a ticket with no '
      + 'day left to be raised into, and a negative one is a ticket raised '
      + 'after everybody has gone.',
    );
  }

  if (before > SHIFT_MINUTES) {
    throw new Error(
      `${where} arrives ${String(before)} minutes before close, which is `
      + `before the shift started: there are ${String(SHIFT_MINUTES)} minutes `
      + 'in a day here, and this class of ticket is about the end of one.',
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
  return activeWeek.flatMap(scheduledIds);
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
  /**
   * Every employer's week, because the roster is shared and every ticket in it
   * has to be proven against SOME week - the probation shop's or the second
   * employer's (0.6.0 slice 3). Defaults to the probation week alone so the
   * existing callers and tests are unchanged; `tickets/index.ts` passes both.
   */
  weeks: readonly (readonly DayScript[])[] = [WEEK],
): readonly Entry[] {
  const known = new Map(roster.map((entry) => [entry.def.id, entry]));
  const scripts = weeks.flat();

  for (const script of scripts) {
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
  // when they were polite about it. A walk-up is the same claim standing up,
  // so both columns are held to it in one loop rather than two.
  for (const script of scripts) {
    const asks: readonly { readonly by: string; readonly raises: string }[] = [
      ...(script.dms ?? []).map((slot) => ({
        by: slot.speaker,
        raises: slot.raises,
      })),
      ...(script.walkUps ?? []).map((walkUp) => ({
        by: walkUp.slot.id,
        raises: walkUp.raises,
      })),
    ];

    for (const ask of asks) {
      const entry = known.get(ask.raises);

      if (entry === undefined) {
        throw new Error(
          `Day ${String(script.day)} lets "${ask.by}" raise `
          + `"${ask.raises}", which nobody wrote.`,
        );
      }

      if (entry.arrival !== 'summoned') {
        throw new Error(
          `"${ask.raises}" is raised by somebody who asked you first and `
          + `arrives "${entry.arrival}". A ticket somebody files because you `
          + 'sent them to the form cannot also be dealt by the morning.',
        );
      }
    }
  }

  // And the rooms: a channel message that says it is about a ticket has to be
  // about one somebody wrote. It may be about a ticket from any day and any
  // arrival mode - the message is a coat, not a schedule - but a reference to
  // nothing is a room quietly talking about a fault the world cannot hold.
  for (const script of scripts) {
    for (const slot of script.channels ?? []) {
      if (slot.relatedTicket !== undefined && !known.has(slot.relatedTicket)) {
        throw new Error(
          `Day ${String(script.day)}'s channel message "${slot.id}" is about `
          + `"${slot.relatedTicket}", which nobody wrote.`,
        );
      }
    }
  }

  // And the linked requests: converting one MINTS the ticket it raises, so that
  // ticket has to be a real one nobody's day schedules - a summoned one, exactly
  // like a walk-up's. A request that raised a ticket nobody wrote would throw
  // the minute somebody did the right thing with it, which is the one beat that
  // must not punish the correct play.
  for (const script of scripts) {
    for (const request of script.requests ?? []) {
      const entry = known.get(request.raises);

      if (entry === undefined) {
        throw new Error(
          `Day ${String(script.day)}'s request "${request.id}" converts into `
          + `"${request.raises}", which nobody wrote.`,
        );
      }

      if (entry.arrival !== 'summoned') {
        throw new Error(
          `"${request.raises}" is minted by converting a channel request and `
          + `arrives "${entry.arrival}". A ticket a request becomes only when `
          + 'you choose to make it one cannot also be dealt by the morning.',
        );
      }
    }
  }

  const scheduled = new Set(scripts.flatMap(scheduledIds));

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

/**
 * The week's greetings against the conversations that have to carry them.
 *
 * The same shape - and the same reason - as `assertWeekTickets`: content that
 * refers to content is a boot failure rather than a quiet Monday. It lives
 * here and is CALLED from the module that builds the trees, because week.ts
 * knowing about dialogue and dialogue knowing about week.ts cannot both be
 * true, and the roster gate already settled which way round it goes.
 *
 * Both failures are silent in play and identical from the outside: the thread
 * never opens, the indicator never appears, and a minute the week booked for
 * a beat is a minute in which nothing whatever happens.
 */
export function assertWeekGreetings<Tree extends {
  readonly id: string;
  readonly speaker: string;
  readonly hello_root?: string;
}>(
  trees: readonly Tree[],
  weeks: readonly (readonly DayScript[])[] = [WEEK],
): readonly Tree[] {
  for (const script of weeks.flat()) {
    for (const slot of script.noHello ?? []) {
      const tree = trees.find((candidate) => candidate.speaker === slot.speaker);

      if (tree === undefined) {
        throw new Error(
          `Day ${String(script.day)} has "${slot.speaker}" opening a chat `
          + 'with a bare hello, and nobody of that name talks to anybody.',
        );
      }

      if (tree.hello_root === undefined) {
        throw new Error(
          `Day ${String(script.day)} has "${slot.speaker}" opening a chat `
          + `with a bare hello, and "${tree.id}" has no greeting written for `
          + 'them to open it with.',
        );
      }
    }
  }

  return trees;
}

export function dayScript(day: number): DayScript {
  const script = activeWeek[day - 1];

  if (script === undefined) {
    throw new Error(
      `Day ${String(day)} is not part of the working week, which is `
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

/**
 * What the day scheduler needs from a day: a pile and a drip.
 *
 * The two ways a row can say when it arrives are resolved HERE, once, so
 * `buildDaySchedule` never learns that `arrives_minutes_before_close` exists -
 * it is handed minutes and a flag saying which of them are pinned, which is
 * the whole of what placement has to know.
 */
export function dayPlan(day: number): DayPlan {
  const script = dayScript(day);

  return {
    inherited: script.inherited,
    drip: script.drip.map((slot) => ({
      ticketId: slot.ticketId,
      minute: dripMinute(slot),
      pinned: arrivesBeforeClose(slot),
    })),
  };
}

/** What the world does today, and who messages you, earliest first. */
export function incidentsOn(day: number): readonly IncidentSlot[] {
  return isWeekDay(day) ? dayScript(day).incidents ?? [] : [];
}

export function directMessagesOn(day: number): readonly DmSlot[] {
  return isWeekDay(day) ? dayScript(day).dms ?? [] : [];
}

/**
 * What takes the screen off you today, as the week's table declares it.
 *
 * Both columns, folded into one list. A walk-up IS an interruption - it takes
 * the screen, it slides out of the lead's way, it is charged an arrival like
 * everything else - and the ask hanging off it is the day loop's business
 * rather than the schedule's. Two lists reaching the scheduler separately
 * would be two takeovers nobody had booked against each other.
 */
export function interruptionsOn(day: number): readonly InterruptionSlot[] {
  if (!isWeekDay(day)) {
    return [];
  }

  const script = dayScript(day);

  return [
    ...script.interruptions ?? [],
    ...(script.walkUps ?? []).map((walkUp) => walkUp.slot),
  ];
}

/** Who comes to the desk today, with the ask they bring with them. */
export function walkUpsOn(day: number): readonly WalkUpSlot[] {
  return isWeekDay(day) ? dayScript(day).walkUps ?? [] : [];
}

/** And who opens a chat today without saying what they want. */
export function noHelloOn(day: number): readonly NoHelloSlot[] {
  return isWeekDay(day) ? dayScript(day).noHello ?? [] : [];
}

/** What lands in the Hubbub rooms today, as the day's table authors it. */
export function channelMessagesOn(day: number): readonly ChannelMessageSlot[] {
  return isWeekDay(day) ? dayScript(day).channels ?? [] : [];
}

/** The same question asked everywhere today (0.5.0 slice 2). */
export function linkedRequestsOn(day: number): readonly LinkedRequestSlot[] {
  return isWeekDay(day) ? dayScript(day).requests ?? [] : [];
}

/** One linked request by id, with the day it belongs to, or nothing. */
export function findLinkedRequest(
  id: string,
): { readonly day: number; readonly slot: LinkedRequestSlot } | undefined {
  for (const script of activeWeek) {
    const slot = (script.requests ?? []).find(
      (request) => request.id === id,
    );

    if (slot !== undefined) {
      return { day: script.day, slot };
    }
  }

  return undefined;
}

/**
 * Every linked request the clock has passed, oldest first: the mail and chat
 * copies as they stand at a tick.
 *
 * The same reading the channel feed is, and for the same reason: a request has
 * arrived when `tick <= now`, so a save reproduces the surfaces from the tick
 * alone and a week that never opens a window leaves the world untouched. The
 * Hubbub copy is not in here - it rides the channel feed as a normal message -
 * so this is what the inbox and the chat draw their copies from.
 */
export function linkedRequestsThrough(
  now: number,
): readonly { readonly day: number; readonly slot: LinkedRequestSlot }[] {
  return activeWeek
    .flatMap((script) => (script.requests ?? []).map((slot) => ({
      day: script.day,
      slot,
      tick: tickAtMinute(script.day, slot.minute),
    })))
    .filter((entry) => entry.tick <= now)
    .sort((left, right) => left.tick - right.tick)
    .map(({ day, slot }) => ({ day, slot }));
}

/**
 * Every channel message the clock has passed, oldest first: the rooms as they
 * stand at a tick.
 *
 * The whole arrival mechanism is this filter, and that is the design rather
 * than a shortcut. A message has arrived when `tick <= now` - a READING of
 * the week's table against the clock, not an event anybody dispatched - so
 * the rooms fill up deterministically, a save reproduces them from the tick
 * alone, and a scripted week that never opens the window leaves the world
 * untouched. Yesterday's messages stay in the room, because a channel client
 * that forgot its own history overnight would be the one honest feature the
 * parody is not allowed.
 *
 * The sort is by tick and it is deliberately stable: two messages on one
 * minute keep the order their day authored them in.
 */
export function channelFeedThrough(now: number): readonly ChannelMessage[] {
  return activeWeek
    .flatMap((script) => (script.channels ?? []).map(
      (slot) => channelMessageAt(script.day, slot),
    ))
    .filter((message) => message.tick <= now)
    .sort((left, right) => left.tick - right.tick);
}

/**
 * And who pinged after this day's clock-off, to be read on the next morning.
 *
 * Keyed to the NIGHT the pings landed on rather than the morning they are read:
 * the caller (the driver, at a brief for day D) asks for day D-1, which is the
 * night just gone. Off the end of the week there is nothing, which is also what
 * a day with no `afterHours` column answers.
 */
export function afterHoursOn(day: number): readonly AfterHoursSlot[] {
  return isWeekDay(day) ? dayScript(day).afterHours ?? [] : [];
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
  const days = activeWeek.map((script): WeekDayLine => ({
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
