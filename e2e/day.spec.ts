import { expect, type Page, test } from '@playwright/test';

import {
  completeLogin,
  logInOnDay,
  openFromStartMenu,
  runCommand,
  underPause,
} from './helpers';
import { FIRST_EMPLOYER } from '../src/world/employers';
import { dayLoad } from '../src/world/load';
import { loadReading } from '../src/world/load-voice';
import { dayScript } from '../src/world/week';
import { findWorldTicket } from '../src/world/tickets';
import { OFFICE } from './office';

/**
 * What the brief should be saying about a day of the probation week, derived
 * rather than typed out (E11, 0.34.0 slice 3).
 *
 * The chain the assertion is about is `dayLoad` -> band -> the shop's voice, so
 * the test walks the same chain rather than pinning the sentence: a week table
 * that is edited, or a seed that moves a day about, moves this with it, and a
 * brief that stopped reading the arithmetic still goes red.
 */
function readingFor(day: number): string {
  const said = loadReading(
    FIRST_EMPLOYER,
    dayLoad(dayScript(day), findWorldTicket).load,
  );

  if (said === null) {
    throw new Error(`No reading is written for day ${String(day)}.`);
  }

  return said;
}

function minutesOf(time: string): number {
  const [hours, mins] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (mins ?? 0);
}

/** One driver interval: `main.ts` runs `setInterval(step, 250)`. */
const DRIVER_STEP_MS = 250;

/**
 * Runs the clock to a target minute, then reads it held - exactly at x1 (and at
 * the frozen day end), and within a ±1 band at x4.
 *
 * The driver is `setInterval(step, 250)`, and `page.clock.runFor(250)` fires
 * that faked interval 0, 1 OR 2 times depending on where its phase falls in the
 * window. At x1 a single fire is a quarter of a tick, so a step lands ON a minute
 * boundary and never overshoots it - the exact minute is deterministic. At x4 a
 * single fire is a whole simulated minute, so a 250ms step can advance 0 or 2
 * minutes, and NO stepping arithmetic can land a phase-exact minute: the
 * granularity of the faked interval clock at x4 is itself ±1. This is confirmed
 * by isolation (an x4 exact read fails 2 of 3 `--repeat-each` runs on its own).
 *
 * So the read is matched to what the clock can guarantee. Convergence is still
 * read-driven - a coarse run to a few minutes short, then single-interval steps
 * watching the real clock until it reaches the target - and then:
 * - at x1, and at the day end where the WORLD has stopped the clock at exactly
 *   17:00, the minute is exact and asserted exactly;
 * - at x4 the clock is asserted WITHIN ±1 of the target, which is the faked
 *   interval's granularity rather than slop being hidden.
 *
 * Teeth hold either way. The thing under test is that the speed scaled real time
 * into about the right number of ticks: a broken speed (x1 where x4 was asked)
 * or an overspending tick moves the clock by MANY minutes, far outside
 * target-1..target+1, and reds; and the x1 reads, being phase-exact, red on a
 * single tick of drift.
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

  // Coarse: a GENEROUS margin short of the target. A big runFor fires the faked
  // interval a whole number of times and can overshoot its own aim by several
  // minutes - that overshoot, not the fine loop, was the flake (a coarse run
  // aimed 3 short landed 6 PAST target, so the fine loop stopped on the first
  // read, already over). Leaving a wide margin keeps even a bad coarse overshoot
  // below the target, where the deterministic single-interval loop carries it up
  // exactly. When the gap is inside the margin, the coarse run is skipped and the
  // fine loop does the whole approach - it is bounded well above what that needs.
  const COARSE_MARGIN_MIN = 10;
  const start = await now();

  if (targetMin - start > COARSE_MARGIN_MIN) {
    await page.clock.runFor(realMs(targetMin - start - COARSE_MARGIN_MIN, speed));
  }

  // Fine: one driver interval at a time, watching the actual clock, until it
  // reaches the target. At x1 this lands exactly on the minute; at x4 it lands
  // on the minute or one past it, which the band below expects. Bounded well
  // above the four-fires-per-minute a slow speed needs.
  let current = await now();

  for (let guard = 0; guard < 80 && current < targetMin; guard += 1) {
    await page.clock.runFor(DRIVER_STEP_MS);
    current = await now();
  }

  const ended = await page.getByTestId('day-state')
    .getAttribute('data-state') === 'day_end';

  // The day end freezes the clock at exactly the shift's close, so the read is
  // exact and needs no pause - and pausing a day-end scorecard is a click it
  // does not need.
  if (ended) {
    await expect(clock).toHaveText(target);
    return;
  }

  // x1 is phase-exact (a quarter-tick step cannot overshoot a minute), so the
  // exact minute is asserted, held so a retry cannot race a live clock off it.
  if (speed === 1) {
    await underPause(page, async () => {
      await expect(clock).toHaveText(target);
    });
    return;
  }

  // x4: within one minute of the target. A 250ms step fires the faked interval
  // 0, 1 or 2 times, so the landing is the target or one past it - the interval
  // granularity at x4, not slop. The band still reds a genuinely broken speed,
  // which is off by many minutes. Held so the band is read off a stopped clock.
  await underPause(page, async () => {
    const landed = await now();

    expect(
      Math.abs(landed - targetMin),
      `the x4 clock landed at ${await clock.textContent() ?? '??'}, more than a `
      + `minute from ${target}`,
    ).toBeLessThanOrEqual(1);
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
  await page.goto(OFFICE);
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

  // How heavy the day looks, in the lead's own words and as a band rather than
  // a figure - the reading is what the week's arithmetic makes of Monday, and
  // it is a reading of the SCHEDULE: nothing on it about the rounds, the pings
  // or the favours the day has not asked for yet.
  const reading = page.getByTestId('brief-load');
  await expect(reading).toHaveText(readingFor(1));
  await expect(reading).not.toContainText(/\d|walk-?up|ping|ticket/i);

  // Starting the shift skips whatever is left of the morning. The HOUR is what
  // is asserted, not the minute: the clock is running from the moment the shift
  // opens (the contract in `helpers.ts` - `install()` never stopped it), so a
  // read pinned to 09:00 is a read racing the first tick of the shift. Nine
  // o'clock is still the whole claim - a morning that was not skipped is at
  // 08-something and stays there for the best part of an hour.
  await page.getByTestId('brief-start-shift').click();
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^09:/);
  await expect(page.getByTestId('day-state')).toHaveText('Shift');
  await expect(page.getByTestId('brief-start-shift')).toBeDisabled();

  // And it does not move when the shift starts: the brief is a morning
  // surface, and the day weighs what it weighs however much of it is left.
  await expect(reading).toHaveText(readingFor(1));

  await page.getByTestId('close-brief').click();
  await expect(brief).toHaveCount(0);

  // Pause stops the conversion of real time; nothing else about the world
  // changes, and the clock does not creep. What pause promises is that the
  // clock does not MOVE, not that it is any particular minute - getting to the
  // button costs a couple of them - so the minute it was caught on is captured
  // and the ten that follow are asserted against that.
  const pause = page.getByTestId('day-pause');
  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('day-state')).toHaveText('Shift · paused');

  const stopped = (await page.getByTestId('sim-clock-time').textContent())
    ?.trim() ?? '';

  await page.clock.runFor(realMs(10, 1));
  await expect(page.getByTestId('sim-clock-time')).toHaveText(stopped);

  // AND THE WORK IS IN THE CLOCK (W-10, 0.42.0). The walk emptied a queue
  // with the day stopped - a triage filed, four commands run, an account
  // unlocked, "Ticket resolved, Day 1 08:01" - which beats every clock in
  // this game with one taskbar control. Reading stays open; anything that
  // would change the world waits for the minutes.
  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'services PRINT-01');
  // A read, under the pause, exactly as before: this is what a pause is for.
  await expect(page.getByTestId('cmd-output'))
    .toContainText('Services on PRINT-01');

  await runCommand(page, 'unlock gpoole');
  await expect(page.getByTestId('cmd-output'))
    .toContainText('The clock is stopped, and so is the work');
  await expect(page.getByTestId('cmd-output')).not.toContainText('unlocked');

  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'false');

  // And the same command, with the clock running, does the thing it always
  // did - the rule is about the minute, not about the verb.
  await runCommand(page, 'unlock gpoole');
  await expect(page.getByTestId('cmd-output')).toContainText('unlocked');
  await page.getByTestId('close-cmd').click();

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

  // AND IT OPENS AT THE TOP OF ITSELF. The evening screen is taller than the
  // window it arrives in, its one button is the last thing in it, and the
  // shell puts the keyboard on that button as the window mounts - so a plain
  // focus() asked the browser to bring "Clock off" into view and took the
  // whole pane down with it. What the player got was the back half of a
  // sentence about their file; the work and the payslip - the two panels the
  // evening exists to show - were above the fold with nothing on screen saying
  // there was a fold. Geometry rather than toBeVisible(), the 0.35.1 rule:
  // attached with a box is not seen. The heading sits inside the window's own
  // visible box, and the pane it lives in has not been scrolled off its start.
  const headingBox = await page.getByTestId('scorecard-heading').boundingBox();
  const scorecardBox = await scorecard.boundingBox();
  expect(headingBox).not.toBeNull();
  expect(scorecardBox).not.toBeNull();
  expect(headingBox?.y ?? 0).toBeGreaterThanOrEqual(scorecardBox?.y ?? 0);
  expect(headingBox?.y ?? 0)
    .toBeLessThanOrEqual((scorecardBox?.y ?? 0) + (scorecardBox?.height ?? 0));
  expect(await page.getByTestId('scorecard-app').evaluate(
    (pane) => pane.scrollTop,
  )).toBe(0);
  // The keyboard still landed where it belongs - the fix is where the browser
  // scrolls, not where the cursor goes.
  await expect(page.getByTestId('scorecard-clock-off')).toBeFocused();
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
  await page.goto(OFFICE);
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

  // The actual minute at the moment of saving, captured rather than hardcoded.
  // The subject of this test is "a reload brings the same session back", which
  // is true whether the shift settled onto 09:35 or a tick either side of it -
  // the restore is compared to what was SAVED, so it proves restore == saved
  // exactly, decoupled from where the clock happened to land.
  const savedClock = await page.getByTestId('sim-clock-time').textContent() ?? '';
  expect(savedClock).toMatch(/^\d\d:\d\d$/);

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-save').click();
  await expect(page.getByTestId('toast')).toContainText('Game saved');

  // A reload comes back into the shift it left (#61, 0.41.0). It used to be a
  // new session at 08:00 with nothing read, which is what the load below then
  // had to undo; now the boot resumes through that same loader and arrives
  // mid-morning.
  //
  // The HOUR rather than the minute, because the clock is running again the
  // instant there is a desktop and this assertion is not holding it - the
  // exact minute is read after the load below, where it has just been put
  // back. Nine-something is not a value both worlds could have: a session that
  // had restarted would be at eight on a morning brief.
  await page.reload();
  await completeLogin(page);
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^09:/);
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 1');
  await expect(page.getByTestId('day-state')).toHaveText('Shift');

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Game loaded' }),
  ).toHaveCount(1);

  // The same minute the save was taken on - whatever it was - in the same day
  // and the same state.
  await expect(page.getByTestId('sim-clock-time')).toHaveText(savedClock);
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 1');
  await expect(page.getByTestId('day-state')).toHaveText('Shift');

  // The same queue, still open, with the same ticket in it.
  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('ticket-row-locked-account')).toBeVisible();
  await page.getByTestId('ticket-row-locked-account').click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Open');

  // And the brief, reopened after the reload, is still weighing the same day.
  // It is derived from the week's table rather than carried in the file, which
  // is why nothing had to be added to the save for it - and why a load that
  // came back on the wrong day would say so here.
  await page.getByTestId('day-state').click();
  await expect(page.getByTestId('brief-load')).toHaveText(readingFor(1));
  await page.getByTestId('close-brief').click();

  // And the shell's own memory: the mail that was read is still read.
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
  await page.goto(OFFICE);
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
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^09:/);

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(page.getByTestId('toast')).toContainText('Not loaded');
  await expect(page.getByTestId('toast')).toContainText('newer build');

  // Where it was, which is a shift in the nine o'clock hour rather than a
  // particular minute of one: the clock ran through the menu and the two
  // notices above, because a running clock is exactly what the refusal has to
  // leave alone. A session the load HAD taken with it is back at 08-something
  // on a morning brief, which this still reds on.
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^09:/);
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
