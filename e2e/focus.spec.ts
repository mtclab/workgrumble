import { expect, test } from '@playwright/test';

import {
  activeElement,
  logIn,
  openFromDesktopIcon,
  openFromStartMenu,
} from './helpers';

/**
 * Focus follows what the player can see. Hiding a window or closing a menu
 * while the keyboard cursor is still inside it strands that cursor in an
 * `aria-hidden` subtree: the screen reader reads nothing and Tab restarts from
 * the top of the document.
 */
test('moves focus to the taskbar when the boss key hides a window', async ({
  page,
}) => {
  await logIn(page);

  await openFromDesktopIcon(page, 'about');
  await openFromStartMenu(page, 'bubbles');

  const initials = page.getByTestId('bubbles-initials');
  await initials.click();
  await expect(initials).toBeFocused();

  await page.keyboard.press('Backquote');
  await expect(page.getByTestId('window-bubbles')).toBeHidden();

  const focused = await activeElement(page);
  expect(focused.inAriaHidden).toBe(false);
  expect(focused.testid).toBe('taskbar-button-bubbles');
  await expect(page.getByTestId('taskbar-button-bubbles')).toBeVisible();

  // And the cursor still works: Enter on the taskbar button brings it back.
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('window-bubbles')).toBeVisible();
});

test('moves focus to the taskbar when a window is minimized', async ({
  page,
}) => {
  await logIn(page);
  await openFromDesktopIcon(page, 'bubbles');

  await page.getByTestId('bubbles-initials').click();
  await page.getByTestId('minimize-bubbles').click();
  await expect(page.getByTestId('window-bubbles')).toBeHidden();

  const focused = await activeElement(page);
  expect(focused.inAriaHidden).toBe(false);
  expect(focused.testid).toBe('taskbar-button-bubbles');
});

test('returns focus to the start button when the menu closes', async ({
  page,
}) => {
  await logIn(page);

  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('start-menu')).toBeVisible();
  await page.getByTestId('start-menu-item-about').focus();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('start-menu')).toBeHidden();

  const focused = await activeElement(page);
  expect(focused.inAriaHidden).toBe(false);
  expect(focused.testid).toBe('start-button');
  await expect(page.getByTestId('start-button')).toBeFocused();

  // No dead end: the menu reopens straight from the keyboard.
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('start-menu')).toBeVisible();
});
