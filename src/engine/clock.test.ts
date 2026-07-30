import { describe, expect, it } from 'vitest';

import { SimClock } from './clock';

describe('SimClock', () => {
  it('advances integer ticks synchronously and unsubscribes listeners', () => {
    const clock = new SimClock();
    const ticks: number[] = [];
    const unsubscribe = clock.onTick((tick) => {
      ticks.push(tick);
    });

    clock.advance(3);
    unsubscribe();
    clock.advance(2);

    expect(clock.now()).toBe(5);
    expect(ticks).toEqual([1, 2, 3]);
  });

  it('pauses advancement and leaves speed application to the caller', () => {
    const clock = new SimClock(4, 2);
    clock.pause();
    clock.advance(5);

    expect(clock.now()).toBe(4);
    expect(clock.speed).toBe(2);

    clock.speed = 0.5;
    clock.resume();
    clock.advance(1);

    expect(clock.now()).toBe(5);
    expect(clock.speed).toBe(0.5);
  });

  it('rejects fractional, negative, and invalid clock values', () => {
    const clock = new SimClock();

    expect(() => clock.advance(1.5)).toThrow(TypeError);
    expect(() => clock.advance(-1)).toThrow(TypeError);
    expect(() => {
      clock.speed = 0;
    }).toThrow(TypeError);
  });
});

