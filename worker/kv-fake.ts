/**
 * KV, as far as anything in this Worker can tell: a map that answers promises
 * and remembers what expiry each write asked for.
 *
 * It lives beside the code rather than inside one test file because three
 * suites need it - the counters, the badges and the saves - and the TTL is the
 * part worth being able to assert. A retention rule implemented as "pass
 * `expirationTtl` on every put" is a rule that is one forgotten argument away
 * from an immortal record, and the only way to see that argument is to have
 * kept it.
 *
 * Nothing in `index.ts` imports this, so it is not in the deployed bundle.
 */

import type { KVNamespace } from './types';

export interface StoredValue {
  readonly value: string;
  /** What the write asked for, or undefined for a write that asked for none. */
  readonly expirationTtl: number | undefined;
}

export interface FakeKv extends KVNamespace {
  /** What each key holds, as text. */
  readonly entries: Map<string, string>;
  /** The seconds the last write to this key asked for, if it asked. */
  ttlOf(key: string): number | undefined;
  /** How many writes have landed, for "this wrote nothing" assertions. */
  writes(): number;
}

export function fakeKv(seed: Readonly<Record<string, string>> = {}): FakeKv {
  const stored = new Map<string, StoredValue>();
  const entries = new Map<string, string>();
  let writes = 0;

  for (const [key, value] of Object.entries(seed)) {
    stored.set(key, { value, expirationTtl: undefined });
    entries.set(key, value);
  }

  return {
    entries,
    ttlOf: (key) => stored.get(key)?.expirationTtl,
    writes: () => writes,
    get: (key) => Promise.resolve(stored.get(key)?.value ?? null),
    put: (key, value, options) => {
      writes += 1;
      stored.set(key, { value, expirationTtl: options?.expirationTtl });
      entries.set(key, value);
      return Promise.resolve();
    },
    delete: (key) => {
      stored.delete(key);
      entries.delete(key);
      return Promise.resolve();
    },
  };
}
