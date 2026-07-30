import { describe, expect, it } from 'vitest';

import { createRng } from './rng';

describe('createRng', () => {
  it('produces the committed mulberry32 sequence', () => {
    const rng = createRng(1);

    expect(rng.next()).toBeCloseTo(0.6270739405881613, 15);
    expect(rng.next()).toBeCloseTo(0.002735721180215, 15);
    expect(rng.next()).toBeCloseTo(0.5274470399599522, 15);
  });

  it('generates inclusive integers and picks deterministic values', () => {
    const left = createRng(23);
    const right = createRng(23);
    const leftValues = Array.from(
      { length: 30 },
      () => left.int(-2, 4),
    );
    const rightValues = Array.from(
      { length: 30 },
      () => right.int(-2, 4),
    );

    expect(leftValues).toEqual(rightValues);
    expect(leftValues.every((value) => value >= -2 && value <= 4)).toBe(true);
    expect(createRng(8).pick(['a', 'b', 'c'])).toBe(
      createRng(8).pick(['a', 'b', 'c']),
    );
    expect(() => createRng(8).pick([])).toThrow(RangeError);
  });

  it('forks by parent seed and label without consuming the parent stream', () => {
    const parent = createRng(99);
    const expectedParent = createRng(99);
    const firstChild = parent.fork('ticket:printer');

    expect(parent.next()).toBe(expectedParent.next());
    const secondChild = parent.fork('ticket:printer');
    const otherChild = parent.fork('ticket:mail');

    expect(firstChild.next()).toBe(secondChild.next());
    expect(secondChild.next()).not.toBe(otherChild.next());
    expect(parent.next()).toBe(expectedParent.next());
    expect(parent.next()).toBe(expectedParent.next());
  });
});
