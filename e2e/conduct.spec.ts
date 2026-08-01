import { expect, type Page, test } from '@playwright/test';

import {
  completeLogin,
  openFromStartMenu,
  realMs,
  runToDayEnd,
  runToTelegraph,
} from './helpers';

/**
 * Slice 0.2.6 on the built artifact: being caught costs minutes and a line,
 * and the line only becomes a consequence when somebody has a reason to read
 * it.
 *
 * Everything below is driven the way a player drives it - a window left up, a
 * corridor, a clock, and the windows they read afterwards - because the whole
 * claim of this layer is that a player can SEE it coming, and a claim about
 * what is on a screen has to be tested on the screen.
 */

/** Logs on, starts the shift, and leaves the desktop clear. */
async function startShift(page: Page): Promise<void> {
  // The corridor is walked on a fake clock, and a session has to be booted
  // before anybody can log on to it: `completeLogin` picks up after the
  // navigation rather than doing it.
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });
  await page.getByTestId('brief-start-shift').click();
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^09:/);
  await page.getByTestId('close-brief').click();
  // `runToTelegraph` buys its minutes at four times speed, so the shell has
  // to be running at four times speed for its steps to be minutes.
  await page.getByTestId('day-speed-4').click();
}

/** The minute on the wall, as the taskbar says it, in minutes past midnight. */
async function clockMinute(page: Page): Promise<number> {
  const face = await page.getByTestId('sim-clock-time').textContent() ?? '';
  const [hours, minutes] = face.split(':').map(Number);
  expect(hours).not.toBeNaN();

  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** Runs the clock a minute at a time until the lead is actually in the room. */
async function runUntilCaught(page: Page): Promise<void> {
  const caught = page.getByTestId('window-caught');

  for (let minute = 0; minute < 20 && await caught.count() === 0; minute += 1) {
    await page.clock.runFor(realMs(1, 4));
  }

  await expect(caught).toBeVisible();
}

/**
 * The whole of what a conversation costs, on the screen the player is looking
 * at: minutes off a shift that still ends at five, and a dated line.
 *
 * The minutes are the point. Nobody is docked for being seen on a forum; what
 * being seen costs is ten minutes of being asked how you are getting on, and
 * ten minutes is ten minutes the queue did not stop for - which is the axis
 * the review is decided on.
 */
test('being caught costs minutes and a line, and no points', async ({
  page,
}) => {
  await startShift(page);
  await openFromStartMenu(page, 'browser');
  await expect(page.getByTestId('window-browser')).toBeVisible();

  await runToTelegraph(page);
  const before = await clockMinute(page);
  await runUntilCaught(page);
  const after = await clockMinute(page);

  // The conversation took the shift with it. More than the minute the clock
  // was going to advance anyway, and the assertion is deliberately loose about
  // how much: the exact figure is `CAUGHT_MINUTES` and it is pinned in
  // `scripted-day.test.ts`, by playing the same day twice.
  expect(after - before).toBeGreaterThan(5);

  await expect(page.getByTestId('caught-app'))
    .toHaveAttribute('data-app', 'browser');
  await expect(page.getByTestId('caught-note')).toContainText('minutes');

  // And the line, in the voice a personnel note is written in rather than the
  // voice he used at the desk.
  const line = page.getByTestId('caught-file-line-0');
  await expect(line).toContainText('Screen observed to be non-work-related');
  await expect(line).toContainText('discussion forum');
  await expect(line).toContainText('No further action at this time');
});

/**
 * THE LEGIBILITY CONTRACT, on the artifact.
 *
 * The player can read the record, can see that it exists, and can read what
 * would make somebody look at it - all of it before any of it decides
 * anything. A rule first seen in the sentence that applies it is a rule nobody
 * could have played toward.
 */
test('the file says who would read it, days before anybody does', async ({
  page,
}) => {
  await startShift(page);

  // Opened cold, from the start menu, by somebody who has not been caught at
  // anything. It is the absence of a telling-off rather than a blank window.
  await openFromStartMenu(page, 'caught');
  await expect(page.getByTestId('caught-heading'))
    .toHaveText('Nothing to report');
  await expect(page.getByTestId('caught-file'))
    .toHaveAttribute('data-lines', '0');
  await expect(page.getByTestId('caught-file-summary')).toContainText('Empty');

  // The three reasons, named, with the bar they would produce.
  const criteria = page.getByTestId('caught-criteria');
  await expect(page.getByTestId('caught-criteria-customer'))
    .toContainText('went red');
  await expect(page.getByTestId('caught-criteria-colleague'))
    .toContainText('form');
  await expect(page.getByTestId('caught-criteria-lead'))
    .toContainText('walks down here');
  // Monday morning: the queue has not gone anywhere yet, so nobody is looking
  // and the bar is the published one.
  await expect(criteria).toHaveAttribute('data-triggers', '0');
  await expect(criteria).toHaveAttribute('data-bar', '45');
  await expect(page.getByTestId('caught-criteria-summary'))
    .toContainText('Nobody has a reason');
});

/**
 * And the same thing said on the evening scorecard, which is the screen
 * nobody can avoid: the mark, the bar, and whether anybody has a reason to
 * open the other folder - every day, not for the first time on the Friday.
 */
test('the evening scorecard says what is on file', async ({ page }) => {
  await startShift(page);
  await runToDayEnd(page);

  await expect(page.getByTestId('scorecard-app')).toBeVisible();
  await expect(page.getByTestId('scorecard-file')).toContainText('file');
  await expect(page.getByTestId('scorecard-week')).toContainText('is the pass');
});
