import { expect, test } from '@playwright/test';

import { completeLogin, openFromDesktopIcon } from './helpers';

/** Real milliseconds per simulation minute (`main.ts`). */
const TICK_MS = 1_000;

/** Simulation ticks a toast survives (`notifications.ts`). */
const TOAST_TTL_TICKS = 10;

/**
 * The taskbar clock reads simulation time, and the wiring that feeds it - sim
 * tick to formatter to taskbar - is invisible when it breaks: a frozen clock
 * looks exactly like a clock. Fake timers drive it so the assertion is on the
 * wiring rather than on how fast the machine running the test happens to be.
 */
test('advances the taskbar clock by one sim minute per real second', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page);

  const clock = page.getByTestId('sim-clock-time');
  await expect(clock).toHaveText('08:00');
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 1');

  await page.clock.runFor(TICK_MS);
  await expect(clock).toHaveText('08:01');

  await page.clock.runFor(TICK_MS * 59);
  await expect(clock).toHaveText('09:00');
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 1');
});

/**
 * A toast is an interruption with a deadline: it leaves on its own, and the
 * record it leaves behind is the notification centre's, not the toast's.
 */
test('expires a toast on its TTL while the record survives', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page);
  await openFromDesktopIcon(page, 'about');

  await page.getByTestId('about-run-diagnostics').click();
  const toasts = page.getByTestId('toast');
  await expect(toasts).toHaveCount(1);

  // One tick short of the deadline it is still on screen.
  await page.clock.runFor(TICK_MS * (TOAST_TTL_TICKS - 1));
  await expect(toasts).toHaveCount(1);

  await page.clock.runFor(TICK_MS);
  await expect(toasts).toHaveCount(0);

  // Gone from the screen, still on the books: the badge never read it.
  await expect(page.getByTestId('notification-badge')).toHaveAttribute(
    'data-unread',
    '1',
  );
  await page.getByTestId('notification-tray').click();
  await expect(page.getByTestId('notification-panel')).toContainText(
    'Diagnostics complete',
  );
  await expect(page.getByTestId('notification-panel-item')).toHaveCount(1);
  await expect(page.getByTestId('notification-badge')).toHaveAttribute(
    'data-unread',
    '0',
  );
});
