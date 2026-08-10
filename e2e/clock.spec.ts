import { expect, type Page, test } from '@playwright/test';

import { completeLogin, openFromDesktopIcon } from './helpers';

/** Real milliseconds per simulation minute (`main.ts`). */
const TICK_MS = 1_000;

/** Simulation ticks a toast survives (`notifications.ts`). */
const TOAST_TTL_TICKS = 10;

/**
 * The taskbar's minute and the fake wall clock behind it, in ONE read.
 *
 * Both halves have to come off the same paint or the comparison below is
 * comparing two different moments: `page.clock.install()` leaves the fake clock
 * syncing with real time (the contract in `helpers.ts`), so every round trip
 * between here and the page is itself a stretch of the day.
 */
async function readClock(page: Page): Promise<{ face: string; wall: number }> {
  return page.evaluate(() => ({
    face: document
      .querySelector('[data-testid="sim-clock-time"]')
      ?.textContent
      ?.trim() ?? '',
    wall: Date.now(),
  }));
}

function minutesOf(face: string): number {
  const [hours, minutes] = face.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** The tick the running session is on. */
async function tickOf(page: Page): Promise<number> {
  return page.evaluate(() => globalThis.careerSim?.tick() ?? 0);
}

/**
 * Runs the clock to a tick of the day, READING before every jump.
 *
 * The same answer `runSimMinutes` gives one floor down: a fixed jump is not a
 * fixed number of minutes, because the fake clock is syncing with real time
 * either side of it and the round trips are minutes too. So this asks the
 * session where it actually is and buys what is still owed, which is the only
 * way to arrive ON a tick rather than somewhere after it.
 */
async function runToTick(page: Page, target: number): Promise<void> {
  for (let pass = 0; pass < 8; pass += 1) {
    const now = await tickOf(page);

    if (now >= target) {
      return;
    }

    await page.clock.runFor((target - now) * TICK_MS);
  }

  throw new Error(`The clock would not reach tick ${String(target)}.`);
}

/**
 * The taskbar clock reads simulation time, and the wiring that feeds it - sim
 * tick to formatter to taskbar - is invisible when it breaks: a frozen clock
 * looks exactly like a clock. Fake timers drive it so the assertion is on the
 * wiring rather than on how fast the machine running the test happens to be.
 *
 * THE RATE IS MEASURED RATHER THAN ASSUMED, which is this test's whole shape
 * and the reason it does not pin a minute. `install()` does not stop the clock,
 * so the minutes the taskbar shows are the minutes `runFor` bought PLUS every
 * real second the assertions themselves spent - and a test that pinned 09:00
 * was quietly asserting that its own round trips were free. Held against the
 * page's own fake wall clock the claim is the honest one and a sharper one: a
 * simulated minute per real second, within the single tick the driver's
 * quarter-second interval can be out by. A clock that has stopped, or one
 * running at four times the speed, is out by many.
 */
test('advances the taskbar clock by one sim minute per real second', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page);

  const clock = page.getByTestId('sim-clock-time');
  await expect(clock).toHaveText(/^08:0\d$/);
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 1');

  const started = await readClock(page);

  // One second is one minute ON THE TASKBAR: the strip repaints per minute
  // rather than in a batch at the end of an hour, which is the half of the
  // wiring an hour-long run cannot see.
  await page.clock.runFor(TICK_MS);
  await expect(clock).not.toHaveText(started.face);

  await page.clock.runFor(TICK_MS * 59);
  await expect(clock).toHaveText(/^09:/);
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 1');

  const ended = await readClock(page);
  const minutes = minutesOf(ended.face) - minutesOf(started.face);
  const seconds = Math.round((ended.wall - started.wall) / 1000);

  expect(
    Math.abs(minutes - seconds),
    `the taskbar moved ${String(minutes)} minute(s) across `
    + `${String(seconds)} second(s), from ${started.face} to ${ended.face}`,
  ).toBeLessThanOrEqual(1);
});

/**
 * A toast is an interruption with a deadline: it leaves on its own, and the
 * record it leaves behind is the notification centre's, not the toast's.
 *
 * The deadline is walked with a TICK the session is asked for rather than with
 * a jump the test assumes is all that moved - the clock runs through every
 * assertion, so a toast chased with nine bought minutes was being read at nine
 * minutes plus however long the reading took. The exact boundary (surviving
 * `TTL - 1` and gone at `TTL`) is `expireToasts`' own, pinned in
 * `notifications.test.ts` where a tick is a tick; what a browser is for is that
 * a toast raised on the shipped path really goes on the simulated clock and
 * really leaves its record behind.
 */
test('expires a toast on its TTL while the record survives', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page);
  await openFromDesktopIcon(page, 'about');

  // Read BEFORE the click, so the raise cannot have happened earlier than this
  // tick: the two reads below are a tick either side of the deadline rather
  // than balanced on it, which is the band the round trips make honest.
  const before = await tickOf(page);
  await page.getByTestId('about-run-diagnostics').click();
  const toasts = page.getByTestId('toast');
  await expect(toasts).toHaveCount(1);

  // Inside the window it is still on screen.
  await runToTick(page, before + TOAST_TTL_TICKS - 2);
  await expect(toasts).toHaveCount(1);

  // And past it, it is gone on its own - nobody dismissed this one.
  await runToTick(page, before + TOAST_TTL_TICKS + 1);
  await expect(toasts).toHaveCount(0);

  // Gone from the screen, still on the books: the badge never read it.
  await expect(page.getByTestId('notification-badge')).toHaveAttribute(
    'data-unread',
    '1',
  );
  await page.getByTestId('notification-tray').click();
  await expect(page.getByTestId('notification-panel')).toContainText(
    'Diagnostics complete',
  );
  await expect(page.getByTestId('notification-panel-item')).toHaveCount(1);
  await expect(page.getByTestId('notification-badge')).toHaveAttribute(
    'data-unread',
    '0',
  );
});
