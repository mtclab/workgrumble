/**
 * The badge number: what an account is at Workgrumble Ltd.
 *
 * `WG-1234-AB`. Four digits and two letters, which is a hair over six and a
 * half million badges - plenty for a tester build, and short enough that
 * somebody can genuinely write it on the back of their hand, which is the
 * whole design. There is no email, no name and no password behind it: the
 * badge IS the credential, exactly like the plastic rectangle it is named
 * after, and losing it loses the save. That is said once, plainly, at the
 * moment it is issued.
 *
 * This module is shared by the game and the Worker on purpose. A format that
 * is written down twice is a format that disagrees with itself the first time
 * somebody widens it, and "the server would not take a badge the client was
 * happy to print" is not a bug a tester can do anything about.
 *
 * It is pure: no DOM, no bindings, no randomness. The bytes come from the
 * caller, which is what makes minting a thing a test can drive.
 */

export const BADGE_PATTERN = /^WG-\d{4}-[A-Z]{2}$/;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** How many random bytes one minting attempt consumes. */
export const BADGE_BYTES = 4;

export function isBadge(value: string): boolean {
  return BADGE_PATTERN.test(value);
}

/**
 * What somebody typed, as a badge, or null.
 *
 * Generous about the things a human does to a code they are copying off the
 * back of their hand - lower case, stray spaces, the dashes left out - and
 * completely ungenerous about anything else. It is a normalizer, not a
 * guesser: `WG-12-AB` is not a badge with a typo in it, it is not a badge.
 */
export function normalizeBadge(value: string): string | null {
  const stripped = value.replaceAll(/[\s-]/g, '').toUpperCase();

  if (!/^WG\d{4}[A-Z]{2}$/.test(stripped)) {
    return null;
  }

  return `WG-${stripped.slice(2, 6)}-${stripped.slice(6, 8)}`;
}

/**
 * One minting attempt, from four bytes, or null when the draw is rejected.
 *
 * Rejection sampling rather than a modulo, and it matters more than it looks:
 * `n % 10000` over sixteen bits makes the first 5,536 badge numbers turn up
 * half again as often as the rest, which is a bias an attacker guessing at
 * badges gets to keep. Sixteen bits below 60,000 and a byte below 234 are both
 * exact multiples of the range, so every badge is equally likely and roughly
 * one draw in twelve is thrown away.
 *
 * The caller loops. It is written this way so the loop is somebody else's and
 * this function is a pure map from bytes to a badge, which a test can pin
 * down completely.
 */
export function badgeFromBytes(bytes: Uint8Array): string | null {
  if (bytes.length < BADGE_BYTES) {
    return null;
  }

  const high = bytes[0] ?? 0;
  const low = bytes[1] ?? 0;
  const first = bytes[2] ?? 0;
  const second = bytes[3] ?? 0;
  const number = (high << 8) | low;

  if (number >= 60_000 || first >= 234 || second >= 234) {
    return null;
  }

  const digits = String(number % 10_000).padStart(4, '0');
  const letters = `${LETTERS[first % 26] ?? 'A'}${LETTERS[second % 26] ?? 'A'}`;

  return `WG-${digits}-${letters}`;
}
