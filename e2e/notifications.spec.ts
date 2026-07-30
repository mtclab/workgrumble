import { expect, test } from '@playwright/test';

import { logIn, openFromDesktopIcon } from './helpers';

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
