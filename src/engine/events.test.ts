import { describe, expect, it } from 'vitest';

import { EventBus } from './events';

interface TestEvents {
  count: { value: number };
  done: undefined;
}

describe('EventBus', () => {
  it('emits synchronously and unsubscribes a typed listener', () => {
    const bus = new EventBus<TestEvents>();
    const received: number[] = [];
    const unsubscribe = bus.on('count', ({ value }) => {
      received.push(value);
    });

    bus.emit('count', { value: 1 });
    expect(received).toEqual([1]);

    unsubscribe();
    unsubscribe();
    bus.emit('count', { value: 2 });
    expect(received).toEqual([1]);
  });

  it('uses a listener snapshot during an emission', () => {
    const bus = new EventBus<TestEvents>();
    const calls: string[] = [];
    let unsubscribeSecond = (): void => {};

    bus.on('done', () => {
      calls.push('first');
      unsubscribeSecond();
    });
    unsubscribeSecond = bus.on('done', () => {
      calls.push('second');
    });

    bus.emit('done', undefined);
    bus.emit('done', undefined);

    expect(calls).toEqual(['first', 'second', 'first']);
  });
});

