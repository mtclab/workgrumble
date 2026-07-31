/**
 * The working day, as data.
 *
 * Everything the day loop needs to decide - what state the day is in, what the
 * queue does at 10:20, what the day was worth at 17:00 - is a pure function of
 * the tick and the day's schedule. The engine holds one field for it
 * (`day_state` on the player node), because the state has to survive a save
 * and be replayed rather than be re-derived from a wall clock nobody recorded.
 *
 * The clock arithmetic underneath it lives in `hours.ts` and is re-exported
 * here, so everything that reads the shape of a day still reads it from one
 * place.
 *
 * Nothing here touches the DOM, dispatches, or reads the time of day.
 */

import type { ReadOnlyGraphNode } from '../engine-api';
import { FIELDS } from './fields';
import {
  dayForTick,
  dayOpensTick,
  lunchWindow,
  requireDay,
  shiftEndTick,
  shiftStartTick,
  shiftWindow,
  tickAtMinute,
  type TickWindow,
} from './hours';
import { isUnresolved } from './sla';

export {
  countsAgainstSla,
  DAY_OPENS_MINUTE,
  dayForTick,
  dayOpensTick,
  isLunchtime,
  LUNCH_END_MINUTE,
  LUNCH_START_MINUTE,
  lunchWindow,
  MINUTES_PER_DAY,
  minuteOfDay,
  serviceDeadline,
  serviceMinutesAt,
  serviceMinutesBetween,
  SHIFT_END_MINUTE,
  SHIFT_MINUTES,
  SHIFT_START_MINUTE,
  shiftEndTick,
  shiftStartTick,
  shiftWindow,
  tickAtMinute,
  type TickWindow,
} from './hours';

export const DAY_STATES = ['morning_brief', 'shift', 'day_end'] as const;

export type DayState = (typeof DAY_STATES)[number];

export function isDayState(value: unknown): value is DayState {
  return typeof value === 'string'
    && DAY_STATES.some((state) => state === value);
}

/**
 * Whether the clock converts real time in this state.
 *
 * The morning hour runs - the player is at the desk, reading. The day END does
 * not: 17:00 stays 17:00 until the scorecard is dismissed, so nobody loses
 * their evening to a window they had not finished reading.
 */
export function clockRuns(state: DayState): boolean {
  return state !== 'day_end';
}

/**
 * The transition the clock is owed, if any. Returns null when the day is where
 * it should be - including at the day end, which only the player leaves.
 */
export function dueTransition(
  state: DayState,
  tick: number,
): DayState | null {
  const day = dayForTick(tick);

  if (state === 'morning_brief' && tick >= shiftStartTick(day)) {
    return 'shift';
  }

  if (state === 'shift' && tick >= shiftEndTick(day)) {
    return 'day_end';
  }

  return null;
}

/* -- the ticket drip ------------------------------------------------------ */

/**
 * When a ticket joins the day.
 *
 * `morning` is the queue that was waiting when the player sat down - the
 * inherited pile, and where the shipped content starts. `drip` is an arrival
 * during the shift, which is the other half of what a queue does to you.
 * `summoned` is neither: it is a ticket some other system raises when it feels
 * like it - the lead deciding, at 11:40, that his phone is now everybody's
 * problem - so the day scheduler deals it no slot at all.
 */
export type TicketArrival = 'morning' | 'drip' | 'summoned';

export interface DayArrival {
  readonly tick: number;
  readonly ticketId: string;
}

/**
 * One day's queue, as the week's table declares it: what was already there at
 * 08:00, and what turns up during the shift with the minute it nominally does.
 *
 * The scheduler takes a PLAN rather than a pool it has to spread out for
 * itself. A drip minute is a content decision - the vacuum comes round in the
 * evening, the cert expires at half nine - and a scheduler that decided them
 * by dividing the shift into equal parts was a scheduler content could not
 * write against.
 */
export interface DayPlan {
  readonly inherited: readonly string[];
  readonly drip: readonly { readonly ticketId: string; readonly minute: number }[];
}

export interface DaySchedule {
  readonly day: number;
  readonly opensTick: number;
  readonly shift: TickWindow;
  readonly lunch: TickWindow;
  /** Every arrival of the day, earliest first. Morning entries come first. */
  readonly arrivals: readonly DayArrival[];
}

/** Nothing new lands in the first half hour: the morning pile is enough. */
const DRIP_OPENS_AFTER = 30;
/** Nor in the last hour and a half: a ticket you cannot start is a cheat. */
const DRIP_CLOSES_BEFORE = 90;
/** How far either side of its nominal slot an arrival may wander. */
const DRIP_JITTER = 12;

/**
 * A stable offset for one scheduled thing, in [-spread, +spread].
 *
 * FNV-1a over the things that identify it, which makes a schedule a function of
 * the world seed, the day and a key - the same three times running, and the
 * same again after a save. It is a spreader, not a source of randomness for the
 * simulation: the engine's own generator is the only thing allowed to roll dice
 * that the world remembers, and a schedule is decided before the day starts.
 *
 * Two schedules that want different answers pass different keys; the drip uses
 * the ticket id, the boss uses which round of the corridor he is on.
 */
export function seededOffset(
  seed: number,
  day: number,
  key: string,
  spread: number,
): number {
  requireDay(day);

  if (!Number.isSafeInteger(spread) || spread < 0) {
    throw new TypeError('A jitter spread must be a whole number of minutes.');
  }

  const text = `${String(seed)}:${String(day)}:${key}`;
  let hash = 0x811c_9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  }

  return (hash % (spread * 2 + 1)) - spread;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** The hours of a day a new ticket may land in, with both ends inclusive. */
export function dripWindow(day: number): TickWindow {
  const shift = shiftWindow(day);
  const from = shift.from + DRIP_OPENS_AFTER;

  return { from, to: Math.max(from, shift.to - DRIP_CLOSES_BEFORE) };
}

/**
 * The day's arrivals: what is already in the queue, and what turns up while
 * the player is working.
 *
 * A dripped ticket lands on the minute its day script names, nudged by a
 * seeded offset - so the same week always arrives the same way, and a week
 * played again after a firing arrives slightly differently because the seed
 * moved. Anything the jitter would push outside the hours a ticket can be
 * started in is pulled back inside them. Ordering is by tick; two tickets
 * landing in the same minute is a bad minute, not a bug.
 */
export function buildDaySchedule(
  day: number,
  seed: number,
  plan: Readonly<DayPlan>,
): DaySchedule {
  requireDay(day);
  const opensTick = dayOpensTick(day);
  const window = dripWindow(day);

  const arrivals: DayArrival[] = [
    ...plan.inherited.map((ticketId) => ({ tick: opensTick, ticketId })),
    ...plan.drip.map((slot) => ({
      tick: clamp(
        tickAtMinute(day, slot.minute)
          + seededOffset(seed, day, slot.ticketId, DRIP_JITTER),
        window.from,
        window.to,
      ),
      ticketId: slot.ticketId,
    })),
  ];

  arrivals.sort((left, right) => left.tick - right.tick);

  return {
    day,
    opensTick,
    shift: shiftWindow(day),
    lunch: lunchWindow(day),
    arrivals: Object.freeze(arrivals),
  };
}

/** Everything due in `(after, upTo]` - what one clock step has to spawn. */
export function arrivalsBetween(
  schedule: Readonly<DaySchedule>,
  after: number,
  upTo: number,
): readonly DayArrival[] {
  return schedule.arrivals.filter(
    (arrival) => arrival.tick > after && arrival.tick <= upTo,
  );
}

/* -- the scorecard -------------------------------------------------------- */

/**
 * The day's ticket ledger, counted over the EVENTS that happened in it.
 *
 * Every field here is a question about a minute, and every one of them used to
 * be a question about now wearing a day's name. The ledger scoped itself to
 * the tickets that ARRIVED in the day and then read their current state, so a
 * Monday ticket still open at Monday's 17:00 and resolved on the Tuesday was
 * reported as one of Monday's closes - on a Monday whose pay had already been
 * banked, at Monday's 17:00, without it. The final week card recomputed the
 * same historical cohort and rewrote Monday to disagree with the money in the
 * fund. And Tuesday, which is the day somebody actually did the work, showed
 * nothing for it, because the ticket had arrived the day before.
 *
 * So a day is answerable for what HAPPENED in it:
 *
 * - `arrived`: spawned in this day.
 * - `closed`: RESOLVED in this day, whichever day it arrived on.
 * - `breached`: went red in this day, same.
 * - `stillOpen`: arrived on or before this day and was not resolved before it
 *   ended - which is the one number that is a fact about a MOMENT rather than
 *   about an interval, so it is measured at the day's own close.
 *
 * All four are immutable once the day is over: nothing that happens on the
 * Wednesday can move a number in Monday's row, which is the property the pay
 * needs, because the pay was banked on the Monday.
 */
export interface DayLedger {
  readonly arrived: number;
  readonly closed: number;
  readonly breached: number;
  readonly stillOpen: number;
}

function tickField(node: ReadOnlyGraphNode, field: string): number | null {
  const value = node.fields[field];
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : null;
}

/** Whether a stamped minute falls inside a given day. */
function stampedIn(
  ticket: ReadOnlyGraphNode,
  field: string,
  day: number,
): boolean {
  const at = tickField(ticket, field);
  return at !== null && at >= dayOpensTick(day) && at < dayOpensTick(day + 1);
}

/**
 * The tickets a given day is answerable for: the ones that arrived in it.
 *
 * The arrival cohort, exported, because the two things that are genuinely
 * about ARRIVALS both count over it and have to count over the SAME one: how
 * many turned up, and how many of them went unanswered past their response
 * target. Neither of the two event counts uses it - a resolution belongs to
 * the day somebody did the work, not to the day the ticket landed.
 */
export function ticketsArrivedOn(
  tickets: readonly ReadOnlyGraphNode[],
  day: number,
): readonly ReadOnlyGraphNode[] {
  requireDay(day);
  return tickets.filter((ticket) => stampedIn(ticket, FIELDS.spawnedAt, day));
}

/** The tickets somebody closed in this day, whenever they arrived. */
export function ticketsResolvedOn(
  tickets: readonly ReadOnlyGraphNode[],
  day: number,
): readonly ReadOnlyGraphNode[] {
  requireDay(day);
  return tickets.filter((ticket) => stampedIn(ticket, FIELDS.resolvedAt, day));
}

/** And the ones somebody filed a triage on in it, right or wrong. */
export function ticketsClassifiedOn(
  tickets: readonly ReadOnlyGraphNode[],
  day: number,
): readonly ReadOnlyGraphNode[] {
  requireDay(day);
  return tickets.filter((ticket) => stampedIn(ticket, FIELDS.classifiedAt, day));
}

/** And the ones whose deadline ran out in it. */
export function ticketsBreachedOn(
  tickets: readonly ReadOnlyGraphNode[],
  day: number,
): readonly ReadOnlyGraphNode[] {
  requireDay(day);
  return tickets.filter((ticket) => stampedIn(ticket, FIELDS.breachedAt, day));
}

/**
 * The tickets that were still somebody's problem when this day ended.
 *
 * Arrived on or before it, and either never resolved or resolved after it
 * closed. Breached ones very much included: a ticket whose deadline ran out is
 * not a ticket that went away, and a scorecard reporting nothing still open on
 * a day with four breaches in it is the day telling the player a story about
 * itself.
 *
 * For the day that is still being worked, "the day's close" is in the future,
 * so this reads exactly as "open right now" - which is what a preview should
 * say. For a day that is over it never changes again.
 */
export function ticketsOpenAtCloseOf(
  tickets: readonly ReadOnlyGraphNode[],
  day: number,
): readonly ReadOnlyGraphNode[] {
  requireDay(day);
  const closes = dayOpensTick(day + 1);

  return tickets.filter((ticket) => {
    const spawned = tickField(ticket, FIELDS.spawnedAt);

    if (spawned === null || spawned >= closes) {
      return false;
    }

    const resolved = tickField(ticket, FIELDS.resolvedAt);
    return resolved === null ? isUnresolved(ticket) : resolved >= closes;
  });
}

export function dayLedger(
  tickets: readonly ReadOnlyGraphNode[],
  day: number,
): DayLedger {
  return {
    arrived: ticketsArrivedOn(tickets, day).length,
    closed: ticketsResolvedOn(tickets, day).length,
    breached: ticketsBreachedOn(tickets, day).length,
    stillOpen: ticketsOpenAtCloseOf(tickets, day).length,
  };
}

/* -- the payslip ---------------------------------------------------------- */

/**
 * Money is counted in pence, in whole numbers, all the way through. A balance
 * carried in pounds-and-a-bit is a balance that drifts, and this one is
 * written into the graph and hashed.
 */
export const PENCE_PER_POUND = 100;

/** Eight hours at a rate nobody has renegotiated since the refurbishment. */
export const DAY_RATE_PENCE = 9_600;
/**
 * What a closed ticket is worth on the payslip: the same £2.50 for all of
 * them, whatever it was.
 *
 * FLAT, and deliberately. A ticket is written with a `reward.reputation` that
 * IS weighted - the office-wide outage is worth more than a rotated screen,
 * and the meters read it - but the money is not, because the joke of the
 * payslip is that the company does not distinguish. Twelve minutes on a
 * printer and half a day on a certificate pay the same, and both are less than
 * the desk levy.
 */
export const CLOSED_TICKET_BONUS_PENCE = 250;
export const BREACH_DEDUCTION_PENCE = 400;

/** The wall poster. Twelve acres, a barn, and no ticket queue at all. */
export const FARM_PRICE_PENCE = 24_500_000;

export interface PaySlipLine {
  readonly label: string;
  /** Positive is earned, negative is taken. Both are pence. */
  readonly pence: number;
}

export interface PaySlip {
  readonly lines: readonly PaySlipLine[];
  /** What the day earned before anybody helped themselves. */
  readonly gross: number;
  /** What the day cost, as a positive number. */
  readonly deducted: number;
  /** Never below zero: the joke is the deductions, not a debt. */
  readonly net: number;
}

/**
 * The day's pay, and what the day took back off it.
 *
 * `spentPence` is what the player put through the vending machine on their own
 * card - so it is a deduction rather than a cost of doing business, and it is
 * on the payslip because a mechanic the scorecard does not price is a mechanic
 * with no downside except the one you cannot see.
 */
export function daySlip(
  ledger: Readonly<DayLedger>,
  spentPence = 0,
): PaySlip {
  if (!Number.isSafeInteger(spentPence) || spentPence < 0) {
    throw new TypeError('Consumable spend is counted in whole pence.');
  }

  const bonus = ledger.closed * CLOSED_TICKET_BONUS_PENCE;
  const breaches = ledger.breached * BREACH_DEDUCTION_PENCE;
  const lines: PaySlipLine[] = [
    { label: 'Shift, eight hours, as agreed', pence: DAY_RATE_PENCE },
    {
      label: `Resolution bonus (${String(ledger.closed)} closed)`,
      pence: bonus,
    },
    {
      label: 'Kettle fund, voluntary, automatic',
      pence: -150,
    },
    {
      label: 'Desk levy (the desk is company property)',
      pence: -220,
    },
    {
      label: 'Lanyard replacement, amortised over the heirloom',
      pence: -75,
    },
  ];

  if (breaches > 0) {
    lines.push({
      label: `Service credit, ${String(ledger.breached)} missed deadline(s)`,
      pence: -breaches,
    });
  }

  if (spentPence > 0) {
    lines.push({
      label: 'Vending machine, on your own card, at your own request',
      pence: -spentPence,
    });
  }

  const gross = lines
    .filter((line) => line.pence > 0)
    .reduce((total, line) => total + line.pence, 0);
  const deducted = lines
    .filter((line) => line.pence < 0)
    .reduce((total, line) => total - line.pence, 0);

  return {
    lines: Object.freeze(lines),
    gross,
    deducted,
    net: Math.max(0, gross - deducted),
  };
}

/** `9600` -> `96.00`. The currency mark belongs to the view. */
export function formatPence(pence: number): string {
  if (!Number.isSafeInteger(pence)) {
    throw new TypeError('Money is counted in whole pence.');
  }

  const sign = pence < 0 ? '-' : '';
  const whole = Math.abs(pence);

  return `${sign}${String(Math.floor(whole / PENCE_PER_POUND))}`
    + `.${String(whole % PENCE_PER_POUND).padStart(2, '0')}`;
}

/** How far the farm fund has come, as a fraction between 0 and 1. */
export function farmProgress(banked: number): number {
  return clamp(banked / FARM_PRICE_PENCE, 0, 1);
}
