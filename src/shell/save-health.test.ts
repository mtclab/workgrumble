import { describe, expect, it } from 'vitest';

import { SaveHealth } from './save-health';

describe('the save health latch', () => {
  it('starts clean, and starts dirty when storage was already refusing', () => {
    expect(new SaveHealth().problem()).toBeNull();
    expect(new SaveHealth('blocked').problem()).toBe('blocked');
  });

  /**
   * The point of the latch. "Nothing you do is being kept" is a STATE, and the
   * two writes that produce it - the day-boundary checkpoint and the retry
   * acknowledgement - happen where no player is looking. A toast about it
   * scrolls away; this does not, until a write actually works.
   */
  it('holds a failure until a later write succeeds', () => {
    const health = new SaveHealth();
    const seen: (string | null)[] = [];
    health.onChanged(() => {
      seen.push(health.problem());
    });

    health.failed('Storage is full.');
    expect(health.problem()).toBe('Storage is full.');
    // Repeats of the same failure are not news and do not repaint.
    health.failed('Storage is full.');
    health.succeeded();
    expect(health.problem()).toBeNull();
    health.succeeded();

    expect(seen).toEqual(['Storage is full.', null]);
  });

  it('lets go of a listener that let go of it', () => {
    const health = new SaveHealth();
    let calls = 0;
    const stop = health.onChanged(() => {
      calls += 1;
    });

    health.failed('one');
    stop();
    stop();
    health.succeeded();

    expect(calls).toBe(1);
  });
});
