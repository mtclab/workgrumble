/**
 * The office calendar: what time it is, and which minutes count.
 *
 * A tick is a simulated minute and tick 0 is 08:00 on day one. Everything
 * below is arithmetic on that - which day a tick falls on, when the shift
 * starts, whether the minute that has just gone past is one a service level
 * counts - and none of it knows anything about tickets, meters or the player.
 * It sits underneath both `day.ts` (the day as data) and `sla.ts` (the two
 * clocks a ticket carries), which is what stops those two from having to
 * import each other.
 *
 * Nothing here touches the DOM, dispatches, or reads the time of day.
 */

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

/** The minutes in a shift, which is the only stretch a service level counts. */
export const SHIFT_MINUTES = SHIFT_END_MINUTE - SHIFT_START_MINUTE;

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

export function requireDay(day: number): void {
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

export function tickAtMinute(day: number, minute: number): number {
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
 * Whether the clock arriving at this minute consumed a minute of service time.
 *
 * The rule is stated on ARRIVALS rather than on minutes so that it matches the
 * only thing that can act on it: the engine extends every unresolved deadline
 * on the ticks it steps, and the day state it steps them under is the state
 * before the transition. Arriving at 09:00 therefore costs nothing - the shift
 * has not started yet, the transition happens on the same minute - and the last
 * minute a shift costs is 17:00 itself. Eight hours exactly, every day.
 */
export function countsAgainstSla(tick: number): boolean {
  const minute = minuteOfDay(tick);
  return minute > SHIFT_START_MINUTE && minute <= SHIFT_END_MINUTE;
}

/**
 * Service minutes elapsed by the time the clock reads `tick`, counted from the
 * beginning of the world.
 *
 * Closed form rather than a loop: this is asked once per ticket per repaint,
 * and a night is nine hundred iterations of nothing happening.
 */
function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function serviceMinutesAt(tick: number): number {
  requireTick(tick, 'A simulation tick');
  const days = Math.floor((DAY_OPENS_MINUTE + tick) / MINUTES_PER_DAY);

  return days * SHIFT_MINUTES
    + clamp(minuteOfDay(tick) - SHIFT_START_MINUTE, 0, SHIFT_MINUTES);
}

/** Service minutes between two ticks. Never negative; `to` before `from` is 0. */
export function serviceMinutesBetween(from: number, to: number): number {
  return Math.max(0, serviceMinutesAt(to) - serviceMinutesAt(from));
}

/**
 * The minute a clock started at `from` and allowed `minutes` of service time
 * runs out on.
 *
 * This is the response clock's deadline, and it is the same arithmetic the
 * engine arrives at from the other end - it pushes a resolution deadline out
 * by every minute nobody was at the desk, which lands on exactly this tick.
 * The unit suite drives both against each other, because two rules that agree
 * by coincidence are two rules that will stop agreeing.
 */
export function serviceDeadline(from: number, minutes: number): number {
  requireTick(from, 'A simulation tick');

  if (!Number.isSafeInteger(minutes) || minutes < 0) {
    throw new TypeError('A service target is a whole number of minutes.');
  }

  if (minutes === 0) {
    return from;
  }

  const target = serviceMinutesAt(from) + minutes;
  const days = Math.floor((target - 1) / SHIFT_MINUTES);
  const rest = target - days * SHIFT_MINUTES;

  return days * MINUTES_PER_DAY
    + (SHIFT_START_MINUTE + rest - DAY_OPENS_MINUTE);
}

