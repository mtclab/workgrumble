import { expect, test } from '@playwright/test';

import {
  activeElement,
  completeLogin,
  logIn,
  openFromDesktopIcon,
  openFromStartMenu,
  realMs,
  runSimMinutes,
  runToTelegraph,
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

/**
 * The day's own screens take the keyboard when the day puts them up.
 *
 * They are not opened by the player - a manager appears in the doorway, a
 * review happens at three o'clock - and a keyboard-only player was left to Tab
 * in from the top of the document to reach "Take it on the chin". Escape now
 * closes them (`windows.spec.ts`) and this is the other half of the same
 * sentence: the cursor is in the window that is talking to you.
 *
 * The TOOLS are deliberately excluded. Opening the terminal is a thing the
 * player did on purpose, and taking the cursor off whatever they left it on is
 * its own rudeness.
 */
test('gives the day screens the keyboard, and the tools none of it', async ({
  page,
}) => {
  await logIn(page);

  await openFromStartMenu(page, 'caught');
  await expect(page.getByTestId('caught-dismiss')).toBeFocused();
  // Which means the scene closes from the keyboard alone, without a Tab.
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('window-caught')).toHaveCount(0);

  // The fridge is locked all week, so its primary button cannot hold a cursor
  // - the window still has to be somewhere a keyboard can act.
  await openFromStartMenu(page, 'beer');
  await expect(page.getByTestId('beer-open')).toBeDisabled();
  await expect(page.getByTestId('close-beer')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('window-beer')).toHaveCount(0);

  // A tool: the cursor stays on the icon the player opened it from, rather
  // than being taken into the window.
  await openFromDesktopIcon(page, 'about');
  const focused = await activeElement(page);
  expect(focused.testid).toBe('desktop-icon-about');
});

/**
 * And the exception, which is the reason the rule is not simply "always".
 *
 * This one has to be the REAL arrival - the lead walking in on his own
 * schedule while the player is mid-command - because that is the only way the
 * scene opens with a cursor already in a text box. Opening it from the start
 * menu would move the focus by clicking the menu.
 */
test('leaves the cursor in a half-typed line when the lead walks in', async ({
  page,
}) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();

  // Something to be caught at, and something to be typing.
  await openFromStartMenu(page, 'bubbles');
  await openFromStartMenu(page, 'cmd');
  const terminal = page.getByTestId('cmd-input');
  await terminal.fill('restart spool');
  await expect(terminal).toBeFocused();

  // The speed control first: `runToTelegraph` walks the clock in x4 minutes,
  // so the shell has to be running at x4 for its steps to be minutes.
  await runSimMinutes(page, 1);
  await runToTelegraph(page);
  const caught = page.getByTestId('window-caught');

  // The reaction window is deliberately not used: this is the walk-in.
  for (let minute = 0; minute < 20 && await caught.count() === 0; minute += 1) {
    await page.clock.runFor(realMs(1, 4));
  }

  await expect(caught).toBeVisible();
  // The rest of the sentence must not be typed into a button.
  await expect(terminal).toBeFocused();
  await expect(terminal).toHaveValue('restart spool');
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
