import { expect, test } from '@playwright/test';

import {
  beginShift,
  issueBadge,
  logOnWithBadge,
  runSimMinutes,
  worldHash,
} from './helpers';
import { SHARED_TOKEN } from './tokens';
import { OFFICE } from './office';

/**
 * The journey the badge exists for: a week that survives the browser it was
 * played in.
 *
 * This is deliberately driven as TWO BROWSERS rather than as a reload. A
 * reload proves the local save works, which is a thing this suite already
 * proves several times over; what the badge is for is a machine that has never
 * seen this week - a cleared browser, a second computer, a phone in a cafe -
 * and the only way to test that is to be one.
 *
 * The assertion is the graph hash, not "the save endpoint returned 200". The
 * goal a player has is being back in their Wednesday, and a sync that stored a
 * file nobody could open would pass every check short of this one.
 */
test('carries a week to a browser that has never seen it', async ({
  browser,
  page,
}) => {
  await page.clock.install();
  await page.goto(OFFICE);
  await page.keyboard.press('Space');

  const badge = await issueBadge(page);
  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('desktop')).toBeVisible();

  // Half a morning's work, then stop the clock: two browsers cannot be
  // compared while one of them is still living through minutes.
  await beginShift(page);
  await runSimMinutes(page, 90);
  await page.getByTestId('day-pause').click();
  await expect(page.getByTestId('day-state')).toContainText('paused');

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-save').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Game saved' }),
  ).toHaveCount(1);

  const played = await worldHash(page);
  expect(played).not.toBe('');

  // A browser with nothing in it: no save, no badge, and not even a pass until
  // it follows the link.
  const elsewhere = await browser.newContext();
  const other = await elsewhere.newPage();
  await other.clock.install();
  await other.goto(`/t/${SHARED_TOKEN}`);
  // The link lands on Helldesk; the office has its own address.
  await other.goto(OFFICE);
  await other.keyboard.press('Space');

  await logOnWithBadge(other, badge);

  // The badge's copy is later than the nothing this browser had, so it is
  // adopted and loaded - and the player is told, because a session that
  // replaced itself without saying so would be indistinguishable from a bug.
  await expect(
    other.getByTestId('toast').filter({ hasText: 'later week on it' }),
  ).toBeVisible();
  await expect
    .poll(() => worldHash(other), { timeout: 15_000 })
    .toBe(played);

  await elsewhere.close();
});

/**
 * The other direction of the same decision, and the defect the owner found by
 * playing: a badge with nothing filed against it used to start a new week in
 * silence, which from the player's chair is indistinguishable from a save that
 * has gone missing - and the player it happens to is the one who has just typed
 * a badge number in specifically to get their week back.
 *
 * So: a badge is minted, nothing is ever saved against it, and it is carried to
 * a browser that has never seen it. The week starts at Monday morning, it says
 * so out loud, and it starts on THAT BADGE - no second account quietly minted
 * to hold the week nobody could find.
 */
test('starts a stated Monday on a badge with nothing filed against it', async ({
  browser,
  page,
}) => {
  await page.clock.install();
  await page.goto(OFFICE);
  await page.keyboard.press('Space');

  const badge = await issueBadge(page);

  // The account exists from the moment it is minted, and the badge screen says
  // what the building knows about it: three dates and nothing else.
  const record = page.getByTestId('login-badge-account');
  await expect(record).toContainText(badge);
  await expect(record).toContainText('Issued');
  await expect(record).toContainText('Last seen');
  await expect(record).toContainText('Cleared on');
  await expect(record).toContainText('180 days');

  // Nothing is played and nothing is saved: the badge is carried away empty.
  const elsewhere = await browser.newContext();
  const other = await elsewhere.newPage();
  await other.clock.install();
  await other.goto(`/t/${SHARED_TOKEN}`);
  // The link lands on Helldesk; the office has its own address.
  await other.goto(OFFICE);
  await other.keyboard.press('Space');
  await logOnWithBadge(other, badge);

  await expect(
    other.getByTestId('toast').filter({ hasText: 'Nothing is filed' }),
  ).toBeVisible();

  // Monday morning, first day, and the clock has not been anywhere else. A
  // fresh week opens on the morning brief at eight, not on the shift: nobody
  // has clicked Start the shift yet, and the pre-shift clock does run.
  await expect(other.getByTestId('sim-clock-day')).toHaveText('Day 1');
  await expect(other.getByTestId('sim-clock-time')).toHaveText(/^08:/);

  // And it is the SAME badge: the record card is drawn from what the building
  // said this browser is carrying, so a second account minted to hold the
  // fresh week would show a different number here.
  await other.getByTestId('start-button').click();
  await other.getByTestId('start-menu-log-off').click();
  await expect(other.getByTestId('login-screen')).toBeVisible();
  await expect(other.getByTestId('login-badge-account')).toContainText(badge);

  await elsewhere.close();
});

/**
 * And the badge is a credential rather than a formality: one nobody was issued
 * does not get in, and the refusal happens on the log-on screen where it is
 * cheap rather than three days into a week that was never going to sync.
 */
test('refuses a badge number nobody was issued', async ({ page }) => {
  await page.goto(OFFICE);
  await page.keyboard.press('Space');

  await page.getByTestId('login-badge').fill('WG-9999-ZZ');
  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();

  await expect(page.getByTestId('login-badge-refusal'))
    .toContainText('not one this building recognises');
  await expect(page.getByTestId('login-screen')).toBeVisible();
  await expect(page.getByTestId('desktop')).toHaveCount(0);
});

/**
 * The other half of the same rule, and the one that keeps every other journey
 * in this suite working: no badge is not a refusal. The week plays in this
 * browser, which is what it has always done.
 */
test('logs on with no badge at all and plays the week here', async ({
  page,
}) => {
  await page.goto(OFFICE);
  await page.keyboard.press('Space');

  await expect(page.getByTestId('login-badge')).toHaveValue('');
  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();

  await expect(page.getByTestId('desktop')).toBeVisible();
});
