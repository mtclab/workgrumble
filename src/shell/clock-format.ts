import { DAY_OPENS_MINUTE, MINUTES_PER_DAY } from '../world/day';

/**
 * The face of a minute: which day of the week it is, what the clock reads, and
 * how a screen reader says both.
 *
 * IT HAS NO DATE ON IT, and losing one is the correction 0.40.0 makes here.
 *
 * It carried one until 0.39.0 - `date: calendarDate(dayNumber)` - for a good
 * reason that turned out to be half a reason: a machine's own log and a
 * directory listing are two views of one estate, so the Event Viewer has to
 * print `09/09/1998` where a scorecard prints "Day 3", and formatting that a
 * second way in whichever window needed it would have been a second calendar.
 * True, and it stayed true. What was wrong is that it was derived HERE, from a
 * tick and nothing else, and a tick is not a date: the world's clock restarts
 * every Monday, so a tick names a minute of SOME week. In arc week four this
 * printed the seventh of September on a fault that happened on the
 * twenty-eighth, one window away from an audit that said so.
 *
 * So the date moved to the only place that can compute one - `hours.ts`, where
 * `arcDateForTick(week, tick)` takes both halves - and this type dropped the
 * field rather than defaulting it to week one. Defaulting would have kept
 * every present caller working and left the next one to rediscover the bug;
 * the missing field makes the compiler ask for the week.
 */
export interface SimTimeDisplay {
  readonly day: string;
  readonly time: string;
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
    accessible: `${day}, simulation time ${time}`,
  };
}
