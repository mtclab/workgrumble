import { expect, type Page, test } from '@playwright/test';

import { completeLogin, logInOnDay, openFromStartMenu } from './helpers';

/**
 * The house pattern (#15). An `expect` retries in REAL time while a raw speed
 * run advances the fake clock in SIM time, so an assertion that pins an EXACT
 * minute can be retried against a clock that has moved on under full-suite
 * parallel load - the +20/+40 fingerprint. Held under a pause, the read is
 * taken with the day stopped, which is a control the player has and one this
 * test does not otherwise touch.
 *
 * It holds ONLY the read. The runFor before it has already produced the
 * transition the raw run exists to prove, so a tick that overspends still lands
 * the clock on the wrong minute and this still reds on it - the pause stops the
 * clock from moving further, not the assertion from seeing where it got to.
 *
 * Idempotent: a read taken inside another pause must not start the clock again
 * on its way out.
 */
async function underPause<T>(page: Page, read: () => Promise<T>): Promise<T> {
  const pause = page.getByTestId('day-pause');
  const already = await pause.getAttribute('aria-pressed') === 'true';

  if (!already) {
    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
  }

  try {
    return await read();
  } finally {
    if (!already) {
      await pause.click();
      await expect(pause).toHaveAttribute('aria-pressed', 'false');
    }
  }
}

function minutesOf(time: string): number {
  const [hours, mins] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (mins ?? 0);
}

/**
 * Runs the clock to land EXACTLY on a minute, then reads it held.
 *
 * The driver is `setInterval(step, 250)`, and a big `page.clock.runFor` can
 * cross one interval boundary more or fewer than the arithmetic expects when the
 * faked clock's phase has drifted under a click or a retry - the read then sits
 * one tick past the transition it was meant to pin (12:01 for 12:00). So the
 * approach is split: a coarse run to five minutes short, then one simulated
 * minute at a time. Each fine step is a single interval, so the phase stays
 * aligned and the clock arrives ON the target minute rather than a tick beyond
 * it, whatever the coarse run drifted to. The read is then taken under a pause,
 * so a retry cannot race it forward off the minute it landed on.
 *
 * Teeth are untouched: a tick that overspends drives the coarse run clean past
 * the target, the fine loop takes no steps, and the held read reds on a clock
 * that is nowhere near the minute it was told to be.
 */
async function settleAtClock(
  page: Page,
  target: string,
  speed: number,
): Promise<void> {
  const clock = page.getByTestId('sim-clock-time');
  const targetMin = minutesOf(target);
  const now = async (): Promise<number> => minutesOf(
    await clock.textContent() ?? '00:00',
  );

  const start = await now();

  if (targetMin - start > 5) {
    await page.clock.runFor(realMs(targetMin - start - 5, speed));
  }

  for (let guard = 0; guard < 12 && (await now()) < targetMin; guard += 1) {
    await page.clock.runFor(realMs(1, speed));
  }

  // Once the day has ended the world itself has stopped the clock, so the read
  // is already stable and there is no live clock to hold - and pausing a day-end
  // scorecard is a click this does not need. Otherwise the read is held under a
  // pause so a retry cannot race a running clock forward off the minute.
  const ended = await page.getByTestId('day-state')
    .getAttribute('data-state') === 'day_end';

  if (ended) {
    await expect(clock).toHaveText(target);
    return;
  }

  await underPause(page, async () => {
    await expect(clock).toHaveText(target);
  });
}

/**
 * Real milliseconds one simulated minute costs at x1 (`day-driver.ts`). The
 * driver is asked to convert four times a second and keeps the remainder, so
 * at x4 a quarter-second is exactly one minute.
 */
const TICK_MS = 1_000;

/** Fake real time that buys `minutes` simulated minutes at `speed`. */
function realMs(minutes: number, speed: number): number {
  return (minutes * TICK_MS) / speed;
}

/**
 * The day loop, end to end on the built artifact: the brief that is waiting
 * when you log on, the shift the player starts, the clock they can stop and
 * hurry, and the scorecard that is written at 17:00.
 *
 * This is the one walk in the suite that buys its minutes straight off the
 * clock rather than through the house helper, and it is deliberate: it is the
 * SPEED CONTROL'S own spec, so a helper that re-asserted a speed would be
 * standing between the assertion and the thing it is about. It is safe to do
 * that on exactly this day - the Monday authors no interruptions, nothing is
 * left on the screen to be caught at, and the scorecard at the bottom says
 * `0` catches out loud, which is the proof rather than the assumption.
 */
test('walks a day from the morning brief to the scorecard', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });

  // The brief is put up by the day itself, not fetched from a menu.
  const brief = page.getByTestId('window-brief');
  await expect(brief).toBeVisible();
  await expect(page.getByTestId('brief-heading')).toContainText('Day 1');
  await expect(page.getByTestId('brief-mail-subject')).not.toBeEmpty();
  // Two, which is the most a morning may hand anybody: the week drips the
  // rest of the day's work in while it is being worked.
  await expect(page.getByTestId('brief-queue-list').getByRole('listitem'))
    .toHaveCount(2);
  await expect(page.getByTestId('day-state')).toHaveText('Morning brief');
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^08:/);

  // Starting the shift skips whatever is left of the morning.
  await page.getByTestId('brief-start-shift').click();
  await expect(page.getByTestId('sim-clock-time')).toHaveText('09:00');
  await expect(page.getByTestId('day-state')).toHaveText('Shift');
  await expect(page.getByTestId('brief-start-shift')).toBeDisabled();

  await page.getByTestId('close-brief').click();
  await expect(brief).toHaveCount(0);

  // Pause stops the conversion of real time; nothing else about the world
  // changes, and the clock does not creep.
  const pause = page.getByTestId('day-pause');
  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('day-state')).toHaveText('Shift · paused');
  await page.clock.runFor(realMs(10, 1));
  await expect(page.getByTestId('sim-clock-time')).toHaveText('09:00');

  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
  // The clock runs again, and the exact minute is landed and read held rather
  // than read off a bare runFor that can drift a tick either way.
  await settleAtClock(page, '09:10', 1);

  // Speed scales real time into ticks and nothing else.
  await page.getByTestId('day-speed-4').click();
  await expect(page.getByTestId('day-speed-4')).toHaveAttribute(
    'data-active',
    'true',
  );
  // Landed exactly on the minute and read held: the coarse run proves the speed
  // moved the clock, the fine steps pin it to the transition rather than a tick
  // past it, and the pause stops a retry racing it forward.
  await settleAtClock(page, '09:30', 4);

  // Lunch is flagged on the clock strip - lane B hangs the boss's habits on
  // the same window.
  await settleAtClock(page, '12:00', 4);
  await expect(page.getByTestId('day-state')).toHaveText('Lunch');

  await page.clock.runFor(realMs(30, 4));
  await expect(page.getByTestId('day-state')).toHaveText('Shift');

  // And on to 17:00, where the day ends whether or not the queue is empty. The
  // day-end cap would hold an overshoot, but a runFor that lands a tick SHORT
  // reads 16:59, so this is settled onto the exact minute like the rest.
  await settleAtClock(page, '17:00', 4);
  await expect(page.getByTestId('day-state')).toHaveText('Day end');

  const scorecard = page.getByTestId('window-scorecard');
  await expect(scorecard).toBeVisible();
  await expect(page.getByTestId('scorecard-heading')).toContainText(
    'Day 1, clocking off',
  );
  // Two inherited, the one that dripped in at eight minutes past ten, and the
  // one the lead raised by mentioning it at 11:49.
  await expect(page.getByTestId('scorecard-arrived')).toHaveText('5');
  await expect(page.getByTestId('scorecard-caught')).toContainText('0 ·');
  await expect(page.getByTestId('scorecard-consumables')).toContainText('£0.00');
  await expect(page.getByTestId('scorecard-net')).toContainText('£');
  // The pressure layer's own numbers, measured rather than promised.
  await expect(page.getByTestId('scorecard-stress')).toContainText(' of 100');
  await expect(page.getByTestId('scorecard-suspicion')).toContainText(' of 100');
  await expect(page.getByTestId('scorecard-reputation')).not.toContainText(
    'Not measured',
  );
  // And the one number the probation actually turns on, on the screen from
  // the first evening rather than for the first time at three o'clock on the
  // Friday: a percentage of the work, with the bar it has to clear said next
  // to it. A mark nobody sees until the verdict is a mark nobody can have
  // played toward.
  await expect(page.getByTestId('scorecard-week'))
    .toContainText(/^\d+ of 100, and 45 is the pass · /);

  // The clock is stopped at the day end: the scorecard waits to be read.
  await page.clock.runFor(realMs(60, 4));
  await expect(page.getByTestId('sim-clock-time')).toHaveText('17:00');

  // Clocking off banks the day and opens tomorrow's brief.
  await page.getByTestId('scorecard-clock-off').click();
  await expect(scorecard).toHaveCount(0);
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 2');
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^08:/);
  await expect(page.getByTestId('window-brief')).toBeVisible();
  await expect(page.getByTestId('brief-heading')).toContainText('Day 2');

  // The boundary wrote its own save on the way through - the cheapest one
  // there is, taken the moment the dispatch log was checkpointed.
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Game loaded' }),
  ).toHaveCount(1);
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 2');
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^08:/);
});

/**
 * A save is only worth anything if a reload puts the player back where they
 * were - the same minute, the same queue, and the same conversation they were
 * halfway through. This drives the whole loop: work, save, reload the PAGE,
 * load, and check the session came back rather than restarted.
 */
test('keeps a mid-day session across a page reload', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page);

  // Start the shift from the taskbar's own way back into the brief.
  await page.getByTestId('day-state').click();
  await expect(page.getByTestId('window-brief')).toBeVisible();
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();

  await settleAtClock(page, '09:35', 1);

  // Do something the world will remember, and something only the shell will.
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-locked-account').click();
  await expect(page.getByTestId('ticket-detail-title')).toBeVisible();

  await openFromStartMenu(page, 'mail');
  await page.getByTestId('mail-row-queue-nag').click();
  // Three of the four left unread: the fourth is the sync booked from the
  // Monday, which is in this inbox from 0.3.0 onwards.
  await expect(page.getByTestId('mail-summary')).toContainText('3 unread');

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-save').click();
  await expect(page.getByTestId('toast')).toContainText('Game saved');

  // A reload is a new session: fresh world, 08:00, nothing read.
  await page.reload();
  await completeLogin(page);
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^08:/);

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Game loaded' }),
  ).toHaveCount(1);

  // The same minute, in the same day, in the same state.
  await expect(page.getByTestId('sim-clock-time')).toHaveText('09:35');
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 1');
  await expect(page.getByTestId('day-state')).toHaveText('Shift');

  // The same queue, still open, with the same ticket in it.
  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('ticket-row-locked-account')).toBeVisible();
  await page.getByTestId('ticket-row-locked-account').click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Open');

  // And the shell's own memory: the mail that was read is still read.
  await openFromStartMenu(page, 'mail');
  await expect(page.getByTestId('mail-summary')).toContainText('3 unread');
  await expect(page.getByTestId('mail-row-queue-nag')).toHaveAttribute(
    'data-unread',
    'false',
  );

  // The clock is a live clock afterwards, not a photograph: it advances, and
  // the exact minute is landed and held rather than read off a bare runFor.
  await settleAtClock(page, '09:40', 1);
});

/** A refused load leaves the running session exactly where it was. */
test('refuses a damaged save without taking the session with it', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page);

  await page.evaluate(() => {
    window.localStorage.setItem(
      'workgrumble/save',
      JSON.stringify({ schema: 99, engine: '{}' }),
    );
  });

  await page.getByTestId('day-state').click();
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
  await expect(page.getByTestId('sim-clock-time')).toHaveText('09:00');

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(page.getByTestId('toast')).toContainText('Not loaded');
  await expect(page.getByTestId('toast')).toContainText('newer build');

  await expect(page.getByTestId('sim-clock-time')).toHaveText('09:00');
  await expect(page.getByTestId('day-state')).toHaveText('Shift');
});

/**
 * The after-hours ping tail (slice 0.3.6, Part 1), on the shipped path.
 *
 * A day does not end when the shift does: a ping lands overnight and is read on
 * the next morning's "while you were out" surface. The journey is the whole of
 * it - the ping is there on Tuesday's brief, answering it strikes it through and
 * takes the button away, and the trade it carries is the world's business, which
 * the unit walk pins. Reached by playing Monday out and clocking off into
 * Tuesday, which is the only way a next-morning surface can be reached.
 */
test('a ping that landed overnight is read and answered next morning', async ({
  page,
}) => {
  await logInOnDay(page, 2, { brief: 'keep' });

  // Tuesday's brief, with Monday night's ping on the overnight surface.
  const night = page.getByTestId('brief-night');
  await expect(night).toBeVisible();
  await expect(night).toContainText('While you were out');

  const item = page.getByTestId('brief-night-owen-monitor');
  await expect(item).toHaveAttribute('data-answered', 'false');

  const answer = page.getByTestId('brief-night-answer-owen-monitor');
  await expect(answer).toBeVisible();
  await answer.click();

  // Answered: the button is gone and the ping is struck through, kept on the
  // list rather than vanishing.
  await expect(answer).toHaveCount(0);
  await expect(item).toHaveAttribute('data-answered', 'true');
});
