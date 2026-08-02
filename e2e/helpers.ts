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

/** The speeds the shipped control offers. */
export type Speed = 1 | 2 | 4;

/**
 * How many times a run may re-assert its speed before it gives up.
 *
 * A shift holds a handful of events and each of them costs one pass, so this
 * is a bound on a bug rather than on a day: a run that has been dropped twelve
 * times has not met twelve events, it has met something that is putting the
 * clock back down every minute, and a helper that quietly kept trying would
 * turn that into a slow test instead of a red one.
 */
const SPEED_PASSES = 12;

/** The tick the running session is on, or null before there is a session. */
async function simTick(page: Page): Promise<number | null> {
  return page.evaluate(() => globalThis.careerSim?.tick() ?? null);
}

/**
 * Puts the shipped speed control on `speed`, and does nothing when it is
 * already there.
 *
 * The read comes first for two reasons that both cost a test if they are got
 * wrong. A click TAKES THE KEYBOARD, so a helper that clicked unconditionally
 * would blur whatever the test had put the cursor in, on every step of every
 * walk; and the taskbar can have one of the day's own screens over it, so a
 * click nobody needed is a click that can hang on a covered button. Reading
 * `data-active` needs neither the pointer nor the focus.
 */
export async function setSpeed(page: Page, speed: Speed): Promise<void> {
  const button = page.getByTestId(`day-speed-${String(speed)}`);

  if (await button.getAttribute('data-active') === 'true') {
    return;
  }

  await button.click();
}

/**
 * Runs the simulated clock forward BY MINUTES, on a page whose clock has been
 * installed. The speed control is the shipped one, so this is the same thing a
 * player does when they get bored - only without the waiting.
 *
 * THE CONTRACT, decided once in 0.3.2 and applied everywhere: this helper
 * delivers the minutes it was asked for, whatever the day does to the speed
 * control while it is delivering them. The shell drops the clock to x1 every
 * time something synchronous lands - a phone starts ringing, a meeting or a
 * workstation takes the desk, the lead arrives at a screen with a game on it -
 * so a fixed stretch of real time stopped being a fixed number of minutes.
 * Anything that walked a shift by multiplying minutes by a speed it had set
 * once would now stop somewhere in the early afternoon and assert against a
 * day that had not happened.
 *
 * So the run watches the clock: it re-asserts the speed it was asked for and
 * buys the minutes that are still owed, until the day has actually reached the
 * minute the caller wanted or has stopped moving at all (paused, clocked off,
 * or a screen that has no clock on it - all of which are somebody else's
 * assertion to make).
 *
 * TWO THINGS FOLLOW FROM IT, and both are the caller's business:
 *
 * - Re-asserting is a real click on a real button, so it takes the keyboard.
 *   A test asserting where the cursor is across a stretch of clock drives its
 *   own minutes with `runRealMinutes` instead.
 * - A test that is ABOUT the drop cannot use a helper that undoes it. Those
 *   drive their minutes with `runRealMinutes` too, which never touches the
 *   control.
 *
 * At x1 there is nothing to re-assert - x1 is what everything drops TO - so
 * the walk is the single run it always was.
 */
export async function runSimMinutes(
  page: Page,
  minutes: number,
  speed: Speed = 4,
): Promise<void> {
  await setSpeed(page, speed);

  const start = speed === 1 ? null : await simTick(page);

  if (start === null) {
    await page.clock.runFor(realMs(minutes, speed));
    return;
  }

  const target = start + minutes;

  for (let pass = 0, at = start; pass < SPEED_PASSES; pass += 1) {
    await page.clock.runFor(realMs(target - at, speed));

    const now = await simTick(page);

    // Arrived, or the clock is not moving at all - which is a fact about the
    // day (paused, clocked off, nobody at the desk) rather than about the
    // speed, and not this helper's to argue with.
    if (now === null || now >= target || now <= at) {
      return;
    }

    at = now;
    await setSpeed(page, speed);
  }

  throw new Error(
    `The clock would not reach minute ${String(target)}: the speed was put `
    + `back down ${String(SPEED_PASSES)} times.`,
  );
}

/**
 * Real time, spent WITHOUT touching the speed control.
 *
 * The counterpart to `runSimMinutes` and the other half of its contract: the
 * argument is the minutes that stretch of real time would buy at `speed` if
 * nothing interrupted, which is exactly what the caller wants when the point
 * is that something might. Two kinds of test use it - the ones that are about
 * the clock changing under the player, and the ones that step towards an event
 * and stop when they find it, where re-asserting a speed would be putting the
 * control back up in the same moment the game deliberately put it down.
 */
export async function runRealMinutes(
  page: Page,
  minutes: number,
  speed: Speed = 4,
): Promise<void> {
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

    // Two minutes that ARE two minutes: an interruption earlier in the
    // morning puts the clock back to x1, and a search whose step quietly
    // became thirty seconds would run out of patience a quarter of the way
    // down the corridor and report a lead who never came.
    await runSimMinutes(page, 2, 4);
  }

  throw new Error('The lead never came down the corridor.');
}

/**
 * Which build the update window says was installed, read off its own masthead.
 *
 * It exists so that a test can name the newest release without knowing which
 * release is newest. Asserting a phrase out of the top note is an assertion
 * that every release has to come back and rewrite, and a release note written
 * to keep a test green is a changelog with a test in it.
 */
export async function installedVersion(page: Page): Promise<string> {
  const banner = await page.getByTestId('updates-installed').innerText();
  const version = /Update (\d+\.\d+\.\d+) has been installed/u.exec(banner);

  if (version?.[1] === undefined) {
    throw new Error(`The update window says: "${banner}"`);
  }

  return version[1];
}

/**
 * Walks the clock forward until a ticket has actually arrived in the queue.
 *
 * Deliberately a search rather than the minute the week's table says, and the
 * reason is the same one `runToTelegraph` has: a drip slot is a NOMINAL minute
 * and `buildDaySchedule` moves it by up to `DRIP_JITTER` either way, so the
 * ticket the table puts at 09:40 lands at 09:51 on this seed and somewhere
 * else on the next one. A test that waits for the table's minute is a test
 * that passes on one seed and is a coin toss on every other.
 *
 * Ten minutes a step, which is coarse on purpose and cannot miss anything: an
 * arrival is PERMANENT - the row stays in the queue once it is there - where
 * the lead in the corridor is a four-minute window that has to be caught.
 *
 * It leaves the queue open, because the queue is where a ticket arriving is
 * visible and because every caller wants to look at it anyway.
 */
export async function workUntilTicket(
  page: Page,
  slug: string,
  limitMinutes = 300,
): Promise<void> {
  await openFromStartMenu(page, 'tickets');
  const row = page.getByTestId(`ticket-row-${slug}`);

  for (let minute = 0; minute < limitMinutes; minute += 10) {
    if (await row.count() > 0) {
      return;
    }

    // Ten minutes that ARE ten minutes. The control used to be clicked once
    // outside this loop, because a loop that reached for a taskbar button
    // every step is a loop that fails the day one of the day's own screens is
    // over the taskbar - but a speed set once is a speed the first ringing
    // phone takes away, and a search that then covers a quarter of the hours
    // it says it does reports a ticket that never arrived. The helper reads
    // the control before it touches it, so the button is only reached for on
    // the steps where the day actually moved it.
    await runSimMinutes(page, 10, 4);
  }

  throw new Error(`"${slug}" never arrived in the queue.`);
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

/**
 * What the terminal is prompting with right now.
 *
 * Read rather than assumed, because the prompt follows the working directory:
 * a session that has typed `cd` is echoing a different line back, and a helper
 * that waited for `C:\SUPPORT>` would wait for ever.
 */
export async function promptText(page: Page): Promise<string> {
  // `textContent` rather than `innerText`: a terminal that has been minimised
  // behind the panic key is still the terminal, and what it is prompting with
  // is not a question about whether it is on screen.
  return (await page.locator('.cmd-prompt').first().textContent() ?? '').trim();
}

/**
 * Runs one line in the Support Terminal and waits for it to echo back.
 *
 * It waits for the line AS TYPED, which is what makes it survive the fumble.
 * Past eighty stress the terminal prints what your hands did, says out loud
 * that the typo was cosmetic, and then echoes and runs the line you actually
 * typed - so a journey that types a path on a Friday of a week nobody worked
 * sees three lines where it expected one, and the third is this one. Any
 * assertion that a string is ABSENT has to allow for the other two, which is
 * why `runOnlyCommand` exists and why every absence check in the file specs is
 * made on a screen holding one command's echoes and nothing else.
 */
export async function runCommand(page: Page, line: string): Promise<void> {
  const prompt = await promptText(page);
  const input = page.getByTestId('cmd-input');
  await input.fill(line);
  await input.press('Enter');
  await expect(page.getByTestId('cmd-output')).toContainText(
    `${prompt} ${line}`,
  );
}

/**
 * The same, with the screen cleared first.
 *
 * `cmd-output` is the whole SCROLLBACK, so an assertion that the terminal does
 * not say something is an assertion about every line typed in that window this
 * session - which passes and fails for reasons that have nothing to do with
 * the command under test. Anything asserting an absence, or reading the state
 * of a list that changes between two runs of the same command, types it
 * through here so the screen holds one answer.
 */
export async function runOnlyCommand(page: Page, line: string): Promise<void> {
  // `cls` is typed rather than run through `runCommand`: that helper waits for
  // the line to be echoed back, and clearing the screen removes its own echo
  // along with everything else. Waiting for it is waiting forever.
  const prompt = await promptText(page);
  const input = page.getByTestId('cmd-input');
  await input.fill('cls');
  await input.press('Enter');
  await expect(page.getByTestId('cmd-output')).not.toContainText(prompt);

  await runCommand(page, line);
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

/* -- the badge and the door ---------------------------------------------- */

/**
 * Asks the log-on screen for a badge number and reads back the one it was
 * given.
 *
 * The badge is read off the FIELD rather than out of a cookie, because the
 * cookie is HttpOnly and unreadable by design - being shown the number once,
 * on screen, is the only way a player ever learns it, so it is the only way a
 * test should learn it either.
 */
export async function issueBadge(page: Page): Promise<string> {
  await expect(page.getByTestId('login-screen')).toBeVisible();
  await page.getByTestId('login-issue-badge').click();

  const issued = page.getByTestId('login-badge-issued');
  await expect(issued).toContainText('Write it down');
  await expect(page.getByTestId('login-badge')).toHaveValue(/^WG-\d{4}-[A-Z]{2}$/);

  return page.getByTestId('login-badge').inputValue();
}

/** Logs on as a badge that was issued somewhere else. */
export async function logOnWithBadge(
  page: Page,
  badge: string,
): Promise<void> {
  await expect(page.getByTestId('login-screen')).toBeVisible();
  await page.getByTestId('login-badge').fill(badge);
  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('desktop')).toBeVisible();
}

/**
 * The whole world in sixteen characters, which is the only honest way to ask
 * "is this the same week" across two browsers.
 */
export async function worldHash(page: Page): Promise<string> {
  return page.evaluate(
    () => (globalThis as { careerSim?: { hash(): string } }).careerSim?.hash()
      ?? '',
  );
}

export async function zIndexOf(page: Page, appId: string): Promise<number> {
  const value = await page
    .getByTestId(`window-${appId}`)
    .getAttribute('data-z');

  return Number(value);
}
