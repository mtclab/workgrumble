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

/** The half hour in the middle of it that is nobody's working time. */
export const LUNCH_MINUTES = LUNCH_END_MINUTE - LUNCH_START_MINUTE;

/**
 * The minutes of a day anybody could put on a timesheet: the shift, less lunch.
 *
 * Seven and a half hours, and it is a DIFFERENT number from `SHIFT_MINUTES` on
 * purpose. A service level counts the whole eight - a printer does not start
 * working because somebody went to eat, so a deadline keeps running through it
 * - and a timesheet counts seven and a half, because half an hour in the
 * canteen is not billable to anybody and never has been. Two questions, two
 * numbers, and a single constant serving both would have to be wrong about one
 * of them.
 */
export const WORKING_MINUTES_PER_DAY = SHIFT_MINUTES - LUNCH_MINUTES;

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

/* -- the wall calendar ---------------------------------------------------- */

/**
 * Which Monday day one is.
 *
 * The clock in this game counts minutes and the fiction has always counted
 * months: a transport rule written in March, a leaver who went in April, a
 * second-factor rollout that finished in June. Nothing anchored those to
 * anything until a directory listing needed a date column - and a listing with
 * a date column is not optional, so the anchor is written down here once
 * rather than guessed at by whichever surface prints it.
 *
 * Monday 7 September 1998 is a real Monday, it is after everything the world
 * already says happened, and it is the same year the version string has been
 * claiming since the first build.
 */
export const WEEK_STARTS_ON = Object.freeze({
  year: 1998,
  /** 1-12, the way a human says it rather than the way a Date does. */
  month: 9,
  dayOfMonth: 7,
});

/**
 * Calendar days in a week. The working week is five; the calendar is seven.
 *
 * It lives HERE rather than beside the arc that first needed it (0.39.0): a
 * career's position is turned into a wall date by two callers now - the
 * redundancy notice that has to be over a statutory floor, and the month-end
 * change freeze that has to know which side of the first of the month a
 * Wednesday is on - and two copies of "a week is seven days" is two calendars
 * waiting to disagree about what month it is. `pressure.ts` re-exports it, so
 * the arc's own readers still ask the arc.
 */
export const DAYS_PER_CALENDAR_WEEK = 7;

/**
 * The day of the WHOLE CAREER a given day of a given arc week is, counting
 * from 1 - the arithmetic that folds the week the player is on back into the
 * one anchor.
 *
 * The world's clock restarts every week (each week is its own session and its
 * own graph), so `dayForTick` only ever answers one to five and the wall
 * calendar above only ever knows the five days in front of it. Anything that
 * has to know the real date - a notice, a month end - has to add the weeks
 * back on, and this is where that is written down once.
 */
export function arcCalendarDay(week: number, day: number): number {
  if (!Number.isSafeInteger(week) || week < 1) {
    throw new TypeError('A week of a career arc is numbered from 1.');
  }

  requireDay(day);

  return (week - 1) * DAYS_PER_CALENDAR_WEEK + day;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * A day of the career on the wall calendar, taken apart: the year, the month,
 * the day of that month, and how many days that month has.
 *
 * The last of those is the one that cannot be guessed at, and it is why this
 * exists rather than a caller doing its own arithmetic on the date string: a
 * month-end is the thirtieth in September, the thirty-first in October and
 * the twenty-eighth in February, and a rule that hard-coded any of those would
 * be right for one month in twelve. `Date` knows; asking it is free.
 */
export interface CalendarDay {
  readonly year: number;
  /** 1-12, the way a human says it rather than the way a Date does. */
  readonly month: number;
  readonly dayOfMonth: number;
  readonly daysInMonth: number;
}

export function calendarParts(day: number): CalendarDay {
  requireDay(day);
  // UTC throughout: the same save opened in two time zones is the same week,
  // and a date that moved with the reader would be a determinism hole.
  const date = new Date(Date.UTC(
    WEEK_STARTS_ON.year,
    WEEK_STARTS_ON.month - 1,
    WEEK_STARTS_ON.dayOfMonth + (day - 1),
  ));
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;

  return {
    year,
    month,
    dayOfMonth: date.getUTCDate(),
    // Day zero of the NEXT month is the last day of this one, which is the
    // standard way to ask a calendar how long a month is without a table.
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}

/** The date a simulated day falls on, as this estate writes dates. */
export function calendarDate(day: number): string {
  const { year, month, dayOfMonth } = calendarParts(day);

  return `${twoDigits(dayOfMonth)}/${twoDigits(month)}/${String(year)}`;
}

/**
 * A day and a minute of it, in the shape a directory listing prints: the date,
 * two spaces, the twenty-four-hour clock.
 *
 * It takes a minute of the day rather than a tick because the things this
 * world dates are not all inside the clock: the pile of print jobs behind a
 * wedged spooler built up before eight, and tick zero is eight.
 */
export function stampAt(day: number, minute: number): string {
  return `${calendarDate(day)}  ${
    twoDigits(Math.floor(minute / 60))
  }:${twoDigits(minute % 60)}`;
}

/**
 * A minute of the simulation, in the same shape. Everything a file surface
 * dates goes through one of these two, so a file the world wrote and a file it
 * was seeded with are stamped in one format.
 */
export function fileStamp(tick: number): string {
  return stampAt(dayForTick(tick), minuteOfDay(tick));
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
 * WORKING minutes elapsed by the time the clock reads `tick`, counted from the
 * beginning of the world - service minutes with the canteen taken out.
 *
 * Same closed form as `serviceMinutesAt` and deliberately built on top of it
 * rather than beside it, so the two can never disagree about where a day
 * starts or how many of them have gone by: this is that number minus the lunch
 * that has already happened, and nothing else.
 */
export function workingMinutesAt(tick: number): number {
  requireTick(tick, 'A simulation tick');
  const days = Math.floor((DAY_OPENS_MINUTE + tick) / MINUTES_PER_DAY);
  const lunched = days * LUNCH_MINUTES
    + clamp(minuteOfDay(tick) - LUNCH_START_MINUTE, 0, LUNCH_MINUTES);

  return serviceMinutesAt(tick) - lunched;
}

/** Working minutes between two ticks. Never negative; `to` before `from` is 0. */
export function workingMinutesBetween(from: number, to: number): number {
  return Math.max(0, workingMinutesAt(to) - workingMinutesAt(from));
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

