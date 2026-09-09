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
 * counted from 10:15 rather than from 08:00 twice over: the ticket drips in
 * mid-morning on the Monday, and the clock it is held to only counts minutes
 * somebody is at the desk. So the deadline is 14:15, and this is the wait from
 * a standing start at eight - which is the whole business-hours rule, seen
 * from the far end.
 */
const FAN_BREACH_MS = 377_000;

/** The minute the fan ticket drips into Monday: `buildDaySchedule` picks it. */
const FAN_ARRIVAL = 135;

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
 * The simulation stops for the login screen, and this is the assertion that
 * says so.
 *
 * It used to be the opposite: the interval started at boot, tick zero is 08:00
 * and one simulated minute costs one real second, so a player who took a
 * minute over the password walked into a shift that had begun without them and
 * nine minutes near the boot sequence was the whole day - tickets breaching
 * before anybody had seen a desktop, read the brief, or been handed the pause
 * button, which lives on the desktop.
 */
test('freezes the day while nobody is logged on', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');

  await page.keyboard.press('Space');
  await expect(page.getByTestId('login-screen')).toBeVisible();

  // Four hours of real time on the login screen. Nothing is owed to it.
  await page.clock.runFor(FAN_BREACH_MS);
  await expect(page.getByTestId('desktop')).toHaveCount(0);

  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('desktop')).toBeVisible();

  // Eight o'clock, on the morning brief, with everything still to do. The
  // MINUTE is a band rather than a pin, and only because logging on is what
  // starts the clock: four hours nobody was owed would read 12:10, and the
  // eight o'clock hour is the whole of what this is claiming.
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^08:0\d$/);
  await expect(page.getByTestId('toast').filter({ hasText: 'SLA breached' }))
    .toHaveCount(0);
  await expect(page.getByTestId('notification-badge')).toHaveAttribute(
    'data-unread',
    '0',
  );

  // And logging off does not restart it either - the desk is still empty.
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-log-off').click();
  await expect(page.getByTestId('login-screen')).toBeVisible();
  await page.clock.runFor(FAN_BREACH_MS);
  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^08:0\d$/);
});

/**
 * The property the test above replaced: a notification raised while there is
 * no desktop to raise it on has to survive until there is one.
 *
 * It is raised at BOOT now rather than by a shift running behind the login
 * screen, because a shift running behind the login screen is the bug. A
 * browser that will not keep anything is found out by the storage probe before
 * the shell has started, and that is a sentence the player has to be given -
 * so it queues, and the first desktop is where it lands.
 */
test('delivers a notice raised before any desktop existed', async ({ page }) => {
  // A window with storage blocked, which is a real configuration and not a
  // simulation of one: this is what the page sees.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('SecurityError');
      },
    });
  });
  await page.goto('/');

  await page.keyboard.press('Space');
  await expect(page.getByTestId('login-screen')).toBeVisible();
  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('desktop')).toBeVisible();

  // The toast is waiting on the desk, the badge counted it, and the history
  // kept it - the whole queue-and-flush path, on the shipped artifact.
  const toasts = page.getByTestId('toast');
  await expect(toasts.filter({ hasText: 'Nothing is being saved' }))
    .toBeVisible();
  await expect(page.getByTestId('notification-badge')).not.toHaveAttribute(
    'data-unread',
    '0',
  );
  await page.getByTestId('notification-tray').click();
  await expect(page.getByTestId('notification-panel'))
    .toContainText('Nothing is being saved');
  await page.keyboard.press('Escape');

  // And the durability chip is up, because "nothing is being kept" is a state
  // rather than an event and a toast scrolls away.
  await expect(page.getByTestId('save-health')).toBeVisible();
  await expect(page.getByTestId('save-health')).toHaveAttribute(
    'title',
    /storage is blocked, full, or switched off/,
  );
});

/**
 * A breach still announces itself; it just has to happen while somebody is at
 * the desk, which is the only time it can happen now.
 */
test('announces a breach that happens while the player is working', async ({
  page,
}) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();

  // Four hours of shift, worked by nobody.
  await page.clock.runFor(FAN_BREACH_MS);

  // Toasts expire on ticks and this run keeps going after the deadline, so
  // the durable half is what proves the announcement: the badge counted it
  // and the centre still holds it.
  await expect(page.getByTestId('notification-badge')).not.toHaveAttribute(
    'data-unread',
    '0',
  );
  await page.getByTestId('notification-tray').click();
  await expect(
    page.getByTestId('notification-panel-item')
      .filter({ hasText: 'SLA breached' })
      .first(),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByTestId('notification-tray').click();
  const panel = page.getByTestId('notification-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('SLA breached');

  // Doing the work late does not un-breach the ticket. The queue keeps the
  // marker, the detail keeps it, and the day's tally keeps counting it -
  // otherwise closing everything quietly erases the score.
  await page.keyboard.press('Escape');
  await openFromStartMenu(page, 'tickets');
  const row = page.getByTestId('ticket-row-fan-noise');
  await expect(row).toHaveAttribute('data-state', 'breached');

  // The queue redraws its countdowns while the clock moves; hold the day
  // still so the row is a stable click target under fake-timer speeds.
  await page.getByTestId('day-pause').click();
  await row.click();

  // And let it go again before doing anything (W-10, 0.42.0): a stopped clock
  // stops the work as well as the minutes now, so a reboot pressed here would
  // be refused and the touch log this journey needs would stay empty. Reading
  // the row was what the pause was for.
  await page.getByTestId('day-pause').click();

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
