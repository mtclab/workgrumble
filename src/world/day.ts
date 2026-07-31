/**
 * The working day, as data.
 *
 * A tick is a simulated minute and tick 0 is 08:00 on day one. Everything the
 * day loop needs to decide - when the shift starts, when lunch is, when the
 * scorecard is due, what a ticket arriving at 10:20 costs - is a pure function
 * of the tick and the day's schedule. The engine holds one field for it
 * (`day_state` on the player node), because the state has to survive a save
 * and be replayed rather than be re-derived from a wall clock nobody recorded.
 *
 * Nothing here touches the DOM, dispatches, or reads the time of day.
 */

import type { ReadOnlyGraphNode } from '../engine-api';
import { FIELDS } from './fields';

/** Minutes in a simulated day. A tick is one minute. */
export const MINUTES_PER_DAY = 24 * 60;

/**
 * The minute tick 0 sits on: 08:00, an hour before the shift. That hour is the
 * morning brief - long enough to read one mail and look at the queue, and the
 * reason the clock is already running when the player logs on.
 */
export const DAY_OPENS_MINUTE = 8 * 60;

export const SHIFT_START_MINUTE = 9 * 60;
export const SHIFT_END_MINUTE = 17 * 60;
export const LUNCH_START_MINUTE = 12 * 60;
export const LUNCH_END_MINUTE = 12 * 60 + 30;

export const DAY_STATES = ['morning_brief', 'shift', 'day_end'] as const;

export type DayState = (typeof DAY_STATES)[number];

export function isDayState(value: unknown): value is DayState {
  return typeof value === 'string'
    && DAY_STATES.some((state) => state === value);
}

/** A half-open span of ticks: `from` counts, `to` does not. */
export interface TickWindow {
  readonly from: number;
  readonly to: number;
}

function requireTick(tick: number, what: string): void {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new TypeError(`${what} must be a non-negative safe integer.`);
  }
}

function requireDay(day: number): void {
  if (!Number.isSafeInteger(day) || day < 1) {
    throw new TypeError('A day number starts at 1 and counts up.');
  }
}

/** Which day a tick falls on, counting from 1. Days roll at midnight. */
export function dayForTick(tick: number): number {
  requireTick(tick, 'A simulation tick');
  return Math.floor((DAY_OPENS_MINUTE + tick) / MINUTES_PER_DAY) + 1;
}

export function minuteOfDay(tick: number): number {
  requireTick(tick, 'A simulation tick');
  return (DAY_OPENS_MINUTE + tick) % MINUTES_PER_DAY;
}

/** The tick a given day opens on: 08:00, where its morning brief begins. */
export function dayOpensTick(day: number): number {
  requireDay(day);
  return (day - 1) * MINUTES_PER_DAY;
}

function tickAtMinute(day: number, minute: number): number {
  return dayOpensTick(day) + (minute - DAY_OPENS_MINUTE);
}

export function shiftStartTick(day: number): number {
  return tickAtMinute(day, SHIFT_START_MINUTE);
}

export function shiftEndTick(day: number): number {
  return tickAtMinute(day, SHIFT_END_MINUTE);
}

export function lunchWindow(day: number): TickWindow {
  return {
    from: tickAtMinute(day, LUNCH_START_MINUTE),
    to: tickAtMinute(day, LUNCH_END_MINUTE),
  };
}

/**
 * The half hour the boss is at lunch too. Lane B hangs the safe-slack rules on
 * it; the day loop only has to know it is on, so the clock can say so.
 */
export function isLunchtime(tick: number): boolean {
  const minute = minuteOfDay(tick);
  return minute >= LUNCH_START_MINUTE && minute < LUNCH_END_MINUTE;
}

/** The shift, as the span the scorecard scores. */
export function shiftWindow(day: number): TickWindow {
  return { from: shiftStartTick(day), to: shiftEndTick(day) };
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

export interface ScheduledTicket {
  readonly id: string;
  readonly arrival: TicketArrival;
}

export interface DayArrival {
  readonly tick: number;
  readonly ticketId: string;
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

/**
 * The day's arrivals: what is already in the queue, and what turns up while
 * the player is working.
 *
 * Dripped tickets are spread evenly across the middle of the shift and nudged
 * by a seeded offset, so two days with the same content do not arrive in
 * lockstep and the same day always arrives the same way. Ordering is by tick;
 * two tickets landing in the same minute is a bad minute, not a bug.
 */
export function buildDaySchedule(
  day: number,
  seed: number,
  pool: readonly ScheduledTicket[],
): DaySchedule {
  requireDay(day);
  const shift = shiftWindow(day);
  const opensTick = dayOpensTick(day);
  const dripping = pool.filter((entry) => entry.arrival === 'drip');
  const first = shift.from + DRIP_OPENS_AFTER;
  const last = Math.max(first, shift.to - DRIP_CLOSES_BEFORE);
  const step = (last - first) / (dripping.length + 1);

  const arrivals: DayArrival[] = [
    ...pool
      .filter((entry) => entry.arrival === 'morning')
      .map((entry) => ({ tick: opensTick, ticketId: entry.id })),
    ...dripping.map((entry, index) => ({
      tick: clamp(
        Math.round(first + step * (index + 1))
          + seededOffset(seed, day, entry.id, DRIP_JITTER),
        first,
        last,
      ),
      ticketId: entry.id,
    })),
  ];

  arrivals.sort((left, right) => left.tick - right.tick);

  return {
    day,
    opensTick,
    shift,
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
 * The day's ticket ledger, counted over the tickets that ARRIVED in it.
 *
 * Scoping it by arrival is what keeps the scorecard honest across days: a
 * ticket closed on Tuesday must not still be being celebrated on Wednesday,
 * and the only thing in the graph that says which day a ticket belongs to is
 * the tick it spawned on.
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

export function dayLedger(
  tickets: readonly ReadOnlyGraphNode[],
  day: number,
): DayLedger {
  requireDay(day);
  const opens = dayOpensTick(day);
  const closes = dayOpensTick(day + 1);
  const mine = tickets.filter((ticket) => {
    const spawned = tickField(ticket, FIELDS.spawnedAt);
    return spawned !== null && spawned >= opens && spawned < closes;
  });

  return {
    arrived: mine.length,
    closed: mine.filter(
      (ticket) => ticket.fields[FIELDS.state] === 'resolved',
    ).length,
    breached: mine.filter(
      (ticket) => ticket.fields[FIELDS.breached] === true,
    ).length,
    stillOpen: mine.filter((ticket) => {
      const state = ticket.fields[FIELDS.state];
      return state === 'open' || state === 'waiting_on_user';
    }).length,
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
