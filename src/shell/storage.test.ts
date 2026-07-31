import { describe, expect, it } from 'vitest';

import {
  MemoryStorage,
  NO_STORAGE_REASON,
  openStorage,
} from './storage';

/** A store that hands itself over and then refuses every write. */
class SealedStorage extends MemoryStorage {
  public override setItem(): void {
    throw new DOMException('QuotaExceededError');
  }
}

describe('opening storage', () => {
  it('uses the real thing when the browser allows it', () => {
    const real = new MemoryStorage();
    const handle = openStorage(() => real);

    expect(handle.durable).toBe(true);
    expect(handle.reason).toBeNull();
    expect(handle.storage).toBe(real);
    // And the probe leaves nothing behind.
    expect(real.length).toBe(0);
  });

  /**
   * The case that used to take the whole page down: reading `localStorage` is
   * not a property access in every browser, it is a decision, and in a window
   * with storage blocked it THROWS. That happened before anything had
   * rendered, so the player got a blank body and an unhandled rejection.
   */
  it('falls back when reaching for storage throws', () => {
    const handle = openStorage(() => {
      throw new DOMException('SecurityError');
    });

    expect(handle.durable).toBe(false);
    expect(handle.reason).toBe(NO_STORAGE_REASON);
    handle.storage.setItem('a', 'b');
    expect(handle.storage.getItem('a')).toBe('b');
  });

  /**
   * And the sneakier one: a browser that hands over a Storage object and then
   * refuses the first write. Only a real write finds that out, which is why
   * the probe is a write rather than a typeof check.
   */
  it('falls back when the store refuses to keep anything', () => {
    const handle = openStorage(() => new SealedStorage());

    expect(handle.durable).toBe(false);
    expect(handle.reason).toBe(NO_STORAGE_REASON);
    // The substitute still works, so the week still plays.
    handle.storage.setItem('week', 'one');
    expect(handle.storage.getItem('week')).toBe('one');
  });

  it('is a whole Storage, not the three methods this game happens to call', () => {
    const memory = new MemoryStorage();

    memory.setItem('a', '1');
    memory.setItem('b', '2');
    expect(memory.length).toBe(2);
    expect(memory.key(1)).toBe('b');
    expect(memory.key(9)).toBeNull();
    memory.removeItem('a');
    expect(memory.getItem('a')).toBeNull();
    memory.clear();
    expect(memory.length).toBe(0);
  });
});
