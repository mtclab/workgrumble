import { expect, test } from '@playwright/test';

import { completeLogin, openFromStartMenu } from './helpers';

/**
 * Real milliseconds one simulated minute costs at x1 (`day-driver.ts`). The
 * driver is asked to convert four times a second and keeps the remainder, so
 * at x4 a quarter-second is exactly one minute.
 */
const TICK_MS = 1_000;
const SHIFT_MINUTES = 8 * 60;

/** Fake real time that buys `minutes` simulated minutes at `speed`. */
function realMs(minutes: number, speed: number): number {
  return (minutes * TICK_MS) / speed;
}

/**
 * The day loop, end to end on the built artifact: the brief that is waiting
 * when you log on, the shift the player starts, the clock they can stop and
 * hurry, and the scorecard that is written at 17:00.
 */
test('walks a day from the morning brief to the scorecard', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });

  // The brief is put up by the day itself, not fetched from a menu.
  const brief = page.getByTestId('window-brief');
  await expect(brief).toBeVisible();
  await expect(page.getByTestId('brief-heading')).toContainText('Day 1');
  await expect(page.getByTestId('brief-mail-subject')).not.toBeEmpty();
  await expect(page.getByTestId('brief-queue-list').getByRole('listitem'))
    .toHaveCount(4);
  await expect(page.getByTestId('day-state')).toHaveText('Morning brief');
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^08:/);

  // Starting the shift skips whatever is left of the morning.
  await page.getByTestId('brief-start-shift').click();
  await expect(page.getByTestId('sim-clock-time')).toHaveText('09:00');
  await expect(page.getByTestId('day-state')).toHaveText('Shift');
  await expect(page.getByTestId('brief-start-shift')).toBeDisabled();

  await page.getByTestId('close-brief').click();
  await expect(brief).toHaveCount(0);

  // Pause stops the conversion of real time; nothing else about the world
  // changes, and the clock does not creep.
  const pause = page.getByTestId('day-pause');
  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('day-state')).toHaveText('Shift · paused');
  await page.clock.runFor(realMs(10, 1));
  await expect(page.getByTestId('sim-clock-time')).toHaveText('09:00');

  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
  await page.clock.runFor(realMs(10, 1));
  await expect(page.getByTestId('sim-clock-time')).toHaveText('09:10');

  // Speed scales real time into ticks and nothing else.
  await page.getByTestId('day-speed-4').click();
  await expect(page.getByTestId('day-speed-4')).toHaveAttribute(
    'data-active',
    'true',
  );
  await page.clock.runFor(realMs(20, 4));
  await expect(page.getByTestId('sim-clock-time')).toHaveText('09:30');

  // Lunch is flagged on the clock strip - lane B hangs the boss's habits on
  // the same window.
  await page.clock.runFor(realMs(150, 4));
  await expect(page.getByTestId('sim-clock-time')).toHaveText('12:00');
  await expect(page.getByTestId('day-state')).toHaveText('Lunch');

  await page.clock.runFor(realMs(30, 4));
  await expect(page.getByTestId('day-state')).toHaveText('Shift');

  // And on to 17:00, where the day ends whether or not the queue is empty.
  await page.clock.runFor(realMs(SHIFT_MINUTES - 210, 4));
  await expect(page.getByTestId('sim-clock-time')).toHaveText('17:00');
  await expect(page.getByTestId('day-state')).toHaveText('Day end');

  const scorecard = page.getByTestId('window-scorecard');
  await expect(scorecard).toBeVisible();
  await expect(page.getByTestId('scorecard-heading')).toContainText(
    'Day 1, clocking off',
  );
  // Four inherited plus the one the lead raised by mentioning it at 11:49.
  await expect(page.getByTestId('scorecard-arrived')).toHaveText('5');
  await expect(page.getByTestId('scorecard-caught')).toContainText('0 ·');
  await expect(page.getByTestId('scorecard-consumables')).toContainText('£0.00');
  await expect(page.getByTestId('scorecard-net')).toContainText('£');
  // The pressure layer's own numbers, measured rather than promised.
  await expect(page.getByTestId('scorecard-stress')).toContainText(' of 100');
  await expect(page.getByTestId('scorecard-suspicion')).toContainText(' of 100');
  await expect(page.getByTestId('scorecard-reputation')).not.toContainText(
    'Not measured',
  );

  // The clock is stopped at the day end: the scorecard waits to be read.
  await page.clock.runFor(realMs(60, 4));
  await expect(page.getByTestId('sim-clock-time')).toHaveText('17:00');

  // Clocking off banks the day and opens tomorrow's brief.
  await page.getByTestId('scorecard-clock-off').click();
  await expect(scorecard).toHaveCount(0);
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 2');
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^08:/);
  await expect(page.getByTestId('window-brief')).toBeVisible();
  await expect(page.getByTestId('brief-heading')).toContainText('Day 2');

  // The boundary wrote its own save on the way through - the cheapest one
  // there is, taken the moment the dispatch log was checkpointed.
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(page.getByTestId('toast')).toContainText('Game loaded');
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 2');
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^08:/);
});

/**
 * A save is only worth anything if a reload puts the player back where they
 * were - the same minute, the same queue, and the same conversation they were
 * halfway through. This drives the whole loop: work, save, reload the PAGE,
 * load, and check the session came back rather than restarted.
 */
test('keeps a mid-day session across a page reload', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page);

  // Start the shift from the taskbar's own way back into the brief.
  await page.getByTestId('day-state').click();
  await expect(page.getByTestId('window-brief')).toBeVisible();
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();

  await page.clock.runFor(realMs(35, 1));
  await expect(page.getByTestId('sim-clock-time')).toHaveText('09:35');

  // Do something the world will remember, and something only the shell will.
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-wedged-spooler').click();
  await expect(page.getByTestId('ticket-detail-title')).toBeVisible();

  await openFromStartMenu(page, 'mail');
  await page.getByTestId('mail-row-queue-nag').click();
  await expect(page.getByTestId('mail-summary')).toContainText('1 unread');

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-save').click();
  await expect(page.getByTestId('toast')).toContainText('Game saved');

  // A reload is a new session: fresh world, 08:00, nothing read.
  await page.reload();
  await completeLogin(page);
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^08:/);

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(page.getByTestId('toast')).toContainText('Game loaded');

  // The same minute, in the same day, in the same state.
  await expect(page.getByTestId('sim-clock-time')).toHaveText('09:35');
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 1');
  await expect(page.getByTestId('day-state')).toHaveText('Shift');

  // The same queue, still open, with the same ticket in it.
  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('ticket-row-wedged-spooler')).toBeVisible();
  await page.getByTestId('ticket-row-wedged-spooler').click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Open');

  // And the shell's own memory: the mail that was read is still read.
  await openFromStartMenu(page, 'mail');
  await expect(page.getByTestId('mail-summary')).toContainText('1 unread');
  await expect(page.getByTestId('mail-row-queue-nag')).toHaveAttribute(
    'data-unread',
    'false',
  );

  // The clock is a live clock afterwards, not a photograph.
  await page.clock.runFor(realMs(5, 1));
  await expect(page.getByTestId('sim-clock-time')).toHaveText('09:40');
});

/** A refused load leaves the running session exactly where it was. */
test('refuses a damaged save without taking the session with it', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page);

  await page.evaluate(() => {
    window.localStorage.setItem(
      'it-career-sim/save',
      JSON.stringify({ schema: 99, engine: '{}' }),
    );
  });

  await page.getByTestId('day-state').click();
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
  await expect(page.getByTestId('sim-clock-time')).toHaveText('09:00');

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(page.getByTestId('toast')).toContainText('Not loaded');
  await expect(page.getByTestId('toast')).toContainText('newer build');

  await expect(page.getByTestId('sim-clock-time')).toHaveText('09:00');
  await expect(page.getByTestId('day-state')).toHaveText('Shift');
});
