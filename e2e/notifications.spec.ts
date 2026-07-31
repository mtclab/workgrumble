import { expect, test } from '@playwright/test';

import {
  completeLogin,
  focusWindow,
  logIn,
  openFromDesktopIcon,
  openFromStartMenu,
  workUntil,
} from './helpers';

/**
 * Real milliseconds the fan ticket needs to run out its SLA.
 *
 * It is 240 simulated minutes at one minute per real second, and it is now
 * counted from 10:08 rather than from 08:00 twice over: the ticket drips in
 * mid-morning on the Monday, and the clock it is held to only counts minutes
 * somebody is at the desk. So the deadline is 14:08, and this is the wait from
 * a standing start at eight - which is the whole business-hours rule, seen
 * from the far end.
 */
const FAN_BREACH_MS = 370_000;

/** The minute the fan ticket drips into Monday: `buildDaySchedule` picks it. */
const FAN_ARRIVAL = 128;

/**
 * Journey 4: an app raises a notification, the toast shows, the badge counts
 * it, dismissing the toast keeps the record, and the tray clears the badge.
 */
test('raises a toast, counts it on the badge and dismisses it', async ({
  page,
}) => {
  await logIn(page);

  const badge = page.getByTestId('notification-badge');
  await expect(badge).toHaveAttribute('data-unread', '0');
  await expect(page.getByTestId('toast')).toHaveCount(0);

  await openFromDesktopIcon(page, 'about');
  await page.getByTestId('about-run-diagnostics').click();

  const toasts = page.getByTestId('toast');
  await expect(toasts).toHaveCount(1);
  await expect(toasts.first()).toContainText('Diagnostics complete');
  await expect(badge).toHaveAttribute('data-unread', '1');

  // A second notification stacks and increments the badge again.
  await page.getByTestId('about-run-diagnostics').click();
  await expect(toasts).toHaveCount(2);
  await expect(badge).toHaveAttribute('data-unread', '2');

  // Manual dismissal removes the toast but keeps the unread record.
  await page.getByTestId('toast-dismiss').first().click();
  await expect(toasts).toHaveCount(1);
  await expect(badge).toHaveAttribute('data-unread', '2');

  // Reading the tray clears the badge and shows the full history.
  await page.getByTestId('notification-tray').click();
  const panel = page.getByTestId('notification-panel');
  await expect(panel).toBeVisible();
  await expect(badge).toHaveAttribute('data-unread', '0');
  await expect(page.getByTestId('notification-panel-item')).toHaveCount(2);

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

/**
 * The simulation does not stop for the login screen. Anything it announces
 * while there is no desktop to announce it on has to survive until there is
 * one - dropping it loses the only notice the player ever gets.
 */
test('delivers engine notifications raised before the desktop existed', async ({
  page,
}) => {
  // Fake timers: the SLA is four simulated hours, and the test should not be.
  await page.clock.install();
  // By noon the untouched queue has the player fumbling, and the sway
  // animation never settles under strict actionability checks. This test is
  // about notifications, not hands - take the shipped reduced-motion path.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await page.keyboard.press('Space');
  await expect(page.getByTestId('login-screen')).toBeVisible();

  // Four hours of shift pass on the login screen; the seeded ticket breaches
  // with nobody logged on.
  await page.clock.runFor(FAN_BREACH_MS);
  await expect(page.getByTestId('desktop')).toHaveCount(0);

  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('desktop')).toBeVisible();

  // The alarm is waiting on the desk: toast, badge and history all carry it.
  // The shift ran on without anybody logged on, so the lead has been round
  // and raised his usual concern in the meantime - what matters here is that
  // the breach raised at 12:00 survived a login screen, not that it was the
  // only thing that happened.
  // Since M3-13 every untriaged ticket shares the P3 clock, so the two the
  // morning inherited breached together at one o'clock and the one that
  // dripped in at eight minutes past ten breached at eight minutes past two -
  // at least one of them must have made it through the login screen, and the
  // fan ticket is the one this test tracks.
  const toasts = page.getByTestId('toast');
  await expect(
    toasts.filter({ hasText: 'SLA breached' }).first(),
  ).toBeVisible();
  await expect(page.getByTestId('notification-badge')).not.toHaveAttribute(
    'data-unread',
    '0',
  );

  await page.getByTestId('notification-tray').click();
  const panel = page.getByTestId('notification-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('SLA breached');
  await expect(
    page.getByTestId('notification-panel-item')
      .filter({ hasText: 'SLA breached' })
      .first(),
  ).toBeVisible();

  // Doing the work late does not un-breach the ticket. The queue keeps the
  // marker, the detail keeps it, and the day's tally keeps counting it -
  // otherwise closing everything quietly erases the score.
  await page.keyboard.press('Escape');
  await openFromStartMenu(page, 'tickets');
  const row = page.getByTestId('ticket-row-fan-noise');
  await expect(row).toHaveAttribute('data-state', 'breached');
  await expect(page.getByTestId('tickets-summary')).toContainText("3 breached");

  // The queue redraws its countdowns while the clock moves; hold the day
  // still so the row is a stable click target under fake-timer speeds.
  await page.getByTestId('day-pause').click();
  await row.click();

  // Escalating is a form now, and second line will not take a form with
  // nothing in it. What was tried fills itself in from what was actually
  // done, so the journey has to have done something first.
  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-beige-box').click();
  await page.getByTestId('remote-reboot').click();
  await focusWindow(page, 'tickets');

  await page.getByTestId('ticket-escalate').click();
  await expect(page.getByTestId('handoff-tried')).toContainText('Rebooted it');
  await page
    .getByTestId('handoff-reported')
    .fill('It sounds like a hornet in a biscuit tin.');
  await expect(page.getByTestId('handoff-warning')).toBeHidden();
  await page.getByTestId('handoff-send').click();

  await expect(row).toHaveAttribute('data-state', 'resolved');
  await expect(row).toHaveAttribute('data-breached', 'true');
  await expect(row).toContainText('Closed (breached)');
  await expect(page.getByTestId('ticket-detail-state')).toContainText(
    'Closed (breached)',
  );
  await expect(page.getByTestId('tickets-summary')).toContainText("3 breached");
});

test('reports engine outcomes and refusals instead of failing silently', async ({
  page,
}) => {
  // The fan is the ticket you filed about your own desk, and the week drips
  // it in mid-morning rather than handing it over at eight - so the shift has
  // to be under way before there is anything for the fix to close.
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });
  await workUntil(page, FAN_ARRIVAL + 2);
  await openFromDesktopIcon(page, 'about');

  const toasts = page.getByTestId('toast');

  await page.getByTestId('about-reseat-fan').click();
  await expect(toasts.filter({ hasText: 'Fan reseated' })).toHaveCount(1);
  // Fixing the fan satisfies the seeded ticket's assertion, so the engine
  // resolves it and the shell reports that too.
  await expect(toasts.filter({ hasText: 'Ticket resolved' })).toHaveCount(1);

  // The fan runs now, so a second attempt must be refused with a readable
  // reason rather than silently doing nothing.
  await page.getByTestId('about-reseat-fan').click();
  await expect(
    toasts.filter({ hasText: 'Maintenance refused' }),
  ).toHaveCount(1);
  await expect(page.getByTestId('about-value-chassis-fan')).toHaveText(
    'running',
  );
});
