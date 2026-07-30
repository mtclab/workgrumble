import { describe, expect, it } from 'vitest';

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

  it('rejects values that are not valid simulation ticks', () => {
    expect(() => formatSimTime(-1)).toThrow(TypeError);
    expect(() => formatSimTime(0.5)).toThrow(TypeError);
  });
});
