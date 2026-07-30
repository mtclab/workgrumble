import { expect, test } from '@playwright/test';

import {
  dragBy,
  logIn,
  openFromDesktopIcon,
  openFromStartMenu,
} from './helpers';

/**
 * Journey 5: drive every user-reachable surface once and assert the run stays
 * clean - no console errors, no page errors, and not one request that leaves
 * the origin serving the build.
 */
test('completes a full session with no console errors and no off-origin requests', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? 'http://localhost').origin;
  const consoleErrors: string[] = [];
  const offOrigin: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(`pageerror: ${error.message}`);
  });
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== origin) {
      offOrigin.push(request.url());
    }
  });

  await logIn(page);

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
  expect(offOrigin).toEqual([]);
});
