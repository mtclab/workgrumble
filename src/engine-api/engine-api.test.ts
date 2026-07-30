import { describe, expect, it } from 'vitest';

import { EventFanOut } from './engine-api';
import type { EngineEvent } from './types';

const SPAWNED: EngineEvent = { type: 'ticket:spawned', id: 'ticket:x' };
const RESOLVED: EngineEvent = { type: 'ticket:resolved', id: 'ticket:x' };

describe('EventFanOut', () => {
  it('delivers every event in order and stops on unsubscribe', () => {
    const fanOut = new EventFanOut();
    const seen: EngineEvent[] = [];
    const unsubscribe = fanOut.onEvent((event) => {
      seen.push(event);
    });

    fanOut.emit([SPAWNED, RESOLVED]);
    unsubscribe();
    unsubscribe();
    fanOut.emit([SPAWNED]);

    expect(seen).toEqual([SPAWNED, RESOLVED]);
  });

  /**
   * An app that closes a window while being notified unsubscribes mid-emit.
   * Iterating the live set would skip whoever came after it - the bug that
   * makes one app's close swallow another app's repaint.
   */
  it('keeps notifying the rest when a listener unsubscribes mid-emit', () => {
    const fanOut = new EventFanOut();
    const seen: string[] = [];
    const unsubscribe = fanOut.onEvent(() => {
      seen.push('first');
      unsubscribe();
    });
    fanOut.onEvent(() => {
      seen.push('second');
    });

    fanOut.emit([SPAWNED]);
    fanOut.emit([RESOLVED]);

    expect(seen).toEqual(['first', 'second', 'second']);
  });

  it('announces ticks separately from events', () => {
    const fanOut = new EventFanOut();
    const ticks: number[] = [];
    const events: EngineEvent[] = [];
    const stop = fanOut.onTick((tick) => {
      ticks.push(tick);
    });
    fanOut.onEvent((event) => {
      events.push(event);
    });

    fanOut.tick(1);
    fanOut.emit([SPAWNED]);
    fanOut.tick(2);
    stop();
    fanOut.tick(3);

    expect(ticks).toEqual([1, 2]);
    expect(events).toEqual([SPAWNED]);
  });
});
