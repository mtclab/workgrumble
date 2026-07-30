import { describe, expect, it } from 'vitest';

import { createReentrantPass } from './reentrant';

describe('re-entrant pass guard', () => {
  it('defers a nested call until the running pass returns', () => {
    const log: string[] = [];
    let sync: (value: string) => void = () => undefined;

    sync = createReentrantPass<string>((value) => {
      log.push(`enter ${value}`);

      if (value === 'first') {
        sync('second');
      }

      log.push(`leave ${value}`);
    });

    sync('first');

    expect(log).toEqual([
      'enter first',
      'leave first',
      'enter second',
      'leave second',
    ]);
  });

  it('coalesces several nested calls into the newest state', () => {
    const seen: string[] = [];
    let sync: (value: string) => void = () => undefined;

    sync = createReentrantPass<string>((value) => {
      seen.push(value);

      if (value === 'a') {
        sync('b');
        sync('c');
      }
    });

    sync('a');

    expect(seen).toEqual(['a', 'c']);
  });

  /**
   * The shape of the real defect: an app that opens another app synchronously
   * from `mount`. The pass mounts whatever the committed state holds, and the
   * mount of "about" commits a state that also holds "bubbles".
   */
  it('mounts every app exactly once when one app opens another from mount', () => {
    const mounts: string[] = [];
    const mounted = new Set<string>();
    let open: readonly string[] = [];
    let sync: (value: readonly string[]) => void = () => undefined;

    const openApp = (id: string): void => {
      if (!open.includes(id)) {
        open = [...open, id];
      }

      sync(open);
    };

    sync = createReentrantPass<readonly string[]>((state) => {
      for (const id of state) {
        if (mounted.has(id)) {
          continue;
        }

        mounts.push(id);

        if (mounts.length > 8) {
          // Without the guard this model recurses until the stack gives out;
          // the cap turns that into a readable failure.
          throw new Error(`Runaway mounts: ${mounts.join(', ')}`);
        }

        // Plugin code runs before the window is on the books - exactly the
        // window renderer, which only records an app once `mount` returns.
        if (id === 'about') {
          openApp('bubbles');
        }

        mounted.add(id);
      }
    });

    openApp('about');

    expect(mounts).toEqual(['about', 'bubbles']);
    expect(open).toEqual(['about', 'bubbles']);
  });

  it('survives a throwing pass and stays usable afterwards', () => {
    const seen: string[] = [];
    let sync: (value: string) => void = () => undefined;

    sync = createReentrantPass<string>((value) => {
      seen.push(value);

      if (value === 'boom') {
        sync('never');
        throw new Error('pass failed');
      }
    });

    expect(() => {
      sync('boom');
    }).toThrow('pass failed');
    // The failed pass takes its own queue down with it - replaying state that
    // was never committed would paint a world that does not exist.
    expect(seen).toEqual(['boom']);

    sync('after');
    expect(seen).toEqual(['boom', 'after']);
  });
});
