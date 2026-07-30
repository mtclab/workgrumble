import { expect, test } from '@playwright/test';

import { logIn, openFromDesktopIcon, openFromStartMenu } from './helpers';

/**
 * Journey 3: one keypress hides every slack window, leaves work windows alone
 * and leaves the taskbar buttons in place so nothing is lost.
 */
test('boss key minimizes slack windows only', async ({ page }) => {
  await logIn(page);

  await openFromDesktopIcon(page, 'about');
  await openFromStartMenu(page, 'bubbles');

  const about = page.getByTestId('window-about');
  const bubbles = page.getByTestId('window-bubbles');

  await expect(bubbles).toBeVisible();
  await expect(bubbles).toHaveAttribute('data-focused', 'true');

  await page.keyboard.press('Backquote');

  await expect(bubbles).toBeHidden();
  await expect(about).toBeVisible();
  await expect(about).toHaveAttribute('data-minimized', 'false');
  await expect(about).toHaveAttribute('data-focused', 'true');

  const bubblesButton = page.getByTestId('taskbar-button-bubbles');
  await expect(bubblesButton).toBeVisible();
  await expect(bubblesButton).toHaveAttribute('data-minimized', 'true');

  // The evidence is recoverable once the coast is clear.
  await bubblesButton.click();
  await expect(bubbles).toBeVisible();
  await expect(bubbles).toHaveAttribute('data-focused', 'true');
});

test('boss key is inert when no slack window is on screen', async ({
  page,
}) => {
  await logIn(page);
  await openFromDesktopIcon(page, 'about');

  await page.keyboard.press('Backquote');

  await expect(page.getByTestId('window-about')).toBeVisible();
  await expect(page.getByTestId('window-about')).toHaveAttribute(
    'data-focused',
    'true',
  );
});

test('boss key survives being pressed with the start menu open', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'bubbles');
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('start-menu')).toBeVisible();

  await page.keyboard.press('Backquote');

  await expect(page.getByTestId('start-menu')).toBeHidden();
  await expect(page.getByTestId('window-bubbles')).toBeHidden();
});
