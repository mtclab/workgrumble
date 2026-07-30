/**
 * Re-entrancy guard for full-state paints (no DOM, no shell knowledge).
 *
 * A paint that mounts plugin code can be re-entered by that plugin: an app
 * that calls `openApp` from its own `mount` commits new window state, which
 * asks for another paint while the first one is only half done. Left alone
 * that nests paints inside each other, mounts the same app twice and can
 * recurse without a bottom.
 *
 * The guard turns nesting into a queue: a call raised while a pass is running
 * is deferred and replayed once that pass returns.
 */
export type Pass<T> = (value: T) => void;

/**
 * Wraps `pass` so it never runs inside itself.
 *
 * Deferred calls are coalesced - a full-state paint is idempotent, so only the
 * newest state is worth painting. Termination is the caller's: the loop stops
 * as soon as a pass raises no new call, which holds for the window renderer
 * because a pass only mounts each window once and the manifest is finite.
 */
export function createReentrantPass<T>(pass: Pass<T>): Pass<T> {
  let running = false;
  let pending: { readonly value: T } | null = null;

  return (value: T): void => {
    if (running) {
      pending = { value };
      return;
    }

    running = true;

    try {
      let current = value;

      for (;;) {
        pass(current);
        const queued = pending;
        pending = null;

        if (queued === null) {
          return;
        }

        current = queued.value;
      }
    } finally {
      // A throwing pass must not wedge every later paint, and it must not
      // leave its half-written queue behind for the next one to replay.
      running = false;
      pending = null;
    }
  };
}
