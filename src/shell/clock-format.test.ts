import { describe, expect, it } from 'vitest';

import { calendarDate, MINUTES_PER_DAY, stampAt } from '../world/hours';
import { formatSimTime } from './clock-format';

describe('simulation clock display formatter', () => {
  it('formats ticks as simulation minutes from the shift start', () => {
    expect(formatSimTime(0)).toEqual({
      day: 'Day 1',
      time: '08:00',
      date: '07/09/1998',
      accessible: 'Day 1, simulation time 08:00',
    });
    expect(formatSimTime(65).time).toBe('09:05');
    expect(formatSimTime(16 * 60).day).toBe('Day 2');
  });

  /**
   * The date is the same one every file surface prints, off the same anchor,
   * so a log line and a directory listing cannot disagree about what evening
   * they are both describing. Two windows, one calendar.
   */
  it('dates a tick the way the drive dates a file', () => {
    expect(formatSimTime(0).date).toBe(calendarDate(1));
    expect(formatSimTime(16 * 60).date).toBe(calendarDate(2));
    // Day 3 at four minutes to five: the second of the two outages the
    // recurring arc is diagnosed by, in the format `type` prints it in.
    expect(formatSimTime(2 * MINUTES_PER_DAY + 8 * 60 + 56).date)
      .toBe('09/09/1998');
    expect(stampAt(3, 16 * 60 + 56)).toBe('09/09/1998  16:56');
  });

  it('rejects values that are not valid simulation ticks', () => {
    expect(() => formatSimTime(-1)).toThrow(TypeError);
    expect(() => formatSimTime(0.5)).toThrow(TypeError);
  });
});
