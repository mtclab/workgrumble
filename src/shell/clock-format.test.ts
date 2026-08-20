import { describe, expect, it } from 'vitest';

import {
  arcDateForTick,
  calendarDate,
  MINUTES_PER_DAY,
  stampAt,
} from '../world/hours';
import { formatSimTime } from './clock-format';

describe('simulation clock display formatter', () => {
  it('formats ticks as simulation minutes from the shift start', () => {
    expect(formatSimTime(0)).toEqual({
      day: 'Day 1',
      time: '08:00',
      accessible: 'Day 1, simulation time 08:00',
    });
    expect(formatSimTime(65).time).toBe('09:05');
    expect(formatSimTime(16 * 60).day).toBe('Day 2');
  });

  /**
   * A TICK IS NOT A DATE (0.40.0), and this is the gate that says so.
   *
   * The face this module hands out carries a day of the week and a clock and
   * NOTHING a wall calendar could be written from, because the world's clock
   * restarts every Monday: the same tick is the seventh of September in the
   * probation week and the twenty-eighth in the fourth. Anything that wants a
   * date asks `arcDateForTick`, which takes the week as well - so a caller
   * that has not got one cannot print a wrong date by accident, and there is
   * no defaulted field for it to print a wrong date THROUGH.
   */
  it('hands out no date a week could be wrong about', () => {
    expect(formatSimTime(0)).not.toHaveProperty('date');

    // The week-one answers are the ones this module used to give, unchanged:
    // whatever the arc does, the probation week folds onto itself.
    expect(arcDateForTick(1, 0)).toBe(calendarDate(1));
    expect(arcDateForTick(1, 16 * 60)).toBe(calendarDate(2));
    // Day 3 at four minutes to five: the second of the two outages the
    // recurring arc is diagnosed by, in the format `type` prints it in.
    expect(arcDateForTick(1, 2 * MINUTES_PER_DAY + 8 * 60 + 56))
      .toBe('09/09/1998');
    expect(stampAt(3, 16 * 60 + 56)).toBe('09/09/1998  16:56');

    // And the same minute of the same weekday, three weeks into the career,
    // is three weeks later on the wall - which is the whole defect this
    // module was on the wrong side of.
    expect(arcDateForTick(4, 2 * MINUTES_PER_DAY + 8 * 60 + 56))
      .toBe('30/09/1998');
  });

  it('rejects values that are not valid simulation ticks', () => {
    expect(() => formatSimTime(-1)).toThrow(TypeError);
    expect(() => formatSimTime(0.5)).toThrow(TypeError);
  });
});
