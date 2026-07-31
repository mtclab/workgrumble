import { expect, test } from '@playwright/test';

import {
  isSeeded,
  REFUSED_TOKENS,
  SHARED_TOKEN,
  SPENT_TOKEN,
  UNKNOWN_TOKEN,
} from './tokens';

/**
 * The door, from outside it.
 *
 * Every test here builds its OWN browser context rather than using the shared
 * one, because the shared one has already been let in - the suite's global
 * setup knocks once and hands the pass to everybody. A door test that ran with
 * a pass in its pocket would prove nothing at all.
 *
 * The whole point of the refusals is that they are indistinguishable, so that
 * is what is asserted: not four messages, one message, four times.
 */

const INVITE_ONLY = /invite-only while it is being tested/i;

test.describe('the tester door', () => {
  test('refuses a browser that was never invited', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const response = await page.goto('/');

    expect(response?.status()).toBe(403);
    await expect(page.getByRole('heading')).toHaveText(INVITE_ONLY);
    // And no game arrived behind it: the bundle is on the far side of this.
    await expect(page.getByTestId('boot-splash')).toHaveCount(0);
    await expect(page.getByTestId('boot-screen')).toHaveCount(0);

    await context.close();
  });

  test('lets a browser in through a live link, and keeps it in', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`/t/${SHARED_TOKEN}`);

    // The link redirects to the game, and the game is what arrives.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('boot-screen')).toBeVisible();

    // The pass outlives the navigation that set it: this is the second
    // request, and it is not the redirect.
    await page.goto('/');
    await expect(page.getByTestId('boot-screen')).toBeVisible();

    await context.close();
  });

  /**
   * The four refusals, and the assertion that they are one refusal.
   *
   * Revoked, spent, expired and invented are four different facts about a
   * link, and the difference between them is precisely what somebody guessing
   * at links is trying to learn. So the door says the same sentence with the
   * same status to all four, and this test compares them to each other rather
   * than to a string - a future refusal that grew a helpful detail would fail
   * here without anybody having to have predicted the wording.
   */
  test('refuses every dead link identically', async ({ browser }) => {
    const bodies: string[] = [];
    const statuses: number[] = [];

    for (const token of REFUSED_TOKENS) {
      const context = await browser.newContext();
      const page = await context.newPage();

      const response = await page.goto(`/t/${token}`);
      statuses.push(response?.status() ?? 0);
      bodies.push(await page.content());

      await expect(page.getByRole('heading')).toHaveText(INVITE_ONLY);
      await expect(page.getByTestId('boot-screen')).toHaveCount(0);

      await context.close();
    }

    expect(statuses).toEqual([403, 403, 403, 403]);
    expect(new Set(bodies).size, 'the refusals differ from one another')
      .toBe(1);
  });

  /**
   * The fixtures are what they say they are.
   *
   * A door test walking in through a link nobody seeded would pass for the
   * wrong reason - a 403 is a 403 whether the record says "revoked" or does
   * not exist - so the one link that must EXIST and the one that must NOT are
   * both stated here rather than assumed.
   */
  test('drives seeded links, and one nobody minted', () => {
    expect(isSeeded(SHARED_TOKEN)).toBe(true);
    expect(isSeeded(SPENT_TOKEN)).toBe(true);
    expect(isSeeded(UNKNOWN_TOKEN)).toBe(false);
  });
});
