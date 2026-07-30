import { test } from '@playwright/test';

import { logIn, openFromDesktopIcon, openFromStartMenu } from './helpers';

// Overseer visual-review captures - not assertions. Screenshots land in
// test-results/visual/ and are eyeballed by a human/model reviewer.
test('captures shell states for visual review', async ({ page }) => {
  await page.goto('/');
  await page.screenshot({ path: 'test-results/visual/01-boot.png' });

  await logIn(page);
  await page.screenshot({ path: 'test-results/visual/02-desktop.png' });

  await openFromStartMenu(page, 'about');
  await openFromDesktopIcon(page, 'bubbles');
  await page.screenshot({ path: 'test-results/visual/03-two-windows.png' });

  await page.getByTestId('start-button').click();
  await page.screenshot({ path: 'test-results/visual/04-start-menu.png' });
  await page.keyboard.press('Escape');

  await page.keyboard.press('Backquote');
  await page.screenshot({ path: 'test-results/visual/05-boss-key.png' });
});
