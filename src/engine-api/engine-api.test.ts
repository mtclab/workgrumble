import { describe, expect, it } from 'vitest';

import { EventFanOut } from './engine-api';
import type { EngineEvent } from './types';

const SPAWNED: EngineEvent = { type: 'ticket:spawned', id: 'ticket:x' };
const RESOLVED: EngineEvent = { type: 'ticket:resolved', id: 'ticket:x' };
const BREACHED: EngineEvent = { type: 'ticket:breached', id: 'ticket:x' };

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

  /**
   * A listener that dispatches while being notified produces more events. Sent
   * out immediately, they would reach the listeners AFTER this one before the
   * event those listeners are still waiting for - a consequence delivered
   * ahead of its cause, to half the room.
   */
  it('delivers events a listener causes behind the batch in flight', () => {
    const fanOut = new EventFanOut();
    const first: string[] = [];
    const second: string[] = [];
    let nested = false;

    fanOut.onEvent((event) => {
      first.push(event.type);

      if (event.type === 'ticket:spawned' && !nested) {
        nested = true;
        fanOut.emit([RESOLVED]);
      }
    });
    fanOut.onEvent((event) => {
      second.push(event.type);
    });

    fanOut.emit([SPAWNED, BREACHED]);

    // The cause reaches BOTH listeners before the consequence reaches either.
    expect(first).toEqual(['ticket:spawned', 'ticket:breached', 'ticket:resolved']);
    expect(second).toEqual(['ticket:spawned', 'ticket:breached', 'ticket:resolved']);
  });

  /**
   * One app's bad repaint used to swallow the event for every app after it in
   * the set: the window that threw took the others' update with it.
   */
  it('tells everybody even when a listener throws, then reports it', () => {
    const fanOut = new EventFanOut();
    const seen: string[] = [];

    fanOut.onEvent(() => {
      throw new Error('a window that repaints badly');
    });
    fanOut.onEvent((event) => {
      seen.push(event.type);
    });

    expect(() => {
      fanOut.emit([SPAWNED, RESOLVED]);
    }).toThrow(AggregateError);

    expect(seen).toEqual(['ticket:spawned', 'ticket:resolved']);

    // And the queue is not left holding anything for the next emit to deliver
    // out of nowhere.
    const later: string[] = [];
    fanOut.onEvent((event) => {
      later.push(event.type);
    });

    expect(() => {
      fanOut.emit([BREACHED]);
    }).toThrow(AggregateError);
    expect(later).toEqual(['ticket:breached']);
  });

  it('keeps ticking the rest when a tick listener throws', () => {
    const fanOut = new EventFanOut();
    const ticks: number[] = [];

    fanOut.onTick(() => {
      throw new Error('a clock nobody can read');
    });
    fanOut.onTick((tick) => {
      ticks.push(tick);
    });

    expect(() => {
      fanOut.tick(4);
    }).toThrow(AggregateError);
    expect(ticks).toEqual([4]);
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
