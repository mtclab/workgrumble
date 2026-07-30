import { expect, test } from '@playwright/test';

import { logIn, openFromDesktopIcon, openFromStartMenu } from './helpers';

/**
 * Real milliseconds the seeded ticket needs to run out its SLA: 240 sim
 * minutes at one minute per real second (`main.ts`, `demo-world.ts`).
 */
const SLA_MS = 240_000;

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
  await page.goto('/');

  await page.keyboard.press('Space');
  await expect(page.getByTestId('login-screen')).toBeVisible();

  // Four hours of shift pass on the login screen; the seeded ticket breaches
  // with nobody logged on.
  await page.clock.runFor(SLA_MS);
  await expect(page.getByTestId('desktop')).toHaveCount(0);

  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('desktop')).toBeVisible();

  // The alarm is waiting on the desk: toast, badge and history all carry it.
  const toasts = page.getByTestId('toast');
  await expect(toasts.filter({ hasText: 'SLA breached' })).toHaveCount(1);
  await expect(page.getByTestId('notification-badge')).toHaveAttribute(
    'data-unread',
    '1',
  );

  await page.getByTestId('notification-tray').click();
  const panel = page.getByTestId('notification-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('SLA breached');
  await expect(page.getByTestId('notification-panel-item')).toHaveCount(1);

  // Doing the work late does not un-breach the ticket. The queue keeps the
  // marker, the detail keeps it, and the day's tally keeps counting it -
  // otherwise closing everything quietly erases the score.
  await page.keyboard.press('Escape');
  await openFromStartMenu(page, 'tickets');
  const row = page.getByTestId('ticket-row-fan-noise');
  await expect(row).toHaveAttribute('data-state', 'breached');
  await expect(page.getByTestId('tickets-summary')).toContainText('1 breached');

  await row.click();
  await page.getByTestId('ticket-escalate').click();
  await expect(row).toHaveAttribute('data-state', 'resolved');
  await expect(row).toHaveAttribute('data-breached', 'true');
  await expect(row).toContainText('Closed (breached)');
  await expect(page.getByTestId('ticket-detail-state')).toContainText(
    'Closed (breached)',
  );
  await expect(page.getByTestId('tickets-summary')).toContainText('1 breached');
});

test('reports engine outcomes and refusals instead of failing silently', async ({
  page,
}) => {
  await logIn(page);
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
