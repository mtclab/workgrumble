import { expect, test } from '@playwright/test';

import {
  boxOf,
  dragBy,
  logIn,
  openFromDesktopIcon,
  openFromStartMenu,
  zIndexOf,
} from './helpers';

/**
 * Journey 2: both launch routes, then the window-manager contract - focus,
 * z-order, drag, resize, minimize and restore through the taskbar.
 */
test('opens, stacks, drags, resizes and restores application windows', async ({
  page,
}) => {
  await logIn(page);

  await openFromDesktopIcon(page, 'bubbles');
  await openFromStartMenu(page, 'about');

  const about = page.getByTestId('window-about');
  const bubbles = page.getByTestId('window-bubbles');

  // Focus follows open: the newest window is on top.
  await expect(about).toHaveAttribute('data-focused', 'true');
  await expect(bubbles).toHaveAttribute('data-focused', 'false');
  expect(await zIndexOf(page, 'about')).toBeGreaterThan(
    await zIndexOf(page, 'bubbles'),
  );

  // Focus follows click: raising the background window flips the order. The
  // click lands on the sliver of the bubbles titlebar the cascade leaves
  // uncovered, which is exactly how a player would raise it.
  await page.getByTestId('titlebar-bubbles').click({
    position: { x: 40, y: 8 },
  });
  await expect(bubbles).toHaveAttribute('data-focused', 'true');
  await expect(about).toHaveAttribute('data-focused', 'false');
  expect(await zIndexOf(page, 'bubbles')).toBeGreaterThan(
    await zIndexOf(page, 'about'),
  );

  // Raise About from the taskbar before dragging it: a covered titlebar must
  // not be dragged, or the gesture would move the window on top of it.
  await page.getByTestId('taskbar-button-about').click();
  await expect(about).toHaveAttribute('data-focused', 'true');
  expect(await zIndexOf(page, 'about')).toBeGreaterThan(
    await zIndexOf(page, 'bubbles'),
  );

  // Drag by the titlebar.
  const beforeDrag = await boxOf(about);
  await dragBy(page, page.getByTestId('titlebar-about'), 140, 70);
  const afterDrag = await boxOf(about);

  expect(afterDrag.x - beforeDrag.x).toBeGreaterThan(100);
  expect(afterDrag.y - beforeDrag.y).toBeGreaterThan(50);
  expect(afterDrag.width).toBeCloseTo(beforeDrag.width, 0);
  expect(afterDrag.height).toBeCloseTo(beforeDrag.height, 0);
  await expect(about).toHaveAttribute('data-focused', 'true');

  // Resize from the south-east corner.
  const beforeResize = await boxOf(about);
  await dragBy(page, page.getByTestId('resize-about-se'), -120, -60);
  const afterResize = await boxOf(about);

  expect(afterResize.width).toBeLessThan(beforeResize.width - 80);
  expect(afterResize.height).toBeLessThan(beforeResize.height - 30);
  expect(afterResize.x).toBeCloseTo(beforeResize.x, 0);
  expect(afterResize.y).toBeCloseTo(beforeResize.y, 0);

  // Minimize and restore through the taskbar button.
  const taskbarAbout = page.getByTestId('taskbar-button-about');
  await expect(taskbarAbout).toBeVisible();

  await taskbarAbout.click();
  await expect(about).toBeHidden();
  await expect(taskbarAbout).toBeVisible();
  await expect(taskbarAbout).toHaveAttribute('data-minimized', 'true');

  await taskbarAbout.click();
  await expect(about).toBeVisible();
  await expect(about).toHaveAttribute('data-focused', 'true');
  await expect(taskbarAbout).toHaveAttribute('data-minimized', 'false');

  // Clicking the taskbar button of the focused window minimizes it again.
  await taskbarAbout.click();
  await expect(about).toBeHidden();
  await taskbarAbout.click();
  await expect(about).toBeVisible();
});

test('offers both launch routes for both apps and closes cleanly', async ({
  page,
}) => {
  await logIn(page);

  await openFromDesktopIcon(page, 'about');
  await page.getByTestId('close-about').click();
  await expect(page.getByTestId('window-about')).toHaveCount(0);
  await expect(page.getByTestId('taskbar-button-about')).toHaveCount(0);

  await openFromStartMenu(page, 'bubbles');
  await page.getByTestId('close-bubbles').click();
  await expect(page.getByTestId('window-bubbles')).toHaveCount(0);

  // Both apps are reachable again after being closed - no dead end.
  await openFromStartMenu(page, 'about');
  await expect(page.getByTestId('about-app')).toBeVisible();
  await openFromDesktopIcon(page, 'bubbles');
  await expect(page.getByTestId('bubbles-app')).toBeVisible();
});

test('closes the start menu with Escape and with an outside click', async ({
  page,
}) => {
  await logIn(page);

  const menu = page.getByTestId('start-menu');

  await page.getByTestId('start-button').click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await page.getByTestId('start-button').click();
  await expect(menu).toBeVisible();
  await page.getByTestId('desktop-surface').click({
    position: { x: 600, y: 400 },
  });
  await expect(menu).toBeHidden();
});
