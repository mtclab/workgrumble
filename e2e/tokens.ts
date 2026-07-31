/**
 * The tester links the door journeys use, and the one place they are written.
 *
 * `e2e/fixtures/door-tokens.json` is read by BOTH this file and the owner's
 * `scripts/tokens.mjs seed-fixtures`, so the tokens the suite drives and the
 * tokens the box is seeded with cannot drift apart. A journey that walked in
 * through a link nobody seeded would fail on the staging box with a 403 and no
 * clue why.
 *
 * The suite takes no environment input beyond `PLAYWRIGHT_BASE_URL`, which is
 * why these are constants rather than variables: a door test that needs a
 * secret handed to it is a door test that quietly gets skipped.
 */

import { readFileSync } from 'node:fs';

const FIXTURES: Readonly<Record<string, unknown>> = JSON.parse(
  readFileSync(
    new URL('./fixtures/door-tokens.json', import.meta.url),
    'utf8',
  ),
) as Readonly<Record<string, unknown>>;

/** No use limit: the link every other journey is admitted through. */
export const SHARED_TOKEN = 'wg-fixture-shared-0000000000';

/**
 * The three refusals, each already in its final state on the record - so the
 * walk can drive them as often as it likes without changing anything.
 */
export const SPENT_TOKEN = 'wg-fixture-spent-00000000000';
export const REVOKED_TOKEN = 'wg-fixture-revoked-000000000';
export const EXPIRED_TOKEN = 'wg-fixture-expired-000000000';

/** And one nobody ever minted, which must be refused identically. */
export const UNKNOWN_TOKEN = 'wg-fixture-invented-00000000';

export const REFUSED_TOKENS: readonly string[] = [
  SPENT_TOKEN,
  REVOKED_TOKEN,
  EXPIRED_TOKEN,
  UNKNOWN_TOKEN,
];

/**
 * Every token the seeding script writes. Read off the shared file so that a
 * constant above which nobody seeded is a failure here rather than a mystery
 * on the box.
 */
export const SEEDED_TOKENS: readonly string[] = Object.keys(FIXTURES)
  .filter((key) => !key.startsWith('_'));

/**
 * Which of the constants above the box was actually seeded with.
 *
 * `UNKNOWN_TOKEN` is deliberately absent from the file: it is the link nobody
 * minted, and seeding it would make it one.
 */
export function isSeeded(token: string): boolean {
  return SEEDED_TOKENS.includes(token);
}
