import { expect, type Page, test } from '@playwright/test';

import {
  completeLogin,
  openFromStartMenu,
  runCommand,
  runSimMinutes,
  SHIFT_MINUTES,
} from './helpers';

/**
 * The probation week, on the built artifact, both ways it ends.
 *
 * Everything below is played rather than arranged: the review at three on
 * Friday reads a number the week itself moved, so the only honest way to see
 * both endings is to work a week and to not work one. The two journeys are
 * long on purpose - a week is the unit this milestone added, and a week is
 * what has to survive being played.
 */

/** The minute Monday's third ticket drips in. `buildDaySchedule` picks it. */
const FAN_ARRIVAL = 128;
/** Friday, three o'clock, counted from 08:00 like every other tick. */
const REVIEW_MINUTE = 7 * 60;

/** Starts the shift from a morning brief that is on screen. */
async function beginShift(page: Page): Promise<void> {
  await page.getByTestId('brief-start-shift').click();
  // At x4 a few sim-minutes pass between the click and the read.
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^09:/);
  await page.getByTestId('close-brief').click();
}

/** Runs whatever is left of the day out and clocks off into the next one. */
async function clockOffFor(page: Page, day: number): Promise<void> {
  await runSimMinutes(page, SHIFT_MINUTES);
  await expect(page.getByTestId('day-state')).toHaveText('Day end');
  await page.getByTestId('scorecard-clock-off').click();
  await expect(page.getByTestId('sim-clock-day'))
    .toHaveText(`Day ${String(day + 1)}`);
  await expect(page.getByTestId('window-brief')).toBeVisible();
}

/** Every day between here and Friday, worked or not, and clocked off. */
async function walkToFriday(page: Page, from: number): Promise<void> {
  for (let day = from; day < 5; day += 1) {
    await clockOffFor(page, day);
    await beginShift(page);
  }
}

/**
 * The week that goes well: three tickets closed before lunch on the Monday,
 * the rest of the week worked out honestly, a review that keeps you on, the
 * beer that has been locked on the desk since Monday morning, and the week
 * scorecard at the end of it.
 */
test('passes the review, opens the beer and reads the week back', async ({
  page,
}) => {
  await page.clock.install();
  // A week at four times speed leaves the player fumbling by the afternoon,
  // and the sway never settles under strict actionability checks. This is
  // about the week, not the hands - shipped reduced-motion path.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });
  await beginShift(page);

  /* -- Monday, actually worked ------------------------------------------- */

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'unlock gpoole');
  await expect(page.getByTestId('cmd-output')).toContainText('unlocked');
  await runCommand(page, 'rotate SALES-02 0');
  await expect(page.getByTestId('cmd-output')).toContainText('set to 0 degrees');

  // The third one turns up mid-morning, and it is the one about your own desk.
  await runSimMinutes(page, FAN_ARRIVAL - 60 + 2);
  await openFromStartMenu(page, 'about');
  await page.getByTestId('about-reseat-fan').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Ticket resolved' }),
  ).toHaveCount(1);

  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('ticket-row-locked-account'))
    .toHaveAttribute('data-state', 'resolved');
  await expect(page.getByTestId('ticket-row-rotated-screen'))
    .toHaveAttribute('data-state', 'resolved');
  await expect(page.getByTestId('ticket-row-fan-noise'))
    .toHaveAttribute('data-state', 'resolved');

  /* -- and on to Friday --------------------------------------------------- */

  await walkToFriday(page, 1);
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 5');

  /* -- three o'clock ------------------------------------------------------ */

  await runSimMinutes(page, REVIEW_MINUTE - 60);
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^15:/);

  const review = page.getByTestId('window-review');
  await expect(review).toBeVisible();
  await expect(page.getByTestId('review-app'))
    .toHaveAttribute('data-outcome', 'passed');
  await expect(page.getByTestId('review-heading'))
    .toContainText('probation');
  await expect(page.getByTestId('review-line')).toContainText('the week is fine');
  await expect(page.getByTestId('review-note')).toContainText('fridge');
  // Always dismissible, like every scene in this game.
  await page.getByTestId('review-dismiss').click();
  await expect(review).toHaveCount(0);

  /* -- five o'clock, and the fridge --------------------------------------- */

  await runSimMinutes(page, 2 * 60);
  await expect(page.getByTestId('sim-clock-time')).toHaveText('17:00');

  const beer = page.getByTestId('window-beer');
  await expect(beer).toBeVisible();
  await expect(page.getByTestId('beer-app')).toHaveAttribute('data-opened', 'false');
  await expect(page.getByTestId('beer-heading')).toContainText('fridge');

  // The desk agrees: what was locked all week is a button now.
  await expect(page.getByTestId('desk-beer')).toHaveAttribute('data-locked', 'false');

  await page.getByTestId('beer-open').click();
  await expect(page.getByTestId('beer-app')).toHaveAttribute('data-opened', 'true');
  await expect(page.getByTestId('beer-reply')).toContainText('considerably better');
  await expect(page.getByTestId('desk-beer-label')).toHaveText('Empty');
  await page.getByTestId('beer-open').click();
  await expect(beer).toHaveCount(0);

  /* -- the week, added up ------------------------------------------------- */

  await page.getByTestId('scorecard-clock-off').click();

  const weekend = page.getByTestId('window-weekend');
  await expect(weekend).toBeVisible();
  await expect(page.getByTestId('weekend-verdict'))
    .toHaveAttribute('data-outcome', 'passed');
  await expect(page.getByTestId('weekend-verdict-title'))
    .toContainText('passed');
  // Five days, each with its own line, and Monday with the work on it.
  await expect(page.getByTestId('weekend-day-1')).toContainText('4 in, 3 closed');
  await expect(page.getByTestId('weekend-day-5')).toBeVisible();
  await expect(page.getByTestId('weekend-closed')).toHaveText('3');
  await expect(page.getByTestId('weekend-bonus')).toContainText('£');
  await expect(page.getByTestId('weekend-earned')).toContainText('£');
  await expect(page.getByTestId('weekend-farm-total')).toContainText('banked');

  // Week two is not built yet, and the button says so rather than lying.
  const onward = page.getByTestId('weekend-onward');
  await expect(onward).toBeDisabled();
  await expect(onward).toHaveAttribute('title', /not built yet/);

  // And there is no Saturday: the clock stays where the week left it.
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 5');
  await expect(page.getByTestId('sim-clock-time')).toHaveText('17:00');
});

/**
 * And the week that does not: five days of the queue being ignored, a short
 * conversation on the Friday, and the screen that offers the only thing this
 * game will not take off you - the money towards the farm.
 */
test('fires a week nobody worked and starts the next one', async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });
  await beginShift(page);

  await walkToFriday(page, 1);
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 5');

  await runSimMinutes(page, REVIEW_MINUTE - 60);
  await expect(page.getByTestId('window-review')).toBeVisible();
  await expect(page.getByTestId('review-app'))
    .toHaveAttribute('data-outcome', 'fired');
  await expect(page.getByTestId('review-line')).toContainText('not working out');
  // The shift does not end early. There are two hours left on it.
  await expect(page.getByTestId('review-note')).toContainText('two hours');
  await page.getByTestId('review-dismiss').click();

  // The fridge stays shut: the beer was never about the beer.
  await expect(page.getByTestId('desk-beer')).toHaveAttribute('data-locked', 'true');

  await runSimMinutes(page, 2 * 60);
  await expect(page.getByTestId('sim-clock-time')).toHaveText('17:00');
  await expect(page.getByTestId('window-beer')).toHaveCount(0);

  await page.getByTestId('scorecard-clock-off').click();
  await expect(page.getByTestId('window-weekend')).toBeVisible();
  await expect(page.getByTestId('weekend-verdict'))
    .toHaveAttribute('data-outcome', 'fired');
  await expect(page.getByTestId('weekend-verdict-title'))
    .toContainText('not continued');
  await expect(page.getByTestId('weekend-closed')).toHaveText('0');
  await expect(page.getByTestId('weekend-breached')).not.toHaveText('0');

  // What the week was worth, before the week starts again.
  const banked = await page.getByTestId('weekend-farm-total').textContent();
  expect(banked ?? '').toMatch(/£\d/);

  /* -- and again, Monday --------------------------------------------------- */

  const onward = page.getByTestId('weekend-onward');
  await expect(onward).toBeEnabled();
  await expect(onward).toHaveText('Start Monday again');
  await onward.click();

  // The retry rebuilds the world from nothing, which is a new page. Everything
  // the last week did is gone except the two things that survive a firing.
  await completeLogin(page, { brief: 'keep' });
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 1');
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^08:/);
  await expect(page.getByTestId('brief-queue-list').getByRole('listitem'))
    .toHaveCount(2);

  // The fund is exactly what Friday left in it: they take the desk, the queue
  // and the lanyard, and the money towards twelve acres is still yours.
  await openFromStartMenu(page, 'scorecard');
  await expect(page.getByTestId('scorecard-farm-total')).toHaveText(banked ?? '');
  await expect(page.getByTestId('scorecard-reputation')).toContainText('50');
});
