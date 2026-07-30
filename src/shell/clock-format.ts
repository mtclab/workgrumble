const MINUTES_PER_DAY = 24 * 60;
const SHIFT_START_MINUTE = 8 * 60;

export interface SimTimeDisplay {
  readonly day: string;
  readonly time: string;
  readonly accessible: string;
}

export function formatSimTime(tick: number): SimTimeDisplay {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new TypeError('Simulation tick must be a non-negative safe integer.');
  }

  const elapsed = SHIFT_START_MINUTE + tick;
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
