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

  // Both apps are reachable again after being closed - no dead end. Icon
  // route first: the reopened About window's cascade slot sits over the
  // wrapped icon column, and an icon under a window is not a dead end.
  await openFromDesktopIcon(page, 'bubbles');
  await expect(page.getByTestId('bubbles-app')).toBeVisible();
  await openFromStartMenu(page, 'about');
  await expect(page.getByTestId('about-app')).toBeVisible();
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
 * The third way a drag ends badly: the window it is dragging goes away.
 *
 * The listeners live on `window`, so they outlive the element - and a window's
 * id comes from its app, so the app that is opened again gets the SAME id. A
 * gesture nobody ended is therefore not merely a leak: it is a window that
 * jumps to the pointer the moment the player moves it with a button down.
 */
test('drops a drag when the window closes mid-gesture', async ({ page }) => {
  await logIn(page);
  await openFromDesktopIcon(page, 'about');

  const grip = await boxOf(page.getByTestId('titlebar-about'));
  const startX = grip.x + grip.width / 2;
  const startY = grip.y + grip.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 40, startY + 30, { steps: 6 });

  // Closed from under the drag. A synthetic click, because the pointer is
  // busy holding the titlebar - which is exactly the situation being tested.
  await page.getByTestId('close-about').dispatchEvent('click');
  await expect(page.getByTestId('window-about')).toHaveCount(0);

  await page.mouse.move(startX + 260, startY + 200, { steps: 8 });
  await page.mouse.up();

  // Same app, same window id, freshly opened where the cascade puts it.
  await openFromDesktopIcon(page, 'about');
  const reopened = await boxOf(page.getByTestId('window-about'));

  await page.mouse.move(startX + 320, startY + 260, { steps: 6 });
  const settled = await boxOf(page.getByTestId('window-about'));

  expect(settled.x).toBeCloseTo(reopened.x, 0);
  expect(settled.y).toBeCloseTo(reopened.y, 0);
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
  // With nine apps the Bubble Break icon wraps into the window cascade
  // area; clear both windows off it so the icon route is actually a click
  // on the icon (restoring via icon is still that route).
  await page.keyboard.press('Backquote');
  await page.getByTestId('minimize-about').click();
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

test('keeps the whole start menu on the screen at any app count', async ({
  page,
}) => {
  await logIn(page);

  // The menu is bottom-anchored and grows upward, so the failure mode of a
  // long list is silent: the top items walk off the TOP edge, visible in the
  // DOM, unclickable on the screen. Every app added to the manifest pushes
  // the oldest tool closer to that edge - this held 59 tests hostage the day
  // two interruption surfaces joined the list.
  await page.getByTestId('start-button').click();
  const menu = page.getByTestId('start-menu');
  await expect(menu).toBeVisible();

  const box = await menu.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);

  // THE ROWS, EVERY ONE OF THEM (W-07, 0.42.0). This test was green for a
  // year over five entries nobody could see, for two halves of one mistake:
  // it measured the WRAPPER, which is correctly clamped whatever is inside
  // it, and it reached for `start-menu-item-`, a prefix that does not match
  // the Save, Load, Log off or Restart rows at all. So it is the descendants
  // of the list that are measured now, all of them, against the line the
  // taskbar starts at rather than against the document.
  const rows = page.locator('.start-menu-list [data-testid^="start-menu-"]');
  const taskbar = await page.getByTestId('taskbar').boundingBox();
  expect(taskbar).not.toBeNull();

  const seen = await rows.evaluateAll(
    (nodes) => nodes.map((node) => node.dataset.testid ?? '?'),
  );

  // The four the old selector could not see, named so that a future rename
  // cannot quietly take them out of this gate's reach again.
  for (const id of [
    'start-menu-save',
    'start-menu-load',
    'start-menu-log-off',
    'start-menu-restart',
  ]) {
    expect(seen, `${id} is not among the rows this gate measures`)
      .toContain(id);
  }

  expect(seen.length).toBeGreaterThan(20);

  for (let index = 0; index < seen.length; index += 1) {
    const id = seen[index] ?? '?';
    const row = await rows.nth(index).boundingBox();

    expect(row, id).not.toBeNull();
    expect(row!.y, `${id} is off the top of the screen`)
      .toBeGreaterThanOrEqual(0);
    expect(row!.y + row!.height, `${id} is under the taskbar`)
      .toBeLessThanOrEqual(taskbar!.y + 1);
    expect(row!.x, `${id} is off the left of the screen`)
      .toBeGreaterThanOrEqual(0);
    expect(row!.x + row!.width, `${id} is off the right of the screen`)
      .toBeLessThanOrEqual(viewport!.width + 1);
    await expect(rows.nth(index), id).toBeInViewport();
  }

  // And nothing is BELOW anything: at the suite's own screen the menu wraps
  // into a second column rather than folding, so there is no scroll to find
  // and nothing to say about one.
  await expect(page.getByTestId('start-menu-list'))
    .toHaveAttribute('data-fold', 'false');
});

test('admits the fold when a window is too small to hold the menu', async ({
  page,
}) => {
  await logIn(page);

  // Small in BOTH directions, which is the only shape the menu cannot lay
  // out: too short for one column and too narrow for two. The walk's finding
  // was not that a folded list is unreachable - it scrolls to a wheel - but
  // that nothing on the screen admitted the fold was there.
  await page.setViewportSize({ width: 460, height: 420 });
  await page.getByTestId('start-button').click();

  const list = page.getByTestId('start-menu-list');
  await expect(list).toBeVisible();
  await expect(list).toHaveAttribute('data-fold', 'true');

  // Reachable, still, and the last row is a row rather than a rumour: it
  // scrolls into the list and is on the screen when it gets there.
  const rows = page.locator('.start-menu-list [data-testid^="start-menu-"]');
  await rows.last().scrollIntoViewIfNeeded();
  await expect(rows.last()).toBeInViewport();
  await expect(rows.last()).toBeVisible();
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

/**
 * Escape on the day's own screens, which two of them claimed in their own
 * source and none of them did: the key reached the start menu and the tray
 * panel and stopped there.
 *
 * It is deliberately not extended to the tools. Escape means something else
 * inside a terminal and a search box, and the screens the day puts up are the
 * ones with nothing in them to lose.
 */
test('dismisses the day screen in front with Escape, and nothing else', async ({
  page,
}) => {
  await logIn(page);

  for (const scene of ['caught', 'review', 'weekend']) {
    await openFromStartMenu(page, scene);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(`window-${scene}`)).toHaveCount(0);
  }

  // A tool in front of a scene: Escape is the tool's business, so both stay.
  await openFromStartMenu(page, 'caught');
  await openFromStartMenu(page, 'cmd');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('window-cmd')).toHaveCount(1);
  await expect(page.getByTestId('window-caught')).toHaveCount(1);

  // And with the start menu up, Escape closes the menu first - one press, one
  // surface, the nearest one.
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('start-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('start-menu')).toBeHidden();
  await expect(page.getByTestId('window-cmd')).toHaveCount(1);
});
