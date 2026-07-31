import { describe, expect, it } from 'vitest';

import {
  admit,
  isTokenShape,
  parseTokenPolicy,
  parseUses,
  spendAdmission,
  usesKey,
} from './tokens';
import type { KVNamespace } from './types';

/**
 * The door's own arithmetic, and the invariant that keeps a revocation
 * durable.
 *
 * Five of the six outcomes here are refusals, and the only one anybody
 * exercises by hand is the sixth. A revoked token that still has uses left and
 * has not expired is exactly the link somebody who was thrown out will try
 * again, and it is the case an `if` chain in the wrong order lets through.
 *
 * The last block is the standing gate for a defect found in production on day
 * one: the door used to write the whole token record back with the count on
 * it, so any admission that had read that record before a revoke landed put
 * `revoked: false` back afterwards.
 */

const NOW = 1_700_000_000_000;
const TOKEN = 'abcdefgh12345678';

function record(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    label: 'Ada',
    uses_max: null,
    expires_at: null,
    revoked: false,
    ...over,
  });
}

/** KV as far as the door is concerned, with every write written down. */
interface FakeKv extends KVNamespace {
  readonly entries: Map<string, string>;
  /** Every key put, in order, whatever it was put for. */
  readonly writes: string[];
  /** Runs after a read of a key resolves, to land a change in that window. */
  afterGet: ((key: string) => void) | null;
}

function fakeKv(seed: Readonly<Record<string, string>> = {}): FakeKv {
  const entries = new Map<string, string>(Object.entries(seed));
  const writes: string[] = [];
  const kv: FakeKv = {
    entries,
    writes,
    afterGet: null,
    get: (key: string) => {
      const value = entries.get(key) ?? null;
      kv.afterGet?.(key);
      return Promise.resolve(value);
    },
    put: (key: string, value: string) => {
      writes.push(key);
      entries.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string) => {
      entries.delete(key);
      return Promise.resolve();
    },
  };

  return kv;
}

describe('token shape', () => {
  it('takes the ids the CLI mints and nothing that looks like a path', () => {
    expect(isTokenShape(TOKEN)).toBe(true);
    expect(isTokenShape('Ab_-09'.repeat(4))).toBe(true);

    expect(isTokenShape('short')).toBe(false);
    expect(isTokenShape('a'.repeat(65))).toBe(false);
    expect(isTokenShape('../../secrets')).toBe(false);
    expect(isTokenShape('rate/door/abcdefgh')).toBe(false);
    expect(isTokenShape('')).toBe(false);
  });

  /**
   * The counter lives under a key no token can wear, which is what lets the
   * two share a namespace without either being able to impersonate the other -
   * and what lets the owner's listing tell them apart without guessing.
   */
  it('keeps counters somewhere no token could be', () => {
    expect(usesKey(TOKEN)).toBe(`uses/${TOKEN}`);
    expect(isTokenShape(usesKey(TOKEN))).toBe(false);
  });
});

describe('policy records', () => {
  it('reads the record the CLI writes', () => {
    expect(parseTokenPolicy(record({ uses_max: 3 }))).toEqual({
      label: 'Ada',
      uses_max: 3,
      expires_at: null,
      revoked: false,
      legacy_uses: 0,
    });
  });

  it('refuses anything that is not one', () => {
    expect(parseTokenPolicy(null)).toBeNull();
    expect(parseTokenPolicy('not json')).toBeNull();
    expect(parseTokenPolicy('[]')).toBeNull();
    expect(parseTokenPolicy(record({ label: 7 }))).toBeNull();
    expect(parseTokenPolicy(record({ uses_max: -1 }))).toBeNull();
    expect(parseTokenPolicy(record({ uses_max: 1.5 }))).toBeNull();
    expect(parseTokenPolicy(record({ expires_at: 'soon' }))).toBeNull();
  });

  /**
   * The one default that must fail shut. A record whose flag was lost, renamed
   * or typo'd is a record nobody can vouch for, and reading a missing
   * `revoked` as `false` is reading "we do not know" as "it is fine".
   */
  it('treats a missing or unreadable revocation flag as revoked', () => {
    expect(parseTokenPolicy(record({ revoked: undefined }))?.revoked).toBe(true);
    expect(parseTokenPolicy(record({ revoked: 'no' }))?.revoked).toBe(true);
    expect(parseTokenPolicy(record({ revoked: 0 }))?.revoked).toBe(true);
    expect(parseTokenPolicy(record())?.revoked).toBe(false);
  });

  /**
   * A count ON the policy record can only have come from the build that kept
   * it there. It is read as the counter's starting value, so a link minted
   * before the split does not silently get all its admissions back.
   */
  it('carries an old record\'s count forward as a starting value', () => {
    const older = parseTokenPolicy(record({ uses_max: 5, uses_count: 3 }));

    expect(older?.legacy_uses).toBe(3);
    expect(older === null ? -1 : parseUses(null, older)).toBe(3);
    // And a real counter always wins over it.
    expect(older === null ? -1 : parseUses('4', older)).toBe(4);
  });

  it('falls back to the record when a counter is not a count', () => {
    const policy = parseTokenPolicy(record({ uses_count: 2 }));

    if (policy === null) {
      throw new Error('the fixture record must parse');
    }

    // The empty string is the one that matters and the one `Number` gets
    // wrong: it reads as zero, so a counter blanked by a bad write would hand
    // a counted link every one of its admissions back.
    expect(parseUses('', policy)).toBe(2);
    expect(parseUses(' ', policy)).toBe(2);
    expect(parseUses('lots', policy)).toBe(2);
    expect(parseUses('-1', policy)).toBe(2);
    expect(parseUses('1.5', policy)).toBe(2);
    expect(parseUses('1e3', policy)).toBe(2);
    expect(parseUses('0x10', policy)).toBe(2);
    expect(parseUses('0', policy)).toBe(0);
    expect(parseUses('7', policy)).toBe(7);
  });
});

describe('admission', () => {
  it('admits a shared link and counts the admission', () => {
    const outcome = admit(TOKEN, record(), '4', NOW);

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.spent).toBe(5);
    expect(outcome.ok && outcome.policy.uses_max).toBeNull();
  });

  it('admits a counted link until the last use, then stops', () => {
    const twice = record({ uses_max: 2 });
    expect(admit(TOKEN, twice, '1', NOW).ok).toBe(true);
    expect(admit(TOKEN, twice, '2', NOW))
      .toEqual({ ok: false, why: 'exhausted' });

    // One use, used once, is spent - not "one more".
    const once = record({ uses_max: 1 });
    expect(admit(TOKEN, once, '1', NOW))
      .toEqual({ ok: false, why: 'exhausted' });
    expect(admit(TOKEN, once, '0', NOW).ok).toBe(true);
  });

  it('refuses a token that ran out of time, on the minute', () => {
    expect(admit(TOKEN, record({ expires_at: NOW + 1 }), null, NOW).ok)
      .toBe(true);
    expect(admit(TOKEN, record({ expires_at: NOW }), null, NOW))
      .toEqual({ ok: false, why: 'expired' });
    expect(admit(TOKEN, record({ expires_at: NOW - 1 }), null, NOW))
      .toEqual({ ok: false, why: 'expired' });
  });

  /**
   * Revocation beats everything else on the record. This is the assertion
   * that pins the ORDER of the checks: a revoked link with uses left and no
   * expiry passes every other test on the way past.
   */
  it('refuses a revoked token that is otherwise perfectly good', () => {
    expect(admit(TOKEN, record({ revoked: true, uses_max: 100 }), '0', NOW))
      .toEqual({ ok: false, why: 'revoked' });
    expect(admit(TOKEN, record({ revoked: true, expires_at: null }), null, NOW))
      .toEqual({ ok: false, why: 'revoked' });
  });

  it('refuses a token nobody minted, and one nobody can read', () => {
    expect(admit(TOKEN, null, null, NOW)).toEqual({ ok: false, why: 'unknown' });
    expect(admit(TOKEN, '{', null, NOW))
      .toEqual({ ok: false, why: 'unreadable' });
    expect(admit('/etc/passwd', record(), null, NOW))
      .toEqual({ ok: false, why: 'malformed' });
  });

  /**
   * The refusals are told apart HERE and nowhere a caller can see. If this
   * list ever reaches a response body, the door starts answering "which of
   * these is it", which is the whole of what enumeration needs.
   */
  it('has one shape of refusal, whatever the reason', () => {
    const refusals = [
      admit('short', record(), null, NOW),
      admit(TOKEN, null, null, NOW),
      admit(TOKEN, record({ revoked: true }), null, NOW),
      admit(TOKEN, record({ expires_at: NOW - 1 }), null, NOW),
      admit(TOKEN, record({ uses_max: 1 }), '1', NOW),
    ];

    for (const refusal of refusals) {
      expect(refusal.ok).toBe(false);
      expect(Object.keys(refusal).sort()).toEqual(['ok', 'why']);
    }
  });
});

describe('spending an admission against a real KV', () => {
  it('counts it in the counter and admits', async () => {
    const kv = fakeKv({
      [TOKEN]: record({ uses_max: 5 }),
      [usesKey(TOKEN)]: '1',
    });

    expect((await spendAdmission(kv, TOKEN, NOW)).ok).toBe(true);
    expect(kv.entries.get(usesKey(TOKEN))).toBe('2');
  });

  it('counts nothing when it refuses', async () => {
    const kv = fakeKv({ [TOKEN]: record({ revoked: true }) });

    expect(await spendAdmission(kv, TOKEN, NOW))
      .toEqual({ ok: false, why: 'revoked' });
    expect(kv.writes).toEqual([]);
  });

  it('starts a counter from an old record and leaves that record alone', async () => {
    const kv = fakeKv({ [TOKEN]: record({ uses_max: 5, uses_count: 3 }) });

    const outcome = await spendAdmission(kv, TOKEN, NOW);

    expect(outcome.ok && outcome.spent).toBe(4);
    expect(kv.entries.get(usesKey(TOKEN))).toBe('4');
    // The record still says three and always will. The counter has taken over.
    expect(JSON.parse(kv.entries.get(TOKEN) ?? '{}')).toMatchObject({
      uses_count: 3,
    });
  });

  /* -- the defect this block is the standing gate for --------------------- */

  /**
   * Found in production on the first day, and driven here in the order that
   * broke it: a link was minted, used, revoked by the CLI, and then hit again -
   * and the record came back saying `revoked: false`, because the admission
   * had read that record BEFORE the revoke landed and wrote its stale copy
   * back afterwards. A browser holding a pass from that link carried on
   * getting 200s, because the field that was meant to have stopped it had been
   * undone by the very traffic it was meant to be stopping.
   *
   * `afterGet` lands the revoke in exactly that window: after the door has read
   * the record and before it writes anything.
   *
   * It fails if the fix is reverted. Putting the old write back - a
   * `kv.put(token, ...)` carrying the count - restores the stale record, and
   * both assertions below catch it.
   */
  it('cannot un-revoke a token whose record it read a moment too early', async () => {
    const kv = fakeKv({
      [TOKEN]: record({ uses_max: 5 }),
      [usesKey(TOKEN)]: '1',
    });

    kv.afterGet = (key) => {
      if (key !== TOKEN) {
        return;
      }

      // The owner runs `tokens.mjs revoke` in the window between the door's
      // read and the door's write. It happens once: a CLI is not a loop.
      kv.afterGet = null;
      kv.entries.set(TOKEN, record({ uses_max: 5, revoked: true }));
    };

    await spendAdmission(kv, TOKEN, NOW);

    expect(parseTokenPolicy(kv.entries.get(TOKEN) ?? null)?.revoked).toBe(true);
    // And the next request off the same link is refused, which is the outcome
    // the flag exists for rather than the field it happens to be stored in.
    expect(await spendAdmission(kv, TOKEN, NOW))
      .toEqual({ ok: false, why: 'revoked' });
  });

  /**
   * And the standing gate for the whole CLASS rather than for the one field.
   *
   * The door must never write the token key: not in any outcome, not for any
   * reason. A later change that put a "last seen" stamp or a cached label back
   * on the record would reintroduce exactly this defect in a shape nobody
   * would recognise as this defect. This fails the moment it is written at all.
   */
  it('never writes the record the owner owns', async () => {
    const cases: Readonly<Record<string, string>> = {
      live: record({ uses_max: 5 }),
      shared: record(),
      revoked: record({ revoked: true }),
      expired: record({ expires_at: NOW - 1 }),
      spent: record({ uses_max: 1, uses_count: 1 }),
      unreadable: '{',
    };

    for (const [name, stored] of Object.entries(cases)) {
      const kv = fakeKv({ [TOKEN]: stored });
      await spendAdmission(kv, TOKEN, NOW);

      expect(kv.writes.filter((key) => key === TOKEN), name).toEqual([]);
      expect(kv.entries.get(TOKEN), name).toBe(stored);
    }

    // Including a token nobody minted, where there is no record to protect and
    // therefore nothing that should bring one into existence.
    const empty = fakeKv();
    await spendAdmission(empty, TOKEN, NOW);
    expect(empty.writes).toEqual([]);
  });
});
