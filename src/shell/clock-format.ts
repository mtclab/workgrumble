import { DAY_OPENS_MINUTE, MINUTES_PER_DAY } from '../world/day';
import { calendarDate } from '../world/hours';

export interface SimTimeDisplay {
  readonly day: string;
  readonly time: string;
  /**
   * The same minute on the wall calendar: `09/09/1998`.
   *
   * "Day 3" is what a game clock says and it is what most of this shell wants
   * - a scorecard, a payslip and a brief are all about which day of the week
   * it is. A LOG is not: a machine's own log and a directory listing are two
   * views of the same estate, and if one of them says "Day 3" and the other
   * says 09/09/1998 the player has to do the arithmetic to know they are
   * looking at the same evening. So the date is here, off the same anchor
   * every file surface uses, rather than being formatted a second way by
   * whichever window happened to need it.
   */
  readonly date: string;
  readonly accessible: string;
}

export function formatSimTime(tick: number): SimTimeDisplay {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new TypeError('Simulation tick must be a non-negative safe integer.');
  }

  // The day model owns where tick 0 sits; this only turns it into a face.
  const elapsed = DAY_OPENS_MINUTE + tick;
  const dayNumber = Math.floor(elapsed / MINUTES_PER_DAY) + 1;
  const minuteOfDay = elapsed % MINUTES_PER_DAY;
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  const time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const day = `Day ${String(dayNumber)}`;

  return {
    day,
    time,
    date: calendarDate(dayNumber),
    accessible: `${day}, simulation time ${time}`,
  };
}
