import { expect, type Page, test } from '@playwright/test';

import {
  completeLogin,
  dismissBrief,
  focusWindow,
  openFromStartMenu,
  runCommand,
} from './helpers';

/**
 * The Linux desktop, on the built artifact (0.27.0 and 0.28.0, E6/E5).
 *
 * The skin system is proven at the unit level as DATA (`src/shell/skins.test.ts`
 * asserts each desktop declares chrome nobody else does), but a registry is not
 * a shell: what a player meets is a panel, a launcher and a titlebar. So this is
 * the half only a browser can answer - the chrome actually MOVES, and GNOME's
 * missing window buttons are missing from the DOCUMENT rather than hidden by a
 * rule, which is the tell the whole slice turns on.
 *
 * Seeded the way `msp.spec.ts` seeds an arrival: a switch record in storage (the
 * key the offer-accept writes), so booting stands the MSP up on its Monday and
 * the promotion is on the table - because choosing a desktop at all is gated on
 * being past it.
 */

const SWITCH_KEY = 'workgrumble/switch';

const ARRIVAL = {
  employer: 'msp',
  career: {
    reputation: 74,
    title: 'IT Support Technician',
    farmFund: 30_000,
    trail: null,
  },
};

async function arrive(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, record]) => {
      window.localStorage.setItem(key, JSON.stringify(record));
    },
    [SWITCH_KEY, ARRIVAL] as [string, typeof ARRIVAL],
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });

  const arrival = page.getByTestId('window-updates');

  if (await arrival.count()) {
    await page.getByTestId('close-updates').click();
    await expect(arrival).toHaveCount(0);
  }

  await dismissBrief(page);
}

/** Takes the promotion, which is what unlocks a desktop of your own. */
async function promote(page: Page): Promise<void> {
  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'promotion accept');
  await expect(page.getByTestId('cmd-output'))
    .toContainText('Systems Engineer now');
}

test('the desk is refused its own desktop, and told why', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The fake clock is INSTALLED, which is not the same as stopped: it leaves
  // the day syncing with real time (the contract in `helpers.ts`), and what it
  // buys a short spec like this one is that the minutes are the test's to spend
  // rather than the machine's to lose. Nothing below reads a minute anyway -
  // this is a question about a refusal, not about what the day does while it is
  // being asked.
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });
  await dismissBrief(page);

  await openFromStartMenu(page, 'display');
  await expect(page.getByTestId('display-current')).toContainText('as issued');

  await page.getByTestId('display-desktop-gnome').click();

  // The refusal is SAID, beside the button that was pressed - and the chrome
  // has not moved an inch: the panel is still at the bottom, the launcher still
  // says Start, and the titlebar in front still has all three of its buttons.
  await expect(page.getByTestId('display-refusal')).toContainText('promotion');

  // AND THE EYE CAN FIND IT: attached-with-a-box is not seen. The refusal
  // used to render two lists below the button - technically visible, actually
  // off-screen, and the owner read the window as broken. The gate is
  // GEOMETRY: the refusal's box intersects the window's own visible box, and
  // it sits within a row's height of the button that was pressed.
  const refusalBox = await page.getByTestId('display-refusal').boundingBox();
  const windowBox = await page.getByTestId('window-display').boundingBox();
  const buttonBox = await page.getByTestId('display-desktop-gnome')
    .boundingBox();
  expect(refusalBox).not.toBeNull();
  expect(windowBox).not.toBeNull();
  expect((refusalBox?.y ?? 0) >= (windowBox?.y ?? 0)).toBe(true);
  expect((refusalBox?.y ?? 0) <= (windowBox?.y ?? 0) + (windowBox?.height ?? 0))
    .toBe(true);
  expect(Math.abs((refusalBox?.y ?? 0) - ((buttonBox?.y ?? 0)
    + (buttonBox?.height ?? 0)))).toBeLessThan(160);
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-skin', 'deskpro');
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-panel', 'bottom');
  await expect(page.getByTestId('start-button')).toContainText('Start');
  await expect(page.getByTestId('minimize-display')).toHaveCount(1);
});

test('an engineer switches desktop and the chrome follows', async ({ page }) => {
  await arrive(page);
  await promote(page);

  const desktop = page.getByTestId('desktop');
  await openFromStartMenu(page, 'display');

  // KDE: bottom panel, Kickoff in the corner, all three window buttons - the
  // comfortable landing.
  await page.getByTestId('display-desktop-kde').click();
  await expect(desktop).toHaveAttribute('data-skin', 'kde');
  await expect(desktop).toHaveAttribute('data-panel', 'bottom');
  await expect(page.getByTestId('start-button')).toContainText('Kickoff');
  await expect(page.getByTestId('taskbar-windows')).toBeVisible();
  await expect(page.getByTestId('minimize-display')).toHaveCount(1);

  // GNOME: a top bar, no window list at all, and the sharp tell.
  await page.getByTestId('display-desktop-gnome').click();
  await expect(desktop).toHaveAttribute('data-skin', 'gnome');
  await expect(desktop).toHaveAttribute('data-panel', 'top');
  await expect(page.getByTestId('start-button')).toContainText('Activities');
  await expect(page.getByTestId('taskbar-windows')).toHaveCount(0);

  // THE TEETH: not hidden - ABSENT. `toHaveCount(0)` is a question about the
  // document, so a minimize button that was merely `display: none` would still
  // be found here and this would go red. The close button is still there,
  // because a window with no way out is a dead end whatever it looks like.
  await expect(page.getByTestId('minimize-display')).toHaveCount(0);
  await expect(page.locator('.window-minimize')).toHaveCount(0);
  await expect(page.locator('.window-maximize')).toHaveCount(0);
  await expect(page.getByTestId('close-display')).toHaveCount(1);

  // And the product still works under it - a skin is a LOOK. The queue opens
  // on the desktop with no taskbar and reads exactly as it does on the beige
  // one; a mechanic that broke under a skin is the bug this forbids.
  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('tickets-summary')).toContainText('open');
  await expect(page.getByTestId('tickets-queue')).toBeVisible();
  await page.getByTestId('close-tickets').click();

  // Including the one a desktop with no window list could have broken: the
  // panic key still drops a slack window out of sight, and with no taskbar
  // button to press, the LAUNCHER is the way back to it. A window that could be
  // hidden and not recovered would be the dead end the house rules forbid, and
  // it would be this skin that introduced it.
  await openFromStartMenu(page, 'bubbles');
  await page.keyboard.press('Backquote');
  await expect(page.getByTestId('window-bubbles')).toBeHidden();
  await openFromStartMenu(page, 'bubbles');
  await expect(page.getByTestId('window-bubbles')).toBeVisible();
  await page.getByTestId('close-bubbles').click();

  // Cinnamon: back to a bottom panel, a Menu button and all three window
  // buttons - the Linux desktop that looks most like the one you left.
  await openFromStartMenu(page, 'display');
  await page.getByTestId('display-desktop-cinnamon').click();
  await expect(desktop).toHaveAttribute('data-skin', 'cinnamon');
  await expect(desktop).toHaveAttribute('data-panel', 'bottom');
  await expect(page.getByTestId('start-button')).toContainText('Menu');
  await expect(page.getByTestId('minimize-display')).toHaveCount(1);

  // Back to the box IT issued, which is never refused and drops the distro.
  await page.getByTestId('display-desktop-deskpro').click();
  await expect(desktop).toHaveAttribute('data-skin', 'deskpro');
  await expect(desktop).toHaveAttribute('data-distro', 'none');
  await expect(page.getByTestId('start-button')).toContainText('Start');
});

/**
 * 0.28.0: the second panel, and the two light desktops beside it.
 *
 * The registry says MATE has two panels (`skins.test.ts` is the tooth on the
 * declaration); this is the half only a browser can answer - that both bars are
 * really on the screen, on opposite edges, with the launcher up in the menu bar
 * and the window list and the clock down in the taskbar. And that switching
 * away takes the second bar out of the DOCUMENT again, which is the whole
 * promise the extension made to the six desktops that never asked for it.
 */
test('MATE puts up two panels and the others put up one', async ({ page }) => {
  await arrive(page);
  await promote(page);

  const desktop = page.getByTestId('desktop');
  const firstBar = page.getByTestId('taskbar');
  const secondBar = page.getByTestId('taskbar-second');
  await openFromStartMenu(page, 'display');

  await page.getByTestId('display-desktop-mate').click();
  await expect(desktop).toHaveAttribute('data-skin', 'mate');
  await expect(desktop).toHaveAttribute('data-panel', 'top');
  await expect(desktop).toHaveAttribute('data-panel-second', 'bottom');
  await expect(secondBar).toBeVisible();

  // The split, which is the whole point: the launcher is in the TOP bar and the
  // window list and the tray are in the BOTTOM one. Asked as "inside this bar"
  // rather than "on the page", because two panels that both existed with
  // everything in the wrong one would pass every count on the screen.
  await expect(firstBar.getByTestId('start-button')).toContainText(
    'Applications',
  );
  await expect(firstBar.getByTestId('taskbar-windows')).toHaveCount(0);
  await expect(firstBar.getByTestId('sim-clock')).toHaveCount(0);
  await expect(secondBar.getByTestId('taskbar-windows')).toBeVisible();
  await expect(secondBar.getByTestId('sim-clock')).toBeVisible();
  await expect(secondBar.getByTestId('start-button')).toHaveCount(0);

  // There is ONE of each, not a copy per bar: the taskbar buttons are painted
  // off the window manager, and a second stale list would be a row of buttons
  // that stopped answering.
  await expect(page.getByTestId('taskbar-windows')).toHaveCount(1);
  await expect(page.getByTestId('notification-tray')).toHaveCount(1);

  // And the product works under it - the launcher opens from the top bar, the
  // window opens, and the taskbar button for it lands in the bottom bar.
  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('window-tickets')).toBeVisible();
  await expect(secondBar.getByTestId('taskbar-button-tickets')).toBeVisible();
  await page.getByTestId('close-tickets').click();

  // Xfce: one bottom panel, the Applications menu with its glyph, all three
  // window buttons. The second bar is GONE - not emptied, not hidden.
  await openFromStartMenu(page, 'display');
  await page.getByTestId('display-desktop-xfce').click();
  await expect(desktop).toHaveAttribute('data-skin', 'xfce');
  await expect(desktop).toHaveAttribute('data-panel', 'bottom');
  await expect(desktop).toHaveAttribute('data-panel-second', 'none');
  await expect(secondBar).toHaveCount(0);
  await expect(firstBar.getByTestId('start-button')).toContainText(
    'Applications',
  );
  await expect(firstBar.getByTestId('taskbar-windows')).toBeVisible();
  await expect(firstBar.getByTestId('sim-clock')).toBeVisible();
  await expect(page.getByTestId('minimize-display')).toHaveCount(1);

  // LXQt: the slim one, and a launcher that is a word with no glyph on it.
  await page.getByTestId('display-desktop-lxqt').click();
  await expect(desktop).toHaveAttribute('data-skin', 'lxqt');
  await expect(desktop).toHaveAttribute('data-panel', 'bottom');
  await expect(desktop).toHaveAttribute('data-panel-second', 'none');
  await expect(secondBar).toHaveCount(0);
  await expect(page.getByTestId('start-button')).toHaveText('LXQt');
  await expect(page.getByTestId('start-button').locator('.svg-icon'))
    .toHaveCount(0);
  await expect(page.getByTestId('minimize-display')).toHaveCount(1);
});

/**
 * 0.33.0: the Mac, and the first LAYOUT fork the skin system has taken.
 *
 * `skins.test.ts` is the tooth on the declaration - a menu-bar panel kind, a
 * dock launcher, the buttons on the left in close-first order. This is the
 * half only a browser can answer, and it is asked twice over: what the
 * DOCUMENT says (which bar holds what, which button is first in the row) and
 * what the LAYOUT does (the buttons are really at the left-hand end, the dock
 * is really in the middle), because a `side` that was declared and never
 * styled would pass every count on the page.
 */
test('the Mac puts a menu bar on top, a dock underneath and the buttons left', async ({
  page,
}) => {
  await arrive(page);
  await promote(page);

  const desktop = page.getByTestId('desktop');
  const dock = page.getByTestId('taskbar');
  const menuBar = page.getByTestId('taskbar-second');
  await openFromStartMenu(page, 'display');

  await page.getByTestId('display-desktop-orchard').click();
  await expect(desktop).toHaveAttribute('data-skin', 'orchard');
  // The launcher panel is at the BOTTOM and the other bar is on top, which is
  // MATE's arrangement mirrored - the same two fields, the other way round.
  await expect(desktop).toHaveAttribute('data-panel', 'bottom');
  await expect(desktop).toHaveAttribute('data-panel-second', 'top');
  await expect(desktop).toHaveAttribute('data-launcher', 'dock');
  // Not on a distribution, because it is not Linux.
  await expect(desktop).toHaveAttribute('data-distro', 'none');
  await expect(page.getByTestId('display-package-manager'))
    .toContainText('no system package manager');

  // THE MENU BAR, asked INSIDE the bar: it says which app has the keyboard,
  // it carries the clock, and it has no window list in it at all.
  await expect(menuBar).toHaveAttribute('data-kind', 'menu-bar');
  await expect(menuBar.getByTestId('menu-bar-app'))
    .toHaveText('Display Properties');
  await expect(menuBar.getByTestId('sim-clock')).toBeVisible();
  await expect(menuBar.getByTestId('taskbar-windows')).toHaveCount(0);
  await expect(menuBar.getByTestId('start-button')).toHaveCount(0);

  // THE DOCK, in the other bar: the launcher and the open windows, and the
  // clock is NOT down here - it is upstairs where a Mac keeps it.
  await expect(dock).toHaveAttribute('data-kind', 'panel');
  await expect(dock.getByTestId('start-button')).toBeVisible();
  await expect(dock.getByTestId('taskbar-windows')).toBeVisible();
  await expect(dock.getByTestId('sim-clock')).toHaveCount(0);

  // And it is a DOCK rather than a taskbar: the strip is in the middle of the
  // bar rather than jammed into the corner. Geometry, because that is the
  // whole of what the launcher style buys - a `dock` that was declared and
  // never styled would satisfy every assertion above this one.
  const dockBox = await dock.boundingBox();
  const launcherBox = await dock.getByTestId('start-button').boundingBox();
  expect(launcherBox?.x ?? 0)
    .toBeGreaterThan((dockBox?.x ?? 0) + (dockBox?.width ?? 0) / 5);

  // THE WINDOW BUTTONS: left end, close FIRST, and all three of them there -
  // this is not GNOME's missing pair, it is the same three controls at the
  // other end in the other order.
  const controls = page.getByTestId('window-display').locator('.window-controls');
  await expect(controls).toHaveAttribute('data-side', 'left');
  await expect(controls.locator('button')).toHaveCount(3);
  await expect(controls.locator('button').nth(0)).toHaveClass(/window-close/u);
  await expect(controls.locator('button').nth(1))
    .toHaveClass(/window-minimize/u);
  await expect(controls.locator('button').nth(2))
    .toHaveClass(/window-maximize/u);

  // And they are really over THERE, not merely declared to be: the row starts
  // to the left of the title it used to sit opposite.
  const controlsBox = await controls.boundingBox();
  const titleBox = await page.getByTestId('window-display')
    .locator('.window-title').boundingBox();
  expect(controlsBox?.x ?? Number.MAX_SAFE_INTEGER)
    .toBeLessThan(titleBox?.x ?? 0);

  // The menu bar follows the FOCUS, which is the whole of what a menu bar
  // owns in this shell: open the queue and the bar is the queue's.
  await openFromStartMenu(page, 'tickets');
  await expect(menuBar.getByTestId('menu-bar-app')).toHaveText('Ticket Queue');
  await expect(page.getByTestId('tickets-summary')).toContainText('open');

  // Including the way back: close it, and the bar follows focus to the
  // window still open underneath - Display Properties never closed, and a
  // bar that skipped it for the desktop name would be showing a screen that
  // is not the one in front.
  await page.getByTestId('close-tickets').click();
  await expect(menuBar.getByTestId('menu-bar-app'))
    .toHaveText('Display Properties');

  // The desktop name is what NOTHING focused shows: park BOTH windows still
  // open (the promotion's terminal is under Display Properties) and the bar
  // says whose desk this is; bring Display Properties back for the switch.
  await page.getByTestId('minimize-display').click();
  await expect(menuBar.getByTestId('menu-bar-app'))
    .toHaveText('Support Terminal');
  await page.getByTestId('minimize-cmd').click();
  await expect(menuBar.getByTestId('menu-bar-app')).toHaveText('Orchard 15');
  await page.getByTestId('taskbar-button-display').click();

  // And leaving takes BOTH new primitives back out of the document: no second
  // bar, no menu bar, the buttons back on the right in the order they were.
  await focusWindow(page, 'display');
  await page.getByTestId('display-desktop-cinnamon').click();
  await expect(desktop).toHaveAttribute('data-panel-second', 'none');
  await expect(menuBar).toHaveCount(0);
  await expect(page.getByTestId('menu-bar-app')).toHaveCount(0);
  await expect(controls).toHaveAttribute('data-side', 'right');
  await expect(controls.locator('button').nth(0))
    .toHaveClass(/window-minimize/u);
});

test('the desktop the player chose survives a save and a load', async ({
  page,
}) => {
  // Seeded ONCE, by hand, rather than through `arrive`: an init script re-runs
  // on every navigation, so the reload below would arrive at the MSP a SECOND
  // time - a fresh first-day session standing itself up over the one the load
  // just restored. The question here is what a save carries, so the arrival has
  // to happen once and stay happened.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/');
  await page.evaluate(
    ([key, record]) => {
      window.localStorage.setItem(key, JSON.stringify(record));
    },
    [SWITCH_KEY, ARRIVAL] as [string, typeof ARRIVAL],
  );
  await page.reload();
  await completeLogin(page, { brief: 'keep' });

  const arrival = page.getByTestId('window-updates');

  if (await arrival.count()) {
    await page.getByTestId('close-updates').click();
    await expect(arrival).toHaveCount(0);
  }

  await dismissBrief(page);
  await promote(page);
  await openFromStartMenu(page, 'display');
  await page.getByTestId('display-desktop-gnome').click();
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-skin', 'gnome');

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-save').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Game saved' }),
  ).toHaveCount(1);

  // A browser that has been reloaded is a machine that has been turned off and
  // on again: the session starts on the box IT issued, and the LOAD is what
  // brings the reinstall back - chrome, distro and all.
  await page.reload();
  await completeLogin(page, { brief: 'keep' });
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-skin', 'deskpro');

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-skin', 'gnome');
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-panel', 'top');
  await expect(page.getByTestId('start-button')).toContainText('Activities');
});

/**
 * 0.28.0: the distro that ships no desktop, and the one place in this shell
 * where a choice opens another choice.
 *
 * `skins.test.ts` proves the RESOLUTION - that Arch on a machine with no
 * desktop answers "needs-desktop" rather than inventing one - but a resolution
 * is not a dialog. This is the half only a browser can answer: the pick is
 * really on the screen, the machine has really not moved while it is up, and
 * the answer really lands on both axes at once.
 */
test('Arch ships no desktop, so the player is made to pick one', async ({
  page,
}) => {
  await arrive(page);
  await promote(page);

  const desktop = page.getByTestId('desktop');
  const pick = page.getByTestId('display-desktop-pick');

  await openFromStartMenu(page, 'display');
  await expect(pick).toBeHidden();

  // Every other distribution installs straight from this list, because every
  // other distribution ships a desktop. This one asks.
  await page.getByTestId('display-distro-arch').click();
  await expect(pick).toBeVisible();
  await expect(page.getByTestId('display-pick-prompt'))
    .toContainText('Arch Linux');

  // TEETH: the press itself installed NOTHING. A pick that had already put a
  // desktop on the machine and then asked which one would be this window
  // choosing for the player and calling it a question.
  await expect(desktop).toHaveAttribute('data-skin', 'deskpro');
  await expect(desktop).toHaveAttribute('data-distro', 'none');
  await expect(page.getByTestId('start-button')).toContainText('Start');

  // The list is the rich one - all six Linux desktops, and not the beige box
  // the player is trying to leave.
  await expect(page.getByTestId('display-pick-lxqt')).toBeVisible();
  await expect(page.getByTestId('display-pick-mate')).toBeVisible();
  await expect(page.getByTestId('display-pick-deskpro')).toHaveCount(0);

  // The answer sets both axes in ONE go: chrome, distro and dialect together.
  await page.getByTestId('display-pick-xfce').click();
  await expect(pick).toBeHidden();
  await expect(desktop).toHaveAttribute('data-skin', 'xfce');
  await expect(desktop).toHaveAttribute('data-distro', 'arch');
  await expect(desktop).toHaveAttribute('data-launcher', 'applications');
  await expect(page.getByTestId('start-button')).toHaveText('Applications');
  await expect(page.getByTestId('display-package-manager'))
    .toContainText('pacman');

  // And on a machine that HAS a desktop, the same distro asks nothing at all -
  // there is one there to leave alone, which is the independence rule this axis
  // has kept since 0.27.0 rather than an exemption written for Arch.
  await page.getByTestId('display-desktop-lxqt').click();
  await expect(desktop).toHaveAttribute('data-skin', 'lxqt');
  await page.getByTestId('display-distro-arch').click();
  await expect(pick).toBeHidden();
  await expect(desktop).toHaveAttribute('data-skin', 'lxqt');
  await expect(desktop).toHaveAttribute('data-distro', 'arch');
});
