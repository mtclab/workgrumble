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

/**
 * The on-screen panic button is the key's twin for a player with no keyboard -
 * the whole point of 0.5.1. It has to reach the same OUTCOME the key does: the
 * slack window gone, the work window untouched, the evidence recoverable. It
 * fires the same panic() the key does, so this proves the shared method on the
 * shipped artifact, not merely that a click handler ran.
 */
test('the on-screen panic button hides slack windows like the key', async ({
  page,
}) => {
  await logIn(page);

  await openFromDesktopIcon(page, 'about');
  await openFromStartMenu(page, 'bubbles');

  const about = page.getByTestId('window-about');
  const bubbles = page.getByTestId('window-bubbles');

  await expect(bubbles).toBeVisible();
  await expect(bubbles).toHaveAttribute('data-focused', 'true');

  // No keyboard: a tap does what Backquote does.
  await page.getByTestId('boss-panic').click();

  await expect(bubbles).toBeHidden();
  await expect(about).toBeVisible();
  await expect(about).toHaveAttribute('data-minimized', 'false');
  await expect(about).toHaveAttribute('data-focused', 'true');

  const bubblesButton = page.getByTestId('taskbar-button-bubbles');
  await expect(bubblesButton).toBeVisible();
  await expect(bubblesButton).toHaveAttribute('data-minimized', 'true');

  // The evidence is recoverable once the coast is clear, same as after the key.
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

/**
 * The panic key has no exceptions. Typing into an app field is exactly when a
 * player is most visibly not working, so that is the worst moment for the key
 * to stop responding.
 */
test('boss key fires while the player is typing in an app field', async ({
  page,
}) => {
  await logIn(page);

  await openFromDesktopIcon(page, 'about');
  await openFromStartMenu(page, 'bubbles');

  const initials = page.getByTestId('bubbles-initials');
  await initials.click();
  await initials.fill('PAT');
  await expect(initials).toBeFocused();

  await page.keyboard.press('Backquote');

  await expect(page.getByTestId('window-bubbles')).toBeHidden();
  await expect(page.getByTestId('window-about')).toBeVisible();
  await expect(page.getByTestId('window-about')).toHaveAttribute(
    'data-focused',
    'true',
  );

  // The keypress is swallowed, not typed: no stray backtick in the field.
  await page.getByTestId('taskbar-button-bubbles').click();
  await expect(page.getByTestId('bubbles-initials')).toHaveValue('PAT');
});

test('boss key hides a maximized slack window', async ({ page }) => {
  await logIn(page);

  await openFromDesktopIcon(page, 'about');
  await openFromStartMenu(page, 'bubbles');

  const bubbles = page.getByTestId('window-bubbles');
  await page.getByTestId('titlebar-bubbles').dblclick({
    position: { x: 40, y: 10 },
  });
  await expect(bubbles).toHaveAttribute('data-maximized', 'true');

  await page.keyboard.press('Backquote');

  await expect(bubbles).toBeHidden();
  await expect(page.getByTestId('window-about')).toBeVisible();

  // It comes back exactly as it was hidden - still maximized, still yours.
  await page.getByTestId('taskbar-button-bubbles').click();
  await expect(bubbles).toBeVisible();
  await expect(bubbles).toHaveAttribute('data-maximized', 'true');
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
