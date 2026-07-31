import { expect, type Locator, type Page } from '@playwright/test';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Real milliseconds one simulated minute costs at x1 (`day-driver.ts`). */
export const TICK_MS = 1_000;

/** Minutes in a shift, 09:00 to 17:00. */
export const SHIFT_MINUTES = 8 * 60;

/** Fake real time that buys `minutes` simulated minutes at `speed`. */
export function realMs(minutes: number, speed: number): number {
  return (minutes * TICK_MS) / speed;
}

export interface LoginOptions {
  /**
   * What to do with the morning brief, which the day puts on screen at the
   * first login of a day. `close` (the default) clears it out of the way so a
   * test that is about something else starts on an empty desktop; `keep`
   * leaves it for the tests that are about the day itself.
   */
  readonly brief?: 'close' | 'keep';
}

/** Boots the shell and logs in. Boot auto-advances, so skipping is optional. */
export async function logIn(
  page: Page,
  options: Readonly<LoginOptions> = {},
): Promise<void> {
  await page.goto('/');
  await completeLogin(page, options);
}

/**
 * Everything after the navigation: skip the boot gag and log on. Split out so
 * a test can put its own work between loading the page and using it.
 */
export async function completeLogin(
  page: Page,
  options: Readonly<LoginOptions> = {},
): Promise<void> {
  const boot = page.getByTestId('boot-screen');

  if (await boot.isVisible()) {
    await page.keyboard.press('Space');
  }

  await expect(page.getByTestId('login-screen')).toBeVisible();
  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('desktop')).toBeVisible();

  if (options.brief === 'keep') {
    return;
  }

  await dismissBrief(page);
}

/** Closes the morning brief if the day has just put one up. */
export async function dismissBrief(page: Page): Promise<void> {
  const brief = page.getByTestId('window-brief');

  if (await brief.isVisible()) {
    await page.getByTestId('close-brief').click();
    await expect(brief).toHaveCount(0);
  }
}

/**
 * Runs the simulated clock forward, in minutes, on a page whose clock has been
 * installed. The speed control is the shipped one, so this is the same thing a
 * player does when they get bored - only without the waiting.
 */
export async function runSimMinutes(
  page: Page,
  minutes: number,
  speed = 4,
): Promise<void> {
  await page.getByTestId(`day-speed-${String(speed)}`).click();
  await page.clock.runFor(realMs(minutes, speed));
}

/**
 * Boots a session and plays it forward to the morning of `day`.
 *
 * The week deals its queue across five days - Monday's two, a drip on the
 * Tuesday, the office-wide fault on the Thursday - so a test about a ticket
 * that arrives later has to get there, and there is only one way to get there:
 * work the days in between and clock off. It installs the fake clock itself,
 * because a test that walks four days in real time is a test nobody runs.
 *
 * It leaves the target day's morning brief on screen unless told otherwise,
 * exactly as `logIn` does.
 */
export async function logInOnDay(
  page: Page,
  day: number,
  options: Readonly<LoginOptions> = {},
): Promise<void> {
  await page.clock.install();
  // Idle days breach their queues, so any multi-day session arrives with the
  // player fumbling; the sway never settles under strict actionability
  // checks. Cross-day tests assert state, not pixels - reduced-motion path.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });

  for (let current = 1; current < day; current += 1) {
    await expect(page.getByTestId('brief-heading'))
      .toContainText(`Day ${String(current)}`);
    await page.getByTestId('brief-start-shift').click();
    await page.getByTestId('close-brief').click();

    await runSimMinutes(page, SHIFT_MINUTES);
    await expect(page.getByTestId('day-state')).toHaveText('Day end');
    await page.getByTestId('scorecard-clock-off').click();
    await expect(page.getByTestId('window-brief')).toBeVisible();
  }

  await expect(page.getByTestId('brief-heading'))
    .toContainText(`Day ${String(day)}`);

  if (options.brief !== 'keep') {
    await dismissBrief(page);
  }
}

/**
 * Starts the shift on the day that is on screen and runs the clock to a tick
 * of that day, counting from 08:00 - which is what every tick in this game
 * counts from, and what the day's schedule is written in.
 *
 * Starting the shift puts the clock on 09:00 (tick 60), so anything earlier
 * than that has already happened by the time this returns.
 */
export async function workUntil(page: Page, tickOfDay: number): Promise<void> {
  await page.getByTestId('day-state').click();
  await expect(page.getByTestId('window-brief')).toBeVisible();
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();

  if (tickOfDay > 60) {
    await runSimMinutes(page, tickOfDay - 60);
  }
}

/** Starts the shift from a morning brief that is already on screen. */
export async function beginShift(page: Page): Promise<void> {
  await page.getByTestId('brief-start-shift').click();
  // At x4 a few sim-minutes pass between the click and the read.
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^09:/);
  await page.getByTestId('close-brief').click();
}

/**
 * Runs the clock until the day is actually over.
 *
 * Bounded stepping rather than one fixed eight-hour run, and read off the
 * badge's ATTRIBUTE rather than its text. Both halves matter: a journey that
 * has done a morning's work has already spent some of the day, so "run exactly
 * a shift's worth" lands somewhere that depends on how many buttons were
 * pressed, and the day-state badge is the one control on the taskbar whose
 * label is styled per state - an attribute is what it MEANS, and text is only
 * what it happens to say.
 */
export async function runToDayEnd(page: Page): Promise<void> {
  const badge = page.getByTestId('day-state');

  for (let step = 0; step < 20; step += 1) {
    if (await badge.getAttribute('data-state') === 'day_end') {
      break;
    }

    await runSimMinutes(page, 60);
  }

  await expect(badge).toHaveAttribute('data-state', 'day_end');
}

/** Runs whatever is left of `day` out and clocks off into the next one. */
export async function clockOffFor(page: Page, day: number): Promise<void> {
  await runToDayEnd(page);
  await page.getByTestId('scorecard-clock-off').click();
  await expect(page.getByTestId('sim-clock-day'))
    .toHaveText(`Day ${String(day + 1)}`);
  await expect(page.getByTestId('window-brief')).toBeVisible();
}

/**
 * Runs the clock to a minute of the day that is on screen, counting from 08:00
 * like everything else in the schedule, and never backwards.
 */
export async function workUntilMinute(
  page: Page,
  tickOfDay: number,
): Promise<void> {
  const now = await page.getByTestId('sim-clock-time').textContent() ?? '09:00';
  const [hours, minutes] = now.split(':').map(Number);
  const at = (hours ?? 9) * 60 + (minutes ?? 0) - 8 * 60;

  if (tickOfDay > at) {
    await runSimMinutes(page, tickOfDay - at);
  }
}

/**
 * Walks the clock forward in small steps until the lead's footsteps start.
 *
 * Deliberately a search rather than a minute the test knows: the corridor is a
 * seeded schedule and each day of the week twists that seed, so a test that
 * hard-codes a Tuesday telegraph is a test that breaks when a Tuesday is
 * tuned. Two minutes a step, which cannot skip a four-minute window.
 */
export async function runToTelegraph(
  page: Page,
  limitMinutes = 300,
): Promise<void> {
  const desktop = page.getByTestId('desktop');

  for (let minute = 0; minute < limitMinutes; minute += 2) {
    if (await desktop.getAttribute('data-boss') === 'telegraph') {
      return;
    }

    await page.clock.runFor(realMs(2, 4));
  }

  throw new Error('The lead never came down the corridor.');
}

export async function openFromStartMenu(
  page: Page,
  appId: string,
): Promise<void> {
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('start-menu')).toBeVisible();
  await page.getByTestId(`start-menu-item-${appId}`).click();
  await expect(page.getByTestId('start-menu')).toBeHidden();
  await expect(page.getByTestId(`window-${appId}`)).toBeVisible();
}

export async function openFromDesktopIcon(
  page: Page,
  appId: string,
): Promise<void> {
  await page.getByTestId(`desktop-icon-${appId}`).dblclick();
  await expect(page.getByTestId(`window-${appId}`)).toBeVisible();
}

/** Brings an already-open window to the front from the taskbar. */
export async function focusWindow(page: Page, appId: string): Promise<void> {
  // The taskbar button TOGGLES: clicking it on an already-focused window
  // minimizes it. Focus can land on this window by itself (e.g. after the
  // boss key minimizes the slack window above it), so only click when the
  // window actually needs focusing.
  const window = page.getByTestId(`window-${appId}`);
  const focused = await window.getAttribute('data-focused');
  const minimized = await window.getAttribute('data-minimized');

  if (focused !== 'true' || minimized === 'true') {
    await page.getByTestId(`taskbar-button-${appId}`).click();
  }

  await expect(window).toHaveAttribute('data-focused', 'true');
}

/** Runs one line in the Support Terminal and waits for it to echo back. */
export async function runCommand(page: Page, line: string): Promise<void> {
  const input = page.getByTestId('cmd-input');
  await input.fill(line);
  await input.press('Enter');
  await expect(page.getByTestId('cmd-output')).toContainText(
    `C:\\SUPPORT> ${line}`,
  );
}

/** The one toast that says a ticket closed itself. */
export function resolvedToast(page: Page): Locator {
  return page.getByTestId('toast').filter({ hasText: 'Ticket resolved' });
}

export async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error('Expected the element to have a layout box.');
  }

  return box;
}

/** Presses the pointer in the middle of `from` and drags it by a delta. */
export async function dragBy(
  page: Page,
  from: Locator,
  dx: number,
  dy: number,
): Promise<void> {
  const box = await boxOf(from);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 12 });
  await page.mouse.up();
}

export interface ActiveElement {
  /** `data-testid` of the focused element, or null when there is none. */
  readonly testid: string | null;
  /** True when the focused element sits inside an `aria-hidden` subtree. */
  readonly inAriaHidden: boolean;
}

/** Reads where keyboard focus actually is, not where the UI implies it is. */
export async function activeElement(page: Page): Promise<ActiveElement> {
  return page.evaluate(() => {
    const active = document.activeElement;

    if (!(active instanceof HTMLElement)) {
      return { testid: null, inAriaHidden: false };
    }

    return {
      testid: active.dataset.testid ?? null,
      inAriaHidden: active.closest('[aria-hidden="true"]') !== null,
    };
  });
}

export async function zIndexOf(page: Page, appId: string): Promise<number> {
  const value = await page
    .getByTestId(`window-${appId}`)
    .getAttribute('data-z');

  return Number(value);
}
