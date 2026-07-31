import { expect, test } from '@playwright/test';

import {
  completeLogin,
  dragBy,
  focusWindow,
  openFromDesktopIcon,
  openFromStartMenu,
} from './helpers';

/**
 * Journey 5: drive every user-reachable surface once and assert the run stays
 * clean - no console errors, no page errors, and no network at all.
 *
 * The gate is deliberately blunt. Loading the build is the ONLY moment this
 * product is allowed to touch the network, so those requests become the
 * allowlist and everything after them is a failure - including a same-origin
 * `fetch('/telemetry')`, which an off-origin check would have waved through.
 */
test('completes a full session with no console errors and no runtime requests', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? 'http://localhost').origin;
  const consoleErrors: string[] = [];
  const staticAssets: string[] = [];
  const runtimeRequests: string[] = [];
  let loaded = false;

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(`pageerror: ${error.message}`);
  });
  page.on('request', (request) => {
    if (loaded) {
      runtimeRequests.push(`${request.method()} ${request.url()}`);
      return;
    }

    staticAssets.push(request.url());
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  loaded = true;

  await completeLogin(page);

  // Windows: open, stack, drag, maximize, restore, minimize, close.
  await openFromDesktopIcon(page, 'about');
  await openFromStartMenu(page, 'bubbles');
  await dragBy(page, page.getByTestId('titlebar-bubbles'), 60, 40);
  await page.getByTestId('titlebar-bubbles').dblclick({
    position: { x: 40, y: 10 },
  });
  await expect(page.getByTestId('window-bubbles')).toHaveAttribute(
    'data-maximized',
    'true',
  );
  await page.getByTestId('titlebar-bubbles').dblclick({
    position: { x: 40, y: 10 },
  });
  await expect(page.getByTestId('window-bubbles')).toHaveAttribute(
    'data-maximized',
    'false',
  );

  // Apps: exercise every control both demo apps expose.
  await page.getByTestId('bubble-target').click();
  await expect(page.getByTestId('bubbles-score')).toContainText('01');
  await page.getByTestId('bubbles-reset').click();
  await expect(page.getByTestId('bubbles-score')).toContainText('00');

  await page.getByTestId('taskbar-button-about').click();
  await page.getByTestId('about-run-diagnostics').click();
  await page.getByTestId('about-refresh').click();
  await page.getByTestId('about-open-bubbles').click();
  await expect(page.getByTestId('window-bubbles')).toHaveAttribute(
    'data-focused',
    'true',
  );

  // The other slack app, both of its pages, and the way back to the
  // bookmarks. Nothing here may reach the network, which is the joke.
  await openFromStartMenu(page, 'browser');
  await page.getByTestId('browser-site-forum').click();
  await expect(page.getByTestId('browser-thread')).toContainText('MOWER WONT');
  await page.getByTestId('browser-site-cats').click();
  await expect(page.getByTestId('browser-hits')).toContainText('visitor');
  await page.getByTestId('browser-home-button').click();
  await expect(page.getByTestId('browser-home')).toBeVisible();

  // The desk. Neither item is available before nine, and both say why
  // rather than sitting there dead.
  const canOfSomething = page.getByTestId('desk-drink');
  await expect(canOfSomething).toBeDisabled();
  await expect(canOfSomething).toHaveAttribute('title', /not on shift/);
  const beer = page.getByTestId('desk-beer');
  await expect(beer).toBeDisabled();
  await expect(beer).toHaveAttribute('title', /probation/);
  await expect(page.getByTestId('desk-empties')).toBeHidden();
  await expect(page.getByTestId('desk-tidy')).toBeHidden();

  // The caught scene, opened cold from the start menu: it says nothing has
  // happened rather than inventing a telling-off, and it closes.
  await openFromStartMenu(page, 'caught');
  await expect(page.getByTestId('caught-heading')).toHaveText('Nothing to report');
  await page.getByTestId('caught-dismiss').click();
  await expect(page.getByTestId('window-caught')).toHaveCount(0);

  // Helpdesk apps: queue, directory and terminal each reach the world once.
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-locked-account').click();
  await expect(page.getByTestId('ticket-detail-title')).toBeVisible();
  // The clock only stops on a user who was actually asked something, so the
  // journey buys the right to park it before parking it.
  await expect(page.getByTestId('ticket-waiting-toggle')).toBeDisabled();
  await page.getByTestId('ticket-open-chat').click();
  await page
    .getByTestId('chat-options')
    .getByRole('button', { name: /when he last logged in/ })
    .click();
  await focusWindow(page, 'tickets');
  await page.getByTestId('ticket-waiting-toggle').click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText(
    'Awaiting the user',
  );
  await page.getByTestId('ticket-waiting-toggle').click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Open');

  await openFromStartMenu(page, 'directory');
  await page.getByTestId('directory-search').fill('gpoole');
  await page.getByTestId('directory-row-gary').click();
  await page.getByTestId('directory-remove-group').click();
  await expect(page.getByTestId('directory-outcome')).toContainText(
    'membership removed',
  );
  await page.getByTestId('directory-reset-password').click();
  await expect(page.getByTestId('directory-outcome')).toContainText(
    'Temporary password',
  );

  // Remote Assist: connect, read the remote screen, drive a control on it.
  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-print').click();
  await expect(page.getByTestId('remote-hostname')).toHaveText('PRINT-01');
  await expect(page.getByTestId('remote-viewport')).toHaveAttribute(
    'data-rotation',
    '0',
  );
  await page.getByTestId('remote-rotation-picker').selectOption('180');
  await page.getByTestId('remote-apply-rotation').click();
  await expect(page.getByTestId('remote-viewport')).toHaveAttribute(
    'data-rotation',
    '180',
  );
  // Upside down on screen, not merely upside down in a field.
  await expect(page.getByTestId('remote-viewport')).toHaveCSS(
    'transform',
    'matrix(-1, 0, 0, -1, 0, 0)',
  );
  await page.getByTestId('remote-clear-printer').click();
  await expect(page.getByTestId('remote-queue-printer')).toHaveText(
    '0 job(s) queued',
  );
  await page.getByTestId('remote-reboot').click();
  await expect(page.getByTestId('remote-outcome')).toContainText('Rebooted');

  // Chat: a thread with no effects behind it, run to its end and restarted.
  await openFromStartMenu(page, 'chat');
  await page.getByTestId('chat-person-bev').click();
  const chatOptions = page.getByTestId('chat-options');
  await chatOptions.getByRole('button', { name: /visitor biscuits/ }).click();
  await expect(page.getByTestId('chat-transcript')).toContainText('fixture');
  await chatOptions.getByRole('button', { name: /Go back to the top/ }).click();
  await chatOptions.getByRole('button', { name: /only passing through/ })
    .click();
  await page.getByTestId('chat-restart').click();
  await expect(chatOptions.getByRole('button', { name: /biscuits/ }))
    .toBeVisible();

  // Mail: open a thread, which is the only interaction it has.
  await openFromStartMenu(page, 'mail');
  await page.getByTestId('mail-row-onboarding').click();
  await expect(page.getByTestId('mail-subject')).toContainText('Workgrumble');

  // KB: read an article and follow a link out of it.
  await openFromStartMenu(page, 'kb');
  await page.getByTestId('kb-row-account-lockout').click();
  await expect(page.getByTestId('kb-reference')).toHaveText(
    'kb/account-lockout',
  );
  await page.getByTestId('kb-see-also-reading-the-error').click();
  await expect(page.getByTestId('kb-reference')).toHaveText(
    'kb/reading-the-error',
  );

  await openFromStartMenu(page, 'cmd');
  const terminal = page.getByTestId('cmd-input');
  await terminal.fill('help');
  await terminal.press('Enter');
  await expect(page.getByTestId('cmd-output')).toContainText('clearqueue');
  await terminal.fill('ping SALES-02');
  await terminal.press('Enter');
  await expect(page.getByTestId('cmd-output')).toContainText('Reply from');
  await terminal.fill('cls');
  await terminal.press('Enter');
  await expect(page.getByTestId('cmd-output')).not.toContainText('Reply from');

  // Boss key, then recover from the taskbar.
  await page.keyboard.press('~');
  await expect(page.getByTestId('window-bubbles')).toBeHidden();
  await page.getByTestId('taskbar-button-bubbles').click();
  await expect(page.getByTestId('window-bubbles')).toBeVisible();

  // Notification centre.
  await page.getByTestId('notification-tray').click();
  await expect(page.getByTestId('notification-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('notification-panel')).toBeHidden();

  // Session: log off and back on, then restart, all without a reload.
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-log-off').click();
  await expect(page.getByTestId('login-screen')).toBeVisible();
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('desktop')).toBeVisible();
  await expect(page.getByTestId('taskbar-button-about')).toHaveCount(0);

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-restart').click();
  await expect(page.getByTestId('boot-screen')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('login-screen')).toBeVisible();
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('desktop')).toBeVisible();

  expect(consoleErrors).toEqual([]);
  // Not one request of any kind after the build finished loading.
  expect(runtimeRequests).toEqual([]);
  // And the load itself only ever pulled static assets from its own origin.
  expect(
    staticAssets.filter((url) => new URL(url).origin !== origin),
  ).toEqual([]);
  expect(staticAssets.length).toBeGreaterThan(0);
});
