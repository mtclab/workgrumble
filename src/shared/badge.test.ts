import { describe, expect, it } from 'vitest';

import {
  BADGE_BYTES,
  badgeFromBytes,
  isBadge,
  normalizeBadge,
} from './badge';

describe('what a badge is', () => {
  it('is four digits and two letters, and nothing else', () => {
    expect(isBadge('WG-1234-AB')).toBe(true);
    expect(isBadge('WG-0000-AA')).toBe(true);

    expect(isBadge('wg-1234-ab')).toBe(false);
    expect(isBadge('WG-123-AB')).toBe(false);
    expect(isBadge('WG-12345-AB')).toBe(false);
    expect(isBadge('WG-1234-A1')).toBe(false);
    expect(isBadge('WG-1234-ABC')).toBe(false);
    expect(isBadge('1234-AB')).toBe(false);
    expect(isBadge('')).toBe(false);
  });
});

describe('what somebody typed', () => {
  /**
   * A badge is copied off the back of a hand, so the forgiving half is
   * deliberate: case, spaces and missing dashes are how humans transcribe a
   * code, not how they get one wrong.
   */
  it('forgives the things people do when copying a code', () => {
    expect(normalizeBadge('wg-1234-ab')).toBe('WG-1234-AB');
    expect(normalizeBadge('  WG-1234-AB  ')).toBe('WG-1234-AB');
    expect(normalizeBadge('WG1234AB')).toBe('WG-1234-AB');
    expect(normalizeBadge('wg 1234 ab')).toBe('WG-1234-AB');
  });

  /**
   * And the ungenerous half, which matters more. `WG-12-AB` is not a badge
   * with a typo in it that could be padded out - it is somebody else's badge
   * if this function guesses, and a normalizer that guesses is a login that
   * lets one person into another person's week.
   */
  it('does not invent the parts that are missing', () => {
    expect(normalizeBadge('WG-12-AB')).toBeNull();
    expect(normalizeBadge('WG-12345-AB')).toBeNull();
    expect(normalizeBadge('WG-1234-A')).toBeNull();
    expect(normalizeBadge('XX-1234-AB')).toBeNull();
    expect(normalizeBadge('WG-1234-A1')).toBeNull();
    expect(normalizeBadge('')).toBeNull();
  });
});

describe('minting one', () => {
  it('turns four bytes into a badge, the same way every time', () => {
    const badge = badgeFromBytes(Uint8Array.from([0x01, 0x02, 0x00, 0x19]));

    expect(badge).toBe('WG-0258-AZ');
    expect(badge !== null && isBadge(badge)).toBe(true);
  });

  it('needs its four bytes', () => {
    expect(badgeFromBytes(Uint8Array.from([1, 2, 3]))).toBeNull();
    expect(badgeFromBytes(new Uint8Array(BADGE_BYTES))).toBe('WG-0000-AA');
  });

  /**
   * The draws that are thrown away, and why there are any.
   *
   * `n % 10000` over sixteen bits would make badge numbers under 5,536 turn up
   * half again as often as the rest - a bias that is invisible in play and
   * permanent for anybody guessing at badges. Rejecting the top of the range
   * costs about one draw in twelve and makes every badge equally likely.
   */
  it('rejects the draws that would bias the numbers', () => {
    expect(badgeFromBytes(Uint8Array.from([0xea, 0x60, 0, 0]))).toBeNull();
    expect(badgeFromBytes(Uint8Array.from([0xea, 0x5f, 0, 0]))).not.toBeNull();
    expect(badgeFromBytes(Uint8Array.from([0, 0, 234, 0]))).toBeNull();
    expect(badgeFromBytes(Uint8Array.from([0, 0, 233, 0]))).not.toBeNull();
    expect(badgeFromBytes(Uint8Array.from([0, 0, 0, 234]))).toBeNull();
  });

  it('spreads the accepted draws evenly across every badge number', () => {
    const counts = new Map<string, number>();

    // Every accepted sixteen-bit draw, once. If the modulo were biased, some
    // digit strings would be reached by six draws and others by five.
    for (let value = 0; value < 60_000; value += 1) {
      const badge = badgeFromBytes(
        Uint8Array.from([value >> 8, value & 0xff, 0, 0]),
      );

      if (badge === null) {
        continue;
      }

      const digits = badge.slice(3, 7);
      counts.set(digits, (counts.get(digits) ?? 0) + 1);
    }

    expect(counts.size).toBe(10_000);
    expect([...new Set(counts.values())]).toEqual([6]);
  });
});
