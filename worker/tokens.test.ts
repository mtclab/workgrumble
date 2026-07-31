import { describe, expect, it } from 'vitest';

import { admit, isTokenShape, parseTokenRecord } from './tokens';

/**
 * The door's own arithmetic.
 *
 * Four of the five outcomes here are refusals, and the only one anybody
 * exercises by hand is the fifth. A revoked token that still has uses left and
 * has not expired is exactly the link somebody who was thrown out will try
 * again, and it is the case an `if` chain in the wrong order lets through.
 */

const NOW = 1_700_000_000_000;
const TOKEN = 'abcdefgh12345678';

function record(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    label: 'Ada',
    uses_max: null,
    uses_count: 0,
    expires_at: null,
    revoked: false,
    ...over,
  });
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
});

describe('token records', () => {
  it('reads the record the CLI writes', () => {
    expect(parseTokenRecord(record({ uses_max: 3, uses_count: 1 }))).toEqual({
      label: 'Ada',
      uses_max: 3,
      uses_count: 1,
      expires_at: null,
      revoked: false,
    });
  });

  it('refuses anything that is not one', () => {
    expect(parseTokenRecord(null)).toBeNull();
    expect(parseTokenRecord('not json')).toBeNull();
    expect(parseTokenRecord('[]')).toBeNull();
    expect(parseTokenRecord(record({ label: 7 }))).toBeNull();
    expect(parseTokenRecord(record({ uses_max: -1 }))).toBeNull();
    expect(parseTokenRecord(record({ uses_max: 1.5 }))).toBeNull();
    expect(parseTokenRecord(record({ expires_at: 'soon' }))).toBeNull();
  });

  /**
   * The one default that must fail shut. A record whose flag was lost, renamed
   * or typo'd is a record nobody can vouch for, and reading a missing
   * `revoked` as `false` is reading "we do not know" as "it is fine".
   */
  it('treats a missing or unreadable revocation flag as revoked', () => {
    expect(parseTokenRecord(record({ revoked: undefined }))?.revoked).toBe(true);
    expect(parseTokenRecord(record({ revoked: 'no' }))?.revoked).toBe(true);
    expect(parseTokenRecord(record({ revoked: 0 }))?.revoked).toBe(true);
    expect(parseTokenRecord(record())?.revoked).toBe(false);
  });
});

describe('admission', () => {
  it('admits a shared link and counts the admission', () => {
    const outcome = admit(TOKEN, record({ uses_count: 4 }), NOW);

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.spent.uses_count).toBe(5);
    expect(outcome.ok && outcome.spent.uses_max).toBeNull();
  });

  it('admits a counted link until the last use, then stops', () => {
    const twice = record({ uses_max: 2 });
    expect(admit(TOKEN, twice, NOW).ok).toBe(true);

    const spent = record({ uses_max: 2, uses_count: 2 });
    expect(admit(TOKEN, spent, NOW)).toEqual({ ok: false, why: 'exhausted' });

    // One use, used once, is spent - not "one more".
    const once = record({ uses_max: 1, uses_count: 1 });
    expect(admit(TOKEN, once, NOW)).toEqual({ ok: false, why: 'exhausted' });
  });

  it('refuses a token that ran out of time, on the minute', () => {
    expect(admit(TOKEN, record({ expires_at: NOW + 1 }), NOW).ok).toBe(true);
    expect(admit(TOKEN, record({ expires_at: NOW }), NOW))
      .toEqual({ ok: false, why: 'expired' });
    expect(admit(TOKEN, record({ expires_at: NOW - 1 }), NOW))
      .toEqual({ ok: false, why: 'expired' });
  });

  /**
   * Revocation beats everything else on the record. This is the assertion
   * that pins the ORDER of the checks: a revoked link with uses left and no
   * expiry passes every other test on the way past.
   */
  it('refuses a revoked token that is otherwise perfectly good', () => {
    expect(admit(TOKEN, record({ revoked: true, uses_max: 100 }), NOW))
      .toEqual({ ok: false, why: 'revoked' });
    expect(admit(TOKEN, record({ revoked: true, expires_at: null }), NOW))
      .toEqual({ ok: false, why: 'revoked' });
  });

  it('refuses a token nobody minted, and one nobody can read', () => {
    expect(admit(TOKEN, null, NOW)).toEqual({ ok: false, why: 'unknown' });
    expect(admit(TOKEN, '{', NOW)).toEqual({ ok: false, why: 'unreadable' });
    expect(admit('/etc/passwd', record(), NOW))
      .toEqual({ ok: false, why: 'malformed' });
  });

  /**
   * The refusals are told apart HERE and nowhere a caller can see. If this
   * list ever reaches a response body, the door starts answering "which of
   * these is it", which is the whole of what enumeration needs.
   */
  it('has one shape of refusal, whatever the reason', () => {
    const refusals = [
      admit('short', record(), NOW),
      admit(TOKEN, null, NOW),
      admit(TOKEN, record({ revoked: true }), NOW),
      admit(TOKEN, record({ expires_at: NOW - 1 }), NOW),
      admit(TOKEN, record({ uses_max: 1, uses_count: 1 }), NOW),
    ];

    for (const refusal of refusals) {
      expect(refusal.ok).toBe(false);
      expect(Object.keys(refusal).sort()).toEqual(['ok', 'why']);
    }
  });
});
