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

declare global {
  interface Window {
    /** Pointer id of the last pointerdown, captured by the drag journeys. */
    ghostPointerId?: number;
  }
}

/**
 * A drag whose release is lost - the button comes up outside the document, or
 * over something that swallows the event - must not leave the gesture live.
 * The tell is a buttonless move afterwards still dragging the window.
 */
test('drops a drag when the pointer release goes missing', async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener(
      'pointerdown',
      (event) => {
        window.ghostPointerId = event.pointerId;
      },
      { capture: true },
    );
  });
  await logIn(page);
  await openFromDesktopIcon(page, 'about');

  const about = page.getByTestId('window-about');
  const grip = await boxOf(page.getByTestId('titlebar-about'));
  const startX = grip.x + grip.width / 2;
  const startY = grip.y + grip.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 40, startY + 30, { steps: 6 });
  const dragged = await boxOf(about);
  expect(dragged.x).toBeGreaterThan(grip.x);

  // The release never arrives; the next move simply reports no button held.
  await page.evaluate((point) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      clientX: point.x,
      clientY: point.y,
      buttons: 0,
      pointerId: window.ghostPointerId ?? 1,
    }));
  }, { x: startX + 60, y: startY + 45 });

  // Everything after that is a ghost drag if the gesture survived.
  await page.mouse.move(startX + 240, startY + 180, { steps: 8 });
  await page.mouse.up();
  await page.mouse.move(startX + 300, startY + 220, { steps: 4 });

  const settled = await boxOf(about);
  expect(settled.x).toBeCloseTo(dragged.x, 0);
  expect(settled.y).toBeCloseTo(dragged.y, 0);
});

test('drops a drag when the shell loses focus mid-gesture', async ({
  page,
}) => {
  await logIn(page);
  await openFromDesktopIcon(page, 'about');

  const about = page.getByTestId('window-about');
  const grip = await boxOf(page.getByTestId('titlebar-about'));
  const startX = grip.x + grip.width / 2;
  const startY = grip.y + grip.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 30, startY + 20, { steps: 4 });
  const dragged = await boxOf(about);

  // Alt-tab, a debugger break, the OS stealing the pointer: the release lands
  // somewhere else entirely.
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
  });

  await page.mouse.move(startX + 220, startY + 170, { steps: 8 });
  await page.mouse.up();

  const settled = await boxOf(about);
  expect(settled.x).toBeCloseTo(dragged.x, 0);
  expect(settled.y).toBeCloseTo(dragged.y, 0);
});

/**
 * One window per app, mounted exactly once. Every launch route - including an
 * app opening another app - has to land on the same single window, or the
 * renderer is mounting plugin code twice behind the player's back.
 */
test('mounts each app exactly once however it is launched', async ({
  page,
}) => {
  await logIn(page);

  await openFromDesktopIcon(page, 'about');
  await page.getByTestId('about-open-bubbles').click();
  await expect(page.getByTestId('window-bubbles')).toHaveCount(1);

  await openFromStartMenu(page, 'bubbles');
  await openFromDesktopIcon(page, 'bubbles');
  // Bubble Break now sits on top of About; raise About so its button is
  // actually clickable rather than covered by the other window.
  await page.getByTestId('taskbar-button-about').click();
  await page.getByTestId('about-open-bubbles').click();

  await expect(page.getByTestId('window-bubbles')).toHaveCount(1);
  await expect(page.getByTestId('bubbles-app')).toHaveCount(1);
  await expect(page.getByTestId('bubble-target')).toHaveCount(1);
  await expect(page.getByTestId('taskbar-button-bubbles')).toHaveCount(1);

  // A second window is still a second window: the About page must not have
  // been remounted by any of that either.
  await expect(page.getByTestId('about-app')).toHaveCount(1);
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
