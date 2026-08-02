import { expect, test } from '@playwright/test';

import {
  activeElement,
  beginShift,
  clockOffFor,
  completeLogin,
  focusWindow,
  logInOnDay,
  openFromStartMenu,
  runCommand,
  runOnlyCommand,
  runRealMinutes,
  runSimMinutes,
  workUntil,
  workUntilMinute,
} from './helpers';

/**
 * Being taken off the work, on the built artifact, through the real entry
 * point.
 *
 * The unit suite proves the schedule is stateless, the verbs are guarded and
 * the driver charges the right half of the cost model. None of that is the
 * thing the player meets, which is: the phone goes at ten past on the Tuesday
 * and there is a window on the screen with three buttons on it; the Wednesday
 * morning has half an hour in the middle of it that the desk cannot be reached
 * through; and a save taken in the middle of either of those comes back in the
 * middle of it.
 *
 * Every assertion here is about a GOAL the player reaches - the ticket closes
 * after the interruption, the queue's arithmetic held the whole way through,
 * the meeting is in the inbox afterwards - rather than about a button having
 * been clickable.
 *
 * The minutes are searched for rather than hard-coded, for the same reason the
 * corridor is: an interruption's minute is seeded, and a test that pinned a
 * Tuesday to 10:06 would be a test that breaks when a row is tuned. The window
 * is authored inside a known hour, so a bounded search over that hour is a
 * search that either finds it or has found a real bug.
 */

/** How long to look for a ringing phone before calling it a missing beat. */
const HUNT_MINUTES = 90;

/** Every `data-` attribute a takeover window carries, read in one go. */
type Takeover = Readonly<Record<string, string | undefined>>;

/**
 * Runs the clock a minute at a time until something is actually taking the
 * screen, and answers with the WINDOW'S OWN ATTRIBUTES as they stood in the
 * read that decided to stop.
 *
 * Two things make that the shape rather than a bare wait. It watches the
 * window's attribute rather than whether the window EXISTS, because both of
 * these windows can be open with nothing in them - a call that was waved off
 * leaves its window up with the outcome on it, and either opens cold from the
 * start menu. And it hands the whole snapshot BACK, because a call rings for
 * the minutes its row says and no longer: a second round-trip to ask "and was
 * it a callback?" is a question asked of a later paint, and the honest answer
 * to it may be that the phone has stopped ringing. One read, one paint, one
 * set of facts about it.
 */
async function huntFor(
  page: import('@playwright/test').Page,
  appId: 'call' | 'meeting',
  limit = HUNT_MINUTES,
  /**
   * The speed the search steps at when it must not touch the speed control.
   *
   * Absent is the normal search: a minute a step at x1, bought through the
   * house helper, which is exact because x1 is what everything drops TO. Given
   * a speed, the steps are stretches of REAL time at that speed and the
   * control is left exactly as the game leaves it - which is the only way to
   * watch the day put it down, and is therefore how the tests about the drop
   * have to walk. See the helper contract in `helpers.ts`.
   */
  keepSpeed?: 2 | 4,
): Promise<Takeover> {
  const app = page.getByTestId(`${appId}-app`);

  for (let minute = 0; minute < limit; minute += 1) {
    if (await app.count() > 0) {
      const snapshot: Takeover = await app.evaluate(
        (node) => ({ ...(node as HTMLElement).dataset }),
      );

      if (snapshot[appId] !== undefined && snapshot[appId] !== 'none') {
        return snapshot;
      }
    }

    if (keepSpeed === undefined) {
      await runSimMinutes(page, 1, 1);
    } else {
      await runRealMinutes(page, 1, keepSpeed);
    }
  }

  throw new Error(`Nothing took the screen with a ${appId} inside the hour.`);
}

/* -- gate 1: the journey, not the transition ------------------------------- */

/**
 * A malignant call lands MID-ticket, the player answers it, comes back through
 * the refocus window, and closes the ticket anyway.
 *
 * The claim is the whole journey and the arithmetic underneath it: the SLA
 * clock is not paused by a phone call, the ticket is still closable
 * afterwards, and the deadline the queue prints at the end is the deadline it
 * printed at the start plus nothing.
 */
test('a call about nothing costs the focus and not the ticket', async ({
  page,
}) => {
  // Tuesday, which is the morning the week hands over its office-wide fault -
  // and the morning somebody rings about the printer while nobody is on it.
  await logInOnDay(page, 2);
  await openFromStartMenu(page, 'tickets');

  const row = page.getByTestId('ticket-row-wedged-spooler');
  await row.click();
  await expect(page.getByTestId('ticket-detail-title')).toContainText('haunted');

  // Ten o'clock, with the ticket open, in the queue, and untouched: which is
  // what makes the call about it a call about NOTHING - the cost model reads
  // what the player is doing rather than what the row says.
  await workUntil(page, 10 * 60 - 8 * 60);

  // The deadline is read HERE and not before the shift, and the difference is
  // the invariant rather than a subtlety. A resolution clock is pushed out by
  // every minute nobody was at the desk, and the hour of morning brief is
  // fifty-eight of those: a figure read at 08:02 and again at 10:00 differs by
  // exactly the brief, which is `off_hours` doing its job. What this test is
  // about is whether a PHONE CALL moves it, so the reading has to start from
  // inside the shift.
  const deadline = page.getByTestId('ticket-detail-resolution');
  const dueBefore = await deadline.getAttribute('data-due');

  expect(dueBefore).not.toBeNull();

  const ringing = await huntFor(page, 'call');

  // Read off the paint that found it, not off a later one: the phone rings
  // for six minutes and a second round-trip is a different minute.
  expect(ringing.benign).toBe('false');
  expect(ringing.answered).toBe('false');

  const call = page.getByTestId('call-app');

  await page.getByTestId('call-answer').click();
  await expect(call).toHaveAttribute('data-answered', 'true');

  // The conversation, to the end of it: every option leads somewhere and the
  // last one puts the phone down.
  for (let step = 0; step < 4; step += 1) {
    const option = page.getByTestId('call-option-0');

    if (await option.count() === 0 || !await option.isVisible()) {
      break;
    }

    await option.click();
  }

  // NOT YET. The twenty-three minutes are measured from the minute the desk
  // comes back, so a player who is still holding the phone is not yet looking
  // for their place - they have not been given it back to lose. Asserting the
  // absence here is what stops the window quietly sliding back to the moment
  // the call was answered, which is where it used to start and which spent a
  // quarter of it recovering from a conversation still in progress.
  await expect(page.getByTestId('refocus-chip')).toBeHidden();

  // Out the far side of the call - six minutes of it, so eight is past the
  // end - and NOW the price is said out loud on the taskbar.
  await runSimMinutes(page, 8, 1);
  await expect(page.getByTestId('refocus-chip')).toBeVisible();
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-refocusing', 'true');

  // Through the window and out the far side of that. It expires quietly, and
  // nothing on any screen clears it.
  await runSimMinutes(page, 25);
  await expect(page.getByTestId('refocus-chip')).toBeHidden();
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-refocusing', 'false');

  // THE SLA TRUTH: the deadline is the deadline. A call that had quietly held
  // the service clock would show up here as a ticket that gained minutes
  // while nobody was working it.
  await focusWindow(page, 'tickets');
  await expect(row).toHaveAttribute('data-state', 'open');
  await expect(deadline).toHaveAttribute('data-due', dueBefore ?? '');

  // THE GOAL: the ticket still closes, by the route its own content
  // advertises, after all of that.
  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'clearqueue hercules');
  await expect(page.getByTestId('cmd-output')).toContainText('job(s) dropped');
  await runCommand(page, 'restart PRINT-01\\spooler');
  await expect(page.getByTestId('cmd-output')).toContainText('RUNNING');

  await focusWindow(page, 'tickets');
  await expect(row).toHaveAttribute('data-state', 'resolved');
  // And the deadline never moved for any of it.
  await expect(deadline).toHaveAttribute('data-due', dueBefore ?? '');
});

/* -- gate 2: the meeting, as a journey ------------------------------------- */

/**
 * The whole beat: it is announced on the Monday, the brief and the inbox both
 * name the hour, the block takes the screen at that hour, every clock runs
 * through it, and afterwards the meeting is in the inbox with nothing removed.
 */
test('the sync is announced, taken, and mailed round afterwards', async ({
  page,
}) => {
  await logInOnDay(page, 1, { brief: 'keep' });

  // Monday morning: it is already in the inbox, and it names the hour.
  await page.getByTestId('brief-open-mail').click();
  await page.getByTestId('mail-row-hygiene-sync').click();
  await expect(page.getByTestId('mail-reader')).toContainText('10:30');
  await expect(page.getByTestId('mail-reader')).toContainText('WEDNESDAY');
  // The recap cannot be read before it has happened: an inbox holding minutes
  // of a meeting nobody has been to is an inbox telling the player the future.
  await expect(page.getByTestId('mail-row-hygiene-sync-recap')).toHaveCount(0);

  await page.getByTestId('close-mail').click();
  await beginShift(page);
  await clockOffFor(page, 1);
  await beginShift(page);
  await clockOffFor(page, 2);
  await beginShift(page);

  // Wednesday, half past ten.
  await workUntilMinute(page, 10 * 60 + 25 - 8 * 60);
  await huntFor(page, 'meeting', 20);

  const clockAtStart = await page.getByTestId('sim-clock-time').textContent();
  await expect(page.getByTestId('meeting-app'))
    .toHaveAttribute('data-meeting', 'meeting/ticket-hygiene');
  // The desk is unreachable for the whole of it, which is the mechanic.
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-takeover', 'meeting');

  // Neither refusal works, and both say why rather than being missing.
  await page.getByTestId('meeting-decline').click();
  await expect(page.getByTestId('meeting-refusal')).toContainText('Attendance');
  await page.getByTestId('meeting-defer').click();
  await expect(page.getByTestId('meeting-refusal')).toContainText('Attendance');
  await expect(page.getByTestId('meeting-app')).toBeVisible();

  // And the desk is unreachable by KEYBOARD as well as by mouse, which is the
  // half a pointer rule cannot cover: the terminal was open before the block
  // started, so it may still have the cursor - and Enter must not close a
  // ticket from inside a meeting.
  await openFromStartMenu(page, 'cmd');
  await runOnlyCommand(page, 'restart PRINT-01\\spooler');
  await expect(page.getByTestId('cmd-output')).toContainText('in a meeting');
  await expect(page.getByTestId('cmd-output')).not.toContainText('RUNNING');

  // The room fills up a minute at a time, and the queue is counted beside it.
  const room = page.getByTestId('meeting-room');
  const beatsAtStart = Number(await room.getAttribute('data-beats') ?? '0');
  await runSimMinutes(page, 12, 1);
  const beatsLater = Number(await room.getAttribute('data-beats') ?? '0');
  expect(beatsLater).toBeGreaterThan(beatsAtStart);

  // And the clocks visibly ran: the taskbar is a different minute from the
  // one the block started on.
  expect(await page.getByTestId('sim-clock-time').textContent())
    .not.toBe(clockAtStart);

  // Out the far side: the desk is the player's again and the minutes are in
  // the post.
  await runSimMinutes(page, 25);
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-takeover', 'none');
  await expect(page.getByTestId('window-meeting')).toHaveCount(0);

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-item-mail').click();
  await page.getByTestId('mail-row-hygiene-sync-recap').click();
  // THE GOAL: it is the meeting, not a summary of it. The line about the
  // drop-down is in the post because it was said in the room.
  await expect(page.getByTestId('mail-reader'))
    .toContainText('They are in the drop-down.');
  await expect(page.getByTestId('mail-reader')).toContainText('Actions: none.');
});

/* -- gate 7: the mid-state save -------------------------------------------- */

test('a save taken while the phone is ringing comes back ringing', async ({
  page,
}) => {
  await logInOnDay(page, 2, { brief: 'keep' });
  await beginShift(page);

  await workUntilMinute(page, 10 * 60 - 8 * 60);
  const ringing = await huntFor(page, 'call');
  const ringingFor = ringing.call;

  const before = await page.getByTestId('sim-clock-time').textContent();

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-save').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Game saved' }))
    .toHaveCount(1);

  await page.reload();
  await completeLogin(page, { brief: 'keep' });
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Game loaded' }))
    .toHaveCount(1);

  // The same minute, the same call, and the same three answers - because none
  // of it was ever saved: occupancy is a function of the schedule and the
  // clock, and both of those came back.
  await expect(page.getByTestId('sim-clock-time')).toHaveText(before ?? '');
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-item-call').click();
  await expect(page.getByTestId('call-app'))
    .toHaveAttribute('data-call', ringingFor ?? '');
  await expect(page.getByTestId('call-answer')).toBeVisible();
});

test('a save taken in the meeting comes back in the meeting', async ({
  page,
}) => {
  await logInOnDay(page, 3, { brief: 'keep' });
  await beginShift(page);

  await workUntilMinute(page, 10 * 60 + 25 - 8 * 60);
  await huntFor(page, 'meeting', 20);
  await runSimMinutes(page, 8, 1);

  // Frozen first, chosen second: the pin below is about what a SAVE carries,
  // and an x4 left actually running would spend sim-minutes on every real
  // second of clicking that follows - the exact read would race its own
  // setup. Pause is orthogonal to speed, so the choice registers all the
  // same, and the pause rides the save just like the speed does.
  await page.getByTestId('day-pause').click();

  const before = await page.getByTestId('sim-clock-time').textContent();
  const beats = await page.getByTestId('meeting-room').getAttribute('data-beats');

  // The meeting's arrival dropped the clock; putting it back up is the
  // player's deliberate act, and the save is about to carry it. A load must
  // restore the SAVED speed, not replay the arrival edge - re-firing the drop
  // on load would quietly overrule a choice the player already made once.
  await page.getByTestId('day-speed-4').click();
  expect(await speedOnScreen(page)).toBe('x4');

  // Reachable FROM INSIDE the meeting, which is the point of the exemption:
  // the block takes the desk, not the workstation. A start menu nobody could
  // open for half an hour would be a dead end with a clock on it, and this
  // click is what proves the exemption is really there.
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-save').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Game saved' }))
    .toHaveCount(1);

  await page.reload();
  await completeLogin(page, { brief: 'keep' });
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Game loaded' }))
    .toHaveCount(1);

  await expect(page.getByTestId('sim-clock-time')).toHaveText(before ?? '');
  // The re-up survived the reload: saved speed, no replayed arrival edge.
  expect(await speedOnScreen(page)).toBe('x4');
  // And the freeze survived with it - unpause deliberately before the rest of
  // the test asks the clock to move again.
  await expect(page.getByTestId('day-pause')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByTestId('day-pause').click();
  // Still in the room, at the same point in it, with the desk still
  // unreachable - which is the half a save file could most easily lose.
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-takeover', 'meeting');
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-item-meeting').click();
  await expect(page.getByTestId('meeting-room'))
    .toHaveAttribute('data-beats', beats ?? '0');

  // The same rule the workstation keeps: a takeover is in the window list
  // while it is happening and out of it the minute the desk comes back. A
  // stray half-hour left standing on a desk that is the player's again is a
  // window they would have to close to prove the meeting was over.
  expect(await openWindows(page)).toContain('meeting:false');
  await runSimMinutes(page, 32);
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-takeover', 'none');
  await expect(page.getByTestId('window-meeting')).toHaveCount(0);
  expect(await openWindows(page)).not.toContain('meeting:false');
});

/* -- gate 5: precedence, as a thing the player can see --------------------- */

/**
 * The collision the shell could actually produce: a call pushed twenty minutes
 * out, landing in minutes the day has other plans for.
 *
 * The unit suite constructs the collision directly. What this drives is the
 * behaviour a player would report if it were broken - two windows at once, or
 * a call that was pushed and never came back - and it asserts the second
 * arrival is a real arrival with the one button missing from it.
 */
test('a call pushed back comes back, and cannot be pushed again', async ({
  page,
}) => {
  await logInOnDay(page, 2, { brief: 'keep' });
  await beginShift(page);

  await workUntilMinute(page, 10 * 60 - 8 * 60);
  await huntFor(page, 'call');

  await page.getByTestId('call-defer').click();
  await expect(page.getByTestId('call-outcome')).toContainText('ring back');

  // The screen is the player's for the minutes they bought: the window is
  // still there with the outcome on it, and there is nothing in it.
  await runSimMinutes(page, 5, 1);
  await expect(page.getByTestId('call-app')).toHaveAttribute('data-call', 'none');

  // And then it is not. The second arrival opens itself, exactly as the first
  // one did, and the world refuses both ways out of it.
  const second = await huntFor(page, 'call', 40);

  // The flag comes off the paint that FOUND the second arrival. Asking again
  // afterwards would be asking a later minute, and a call that has rung out
  // by then honestly answers that nothing is ringing.
  expect(second.callback).toBe('true');

  // And the claim itself goes through the world's own sentence, which outlives
  // the ringing: asking somebody to ring back does not buy the right to refuse
  // them when they do.
  await page.getByTestId('call-decline').click();
  await expect(page.getByTestId('call-refusal')).toContainText('coming back');

  await page.getByTestId('call-answer').click();
  await expect(page.getByTestId('call-app'))
    .toHaveAttribute('data-answered', 'true');
  // One takeover at a time, the whole way through: nothing else ever shared
  // the screen with it.
  await expect(page.getByTestId('window-meeting')).toHaveCount(0);
});

/* -- gates 10-13: the forced reboot ---------------------------------------- */

/**
 * The Thursday afternoon, on the built artifact.
 *
 * The unit suite proves the budget is counted out of the world and the loader
 * refuses a reboot that would leak past five. What none of it can prove is the
 * thing the player meets: a dialog from a machine at ten past two, three
 * windows that visibly shrink, a percentage that lies politely while a
 * deadline goes red behind it, and a desk that comes back with everything on
 * it exactly where it was.
 *
 * The reboot's window stays OPEN between arrivals - that is the countdown, and
 * it is the half of the mechanic that does not own the desk - so "is it
 * happening" is read off `data-holding` rather than off the window existing.
 */

/** Minutes past 08:00. The reboot is authored for ten past two, no jitter. */
const REBOOT_AT = 6 * 60 + 10;

async function huntForReboot(
  page: import('@playwright/test').Page,
  limit = 30,
): Promise<Takeover> {
  const app = page.getByTestId('reboot-app');

  for (let minute = 0; minute < limit; minute += 1) {
    if (await app.count() > 0) {
      const snapshot: Takeover = await app.evaluate(
        (node) => ({ ...(node as HTMLElement).dataset }),
      );

      // The whole snapshot, off the paint that found it: how many pushes are
      // left is a fact about THIS arrival, and a second round-trip to ask is a
      // question asked of a minute in which the answer may have changed.
      if (snapshot.holding === 'true') {
        return snapshot;
      }
    }

    await runSimMinutes(page, 1, 1);
  }

  throw new Error('The workstation never took the desk.');
}

/**
 * Holds the day still for a read that has to be exact.
 *
 * An assertion retries in REAL time while the clock runs in SIM time, so at
 * speed a retry loop spends the very minutes it is trying to count. Anything
 * pinning an exact minute reads it with the day stopped - which is a control
 * the player has, and one every takeover deliberately leaves reachable.
 *
 * Idempotent, because a session restored from a save taken while paused comes
 * back paused: a helper that clicked blindly would start the clock in the
 * middle of the read it was called to protect.
 */
async function underPause<T>(
  page: import('@playwright/test').Page,
  read: () => Promise<T>,
): Promise<T> {
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

/** Everything the terminal has printed, as one string. */
async function scrollbackOf(
  page: import('@playwright/test').Page,
): Promise<string> {
  return await page.getByTestId('cmd-output').textContent() ?? '';
}

/**
 * What the terminal printed BECAUSE of this command, and nothing it printed
 * before.
 *
 * The scrollback is the whole session, so `not.toContainText` asked of it is a
 * question about every line typed this afternoon - which is exactly why the
 * house helper types `cls` first. Here it must not: the scrollback IS the
 * thing under test, and a test that wiped it before the restore would be
 * asserting that an empty screen came back empty. So nothing is cleared and
 * the reading is a slice.
 */
async function tailAfter(
  page: import('@playwright/test').Page,
  command: string,
): Promise<string> {
  const before = await scrollbackOf(page);

  await runCommand(page, command);

  return (await scrollbackOf(page)).slice(before.length);
}

/** What the save would carry about which windows were up, and in what order. */
async function openWindows(
  page: import('@playwright/test').Page,
): Promise<readonly string[]> {
  return page.evaluate(() => (globalThis.careerSim?.screens().windows.open ?? [])
    .map((entry) => `${entry.appId}:${String(entry.minimized)}`));
}

test('the update is put off three times and then takes the afternoon', async ({
  page,
}) => {
  // Three played days to get to the Thursday, three postpones spent a minute
  // at a time, a deadline waited out inside the outage and twelve minutes of
  // update on the far side of it. It is the longest journey in this file by
  // some way, and it takes the same budget the other cross-day walks take.
  test.setTimeout(240_000);
  await logInOnDay(page, 4, { brief: 'keep' });
  await beginShift(page);

  // A desk with things on it, so "everything was restored" is a claim with
  // something to be a claim about: the queue, the terminal with a line in its
  // scrollback, and the knowledge base behind them.
  await openFromStartMenu(page, 'tickets');
  await openFromStartMenu(page, 'kb');
  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'ver');

  const scrollback = await scrollbackOf(page);
  const desk = await openWindows(page);

  // Mid-ticket, which is the only interesting time for this to happen: the
  // afternoon's certificate flood is open on the screen.
  await focusWindow(page, 'tickets');
  const duplicate = page.getByTestId('ticket-row-vpn-cert-dup-gary');
  await duplicate.click();
  await expect(page.getByTestId('ticket-detail-title')).not.toBeEmpty();

  await workUntilMinute(page, REBOOT_AT - 5);

  // The cursor, left in the terminal, which is where a first-line tech's
  // cursor is. It is what makes the focus claim below a claim about the
  // TAKEOVER: the desktop deliberately does not steal the keyboard out of
  // something somebody is typing in.
  await focusWindow(page, 'cmd');
  await page.getByTestId('cmd-input').click();
  expect((await activeElement(page)).testid).toBe('cmd-input');

  /* The first arrival: three windows, and the option that was withdrawn. */

  const first = await huntForReboot(page);

  expect(first.reboot).toBe('machine:reboot');
  expect(first.postponesLeft).toBe('3');
  await expect(page.getByTestId('reboot-subject')).toContainText('September');
  await expect(page.getByTestId('reboot-detail'))
    .toContainText('3 postpones left');
  await expect(page.getByTestId('reboot-postpone'))
    .toHaveText('Postpone 10 minutes');
  // There is no Decline button and there is a sentence saying why, which is
  // the world's own words rather than the window's.
  await expect(page.getByTestId('reboot-withdrawn'))
    .toContainText('option has been withdrawn');
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-takeover', 'machine');

  // THE KEYBOARD, taken. The terminal had the cursor when the takeover landed
  // - the journey put it there deliberately, above - and a window that left it
  // there would go on collecting keystrokes into a command line that is going
  // to be refused. The desktop does not steal focus out of something somebody
  // is typing in, on purpose, so this is the takeover's own doing and nothing
  // else can be covering for it.
  const holding = await activeElement(page);

  // The takeover steals to its root, and the desktop's primary-control rule
  // then places the cursor on the SAFE answer - Postpone - which is the
  // deliberate end state: one stray Enter postpones, it never restarts.
  expect(holding.testid).toBe('reboot-postpone');
  expect(holding.testid).not.toBe('cmd-input');

  // And the desk is gone by keyboard as well as by mouse: it refuses in the
  // workstation's own sentence rather than the meeting's.
  await openFromStartMenu(page, 'cmd');

  const refused = await tailAfter(page, 'restart PRINT-01\\spooler');

  expect(refused).toContain('installing updates');
  expect(refused).not.toContain('RUNNING');

  /* Ten minutes bought, and they are minutes at the desk. */

  const chip = page.getByTestId('reboot-chip');

  // Pressed and read with the day HELD, which is the only way an exact minute
  // can be asserted: a retry loop runs in real time and the clock runs in sim
  // time. Ten, whole, whatever minute the button was pressed on - a postpone
  // buys its minutes FROM THE PRESS, so a player who reads the dialog first
  // gets the same grace as one who slaps the button.
  await underPause(page, async () => {
    await page.getByTestId('reboot-postpone').click();
    await expect(page.getByTestId('reboot-app'))
      .toHaveAttribute('data-holding', 'false');
    await expect(page.getByTestId('desktop'))
      .toHaveAttribute('data-takeover', 'none');
    // Painted by the PRESS: with the clock stopped there is no next minute to
    // wait for, and a player who buys ten minutes and pauses to think about
    // them is entitled to see what they bought.
    await expect(chip).toHaveText('Restarting in 10m');
    await expect(chip).toHaveAttribute('data-left', '2');
  });

  // And it goes down with the clock, which is the half a static chip would
  // pass and be lying about a minute later.
  await runSimMinutes(page, 1, 1);
  await underPause(page, async () => {
    await expect(chip).toHaveAttribute('data-away', '9');
  });
  // And the desk answers again, which is the whole of what the push bought.
  const answered = await tailAfter(page, 'ver');

  expect(answered).toContain('Support Terminal');
  expect(answered).not.toContain('installing updates');

  /* The second arrival, and the deadline that runs out inside it. */

  const second = await huntForReboot(page, 15);

  expect(second.postponesLeft).toBe('2');
  await expect(page.getByTestId('reboot-postpone'))
    .toHaveText('Postpone 5 minutes');
  // Read with the day held: "it has not gone red yet" is a claim about a
  // minute, and a retry loop would spend the minutes it is claiming about.
  await underPause(page, async () => {
    await expect(duplicate).toHaveAttribute('data-breached', 'false');
  });

  // THE ARITHMETIC, which is the point of the whole mechanic: the queue does
  // not stop for the workstation. A deadline runs out while the desk is gone,
  // it goes red on a screen nobody can touch, and the toast about it arrives
  // over the top of an update screen.
  for (let minute = 0; minute < 8; minute += 1) {
    if (await duplicate.getAttribute('data-breached') === 'true') {
      break;
    }

    await runSimMinutes(page, 1, 1);
  }

  await expect(duplicate).toHaveAttribute('data-breached', 'true');
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-takeover', 'machine');
  await expect(
    page.getByTestId('toast').filter({ hasText: 'SLA breached' }),
  ).toBeVisible();

  await page.getByTestId('reboot-postpone').click();

  /* The third, which buys two minutes and says so. */

  const third = await huntForReboot(page, 40);

  expect(third.postponesLeft).toBe('1');
  await expect(page.getByTestId('reboot-detail'))
    .toContainText('One postpone left');
  await expect(page.getByTestId('reboot-postpone'))
    .toHaveText('Postpone 2 minutes');
  await page.getByTestId('reboot-postpone').click();

  /* And the fourth, which offers nothing at all. */

  const last = await huntForReboot(page, 15);

  expect(last.postponesLeft).toBe('0');
  await expect(page.getByTestId('reboot-postpone')).toBeHidden();
  await expect(page.getByTestId('reboot-restart-now')).toBeHidden();
  await expect(page.getByTestId('reboot-detail'))
    .toContainText('nothing left to press');

  // Everything the desk is holding at the minute the machine takes it.
  //
  // This is the snapshot the restore promise is ABOUT, and it is taken HERE
  // rather than at the top of the journey: the terminal has been typed into
  // since then - proving the desk refuses is half the point - and a promise
  // about a screen has to be a promise about the screen as it stands.
  const held = await scrollbackOf(page);
  const heldWindows = await openWindows(page);

  // The percentage is theatre pinned to real minutes, and it moves.
  await runSimMinutes(page, 4, 1);
  await expect(page.getByTestId('reboot-screen'))
    .toHaveAttribute('data-phase', 'installing');

  const shown = Number(
    await page.getByTestId('reboot-screen').getAttribute('data-percent') ?? '0',
  );

  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(100);

  /* The far side of it. */

  await runSimMinutes(page, 12, 1);

  // THE GOAL: the desk is the player's, the price is said out loud on the
  // taskbar, and everything that was on it is still on it.
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-takeover', 'none');
  await expect(page.getByTestId('window-reboot')).toHaveCount(0);
  await expect(page.getByTestId('refocus-chip')).toBeVisible();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Restoring your work' }),
  ).toBeVisible();
  await expect(page.getByTestId('reboot-chip')).toBeHidden();

  // Same windows, same states - as a SET. Stacking order is not part of the
  // promise: a loaded save reopens windows in manifest order by design (the
  // start-menu comment owns that call), and the reboot rides the same store.
  expect([...await openWindows(page)].sort()).toEqual([...desk].sort());
  // And the takeover's own window is not desk furniture. While it held the
  // desk the LIST carried it - the same list the save writes and a load reads
  // back - and the minute the desk came back it left, so the list and the
  // screen agree in both directions. Asserting the held set against the
  // pre-reboot desk directly would be asserting that a takeover has no window,
  // which is the opposite of the thing being tested.
  expect(heldWindows).toContain('reboot:false');
  expect([...heldWindows].filter((entry) => entry !== 'reboot:false').sort())
    .toEqual([...desk].sort());
  await focusWindow(page, 'cmd');

  const restored = await scrollbackOf(page);

  // BYTE FOR BYTE across the outage: the same lines, in the same order, with
  // the same letters - including the ones a shaking hand got wrong. The
  // fumble is the sharpest tooth in this assertion. It is a swap chosen by
  // the LINE and the MINUTE, so any screen that re-derived its own scrollback
  // would scramble it a different way and this comparison would say so.
  expect(restored).toBe(held);
  // And nothing from before the reboot was rewritten either - the afternoon
  // only ever grew. `startsWith` rather than equality because the journey
  // types during the takeover on purpose, so the scrollback is longer than it
  // was and every earlier byte is still exactly where it was.
  expect(restored.startsWith(scrollback)).toBe(true);
  expect(restored.length).toBeGreaterThan(scrollback.length);

  // THE OTHER RESTORE PATH, in the same session and the same window: a save
  // and a load with NO page reload, which puts a different world and a
  // different set of screens under windows that never closed. The terminal is
  // not in the save file at all - the scrollback is the living window's own
  // memory - so a load that quietly rebuilt the window would empty it, and
  // this is the only place that would show.
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-save').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Game saved' }))
    .toHaveCount(1);
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Game loaded' }))
    .toHaveCount(1);

  await focusWindow(page, 'cmd');
  expect(await scrollbackOf(page)).toBe(restored);
  expect([...await openWindows(page)].sort()).toEqual([...desk].sort());
});

/** Skipping the dread is legal, and it lands in exactly the same place. */
test('taking the restart now costs the same and picks the minute', async ({
  page,
}) => {
  await logInOnDay(page, 4, { brief: 'keep' });
  await beginShift(page);
  await workUntilMinute(page, REBOOT_AT - 5);

  const arrival = await huntForReboot(page);

  expect(arrival.postponesLeft).toBe('3');
  await page.getByTestId('reboot-restart-now').click();

  // The buttons are gone because the decision is made, and the machine is
  // still on the screen for the minutes it said it would take.
  await expect(page.getByTestId('reboot-postpone')).toBeHidden();
  await expect(page.getByTestId('reboot-detail'))
    .toContainText('You pressed it yourself');
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-takeover', 'machine');

  await runSimMinutes(page, 13, 1);

  // The same far side as the dread: the desk back, the recovery window
  // running, and the line about most of it.
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-takeover', 'none');
  await expect(page.getByTestId('refocus-chip')).toBeVisible();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Restoring your work' }),
  ).toBeVisible();
});

/**
 * The two mid-states, which is where a budget kept in the driver would show
 * up: a countdown reloads with the same minutes and the same pushes left, and
 * an outage reloads with the same screen on the same minute.
 */
test('a save taken mid-countdown comes back with the same budget', async ({
  page,
}) => {
  await logInOnDay(page, 4, { brief: 'keep' });
  await beginShift(page);
  await workUntilMinute(page, REBOOT_AT - 5);
  await huntForReboot(page);

  await page.getByTestId('reboot-postpone').click();
  await runSimMinutes(page, 3, 1);

  // Held for the reading and left held for the save: an exact minute compared
  // across a reload has to be a minute nothing is spending in between, and the
  // pause itself rides the save, which is its own small proof.
  const pause = page.getByTestId('day-pause');

  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');

  const clock = await page.getByTestId('sim-clock-time').textContent();
  const chip = await page.getByTestId('reboot-chip').textContent();

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-save').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Game saved' }))
    .toHaveCount(1);

  await page.reload();
  await completeLogin(page, { brief: 'keep' });
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Game loaded' }))
    .toHaveCount(1);

  // Same minute, same countdown, same two pushes left - none of which was
  // ever written into the save: the budget is counted out of the world's own
  // ledger every time anybody asks.
  await expect(page.getByTestId('sim-clock-time')).toHaveText(clock ?? '');
  await expect(page.getByTestId('reboot-chip')).toHaveText(chip ?? '');
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-item-reboot').click();
  await expect(page.getByTestId('reboot-app'))
    .toHaveAttribute('data-postpones-left', '2');
  await expect(page.getByTestId('reboot-app'))
    .toHaveAttribute('data-holding', 'false');
});

test('a save taken mid-reboot comes back mid-reboot', async ({ page }) => {
  await logInOnDay(page, 4, { brief: 'keep' });
  await beginShift(page);
  await workUntilMinute(page, REBOOT_AT - 5);
  await huntForReboot(page);

  await page.getByTestId('reboot-restart-now').click();
  await runSimMinutes(page, 4, 1);

  // Read off the paint that found it: the percentage is a function of the
  // minute, so a second round-trip is a different number by definition.
  const screen = page.getByTestId('reboot-screen');
  // Held first: a percentage is a function of the minute, so reading one while
  // the clock runs is reading a number that has already moved on.
  const pause = page.getByTestId('day-pause');

  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');

  const before = await screen.evaluate(
    (node) => ({ ...(node as HTMLElement).dataset }),
  );
  const clock = await page.getByTestId('sim-clock-time').textContent();

  // Reachable FROM INSIDE the outage, which is 0.3.0's rule about a block
  // taking the desk rather than the workstation: twelve minutes with no way
  // to save would be a dead end with a clock on it.
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-save').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Game saved' }))
    .toHaveCount(1);

  await page.reload();
  await completeLogin(page, { brief: 'keep' });
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Game loaded' }))
    .toHaveCount(1);

  await expect(page.getByTestId('sim-clock-time')).toHaveText(clock ?? '');
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-takeover', 'machine');
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-item-reboot').click();
  await expect(screen).toHaveAttribute('data-phase', before.phase ?? '');
  await expect(screen).toHaveAttribute('data-percent', before.percent ?? '');

  // A save written mid-takeover comes back as the TAKEOVER rather than as a
  // stray window: the list carries it because it is genuinely happening, and
  // the screen says so.
  expect(await openWindows(page)).toContain('reboot:false');

  // And out the far side, on the restored session, it leaves the list as well
  // as the screen. A window that survived a handback would be a dead update
  // screen the player has to close by hand, on top of a desk that is theirs.
  await page.getByTestId('day-pause').click();
  await runSimMinutes(page, 14, 1);
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-takeover', 'none');
  await expect(page.getByTestId('window-reboot')).toHaveCount(0);
  expect(await openWindows(page)).not.toContain('reboot:false');
});

/* -- slice 0.3.2: the clock slows down near events ------------------------- */

/**
 * What the speed control says, read as one fact rather than as three buttons.
 *
 * The whole control is asked, because "x1 is lit" and "x4 is not" are two
 * halves of the same claim and a test that only checked the first would pass
 * against a taskbar with two speeds lit at once.
 */
async function speedOnScreen(
  page: import('@playwright/test').Page,
): Promise<string> {
  return page.evaluate(() => {
    const lit = ['1', '2', '4'].filter((speed) => document
      .querySelector(`[data-testid="day-speed-${speed}"]`)
      ?.getAttribute('data-active') === 'true');

    return lit.length === 1 ? `x${lit[0] ?? ''}` : `lit: ${lit.join(', ')}`;
  });
}

/**
 * What is ringing this minute, as the window itself says, or nothing.
 *
 * Absent and empty are the same answer to a player and have to be the same
 * answer here: the call window can be standing open with the outcome of a
 * finished call on it, so a check that only counted windows would call that
 * a ringing phone.
 */
async function ringingNow(
  page: import('@playwright/test').Page,
): Promise<string> {
  const app = page.getByTestId('call-app');

  return await app.count() === 0
    ? 'none'
    : await app.getAttribute('data-call') ?? 'none';
}

/**
 * The phone goes at x4, and the day hands itself back at a speed a person can
 * answer at.
 *
 * The claim is the CONTROL and then the consequence. A data attribute moving
 * would be a transition; what the player is owed is the six-minute window in
 * real seconds they can spend reading it, so the second half of this runs the
 * real time that WOULD have been the whole window at x4 and finds the phone
 * still ringing with the three answers still on it.
 *
 * And then the other direction, which is as much of the rule: a player who
 * puts the clock back up mid-ring keeps it up. The drop is the ARRIVAL, not a
 * state the day re-asserts every minute, because a control that fights the
 * hand on it is worse than one that never moved.
 */
test('a call landing at speed drops the clock to x1, and a re-up sticks', async ({
  page,
}) => {
  await logInOnDay(page, 2, { brief: 'keep' });
  await beginShift(page);

  // Ten to ten: the Tuesday call is authored for five past with four minutes
  // of wander either way, so this stops well clear of the earliest minute it
  // could ring on. What the drop is about is the arrival, and an arrival that
  // had already happened before the clock was set would prove nothing.
  await workUntilMinute(page, 9 * 60 + 50 - 8 * 60);
  await page.getByTestId('day-speed-4').click();

  await underPause(page, async () => {
    expect(await speedOnScreen(page)).toBe('x4');
    // Nothing is ringing yet, so the drop below cannot be anything that
    // already happened this morning.
    expect(await ringingNow(page)).toBe('none');
  });

  // Found at x4, with the control left exactly as the game leaves it.
  const ringing = await huntFor(page, 'call', HUNT_MINUTES, 4);

  expect(ringing.call).not.toBe('none');

  await underPause(page, async () => {
    expect(await speedOnScreen(page)).toBe('x1');
  });

  // THE GOAL: the window, in seconds. Six minutes of real time at x4 is the
  // whole of what this call was ever going to be - and it is still ringing at
  // the end of it, with all three answers on the screen.
  await runRealMinutes(page, 6, 4);

  await underPause(page, async () => {
    await expect(page.getByTestId('call-app'))
      .toHaveAttribute('data-call', ringing.call ?? '');
    await expect(page.getByTestId('call-answer')).toBeVisible();
    await expect(page.getByTestId('call-decline')).toBeVisible();
  });

  // And the player disagrees, which is one click and their business.
  await page.getByTestId('day-speed-4').click();
  await runRealMinutes(page, 1, 4);

  await underPause(page, async () => {
    // Still ringing - so this is the SAME event, still happening - and the
    // clock is still where the player put it.
    await expect(page.getByTestId('call-app'))
      .toHaveAttribute('data-call', ringing.call ?? '');
    expect(await speedOnScreen(page)).toBe('x4');
  });
});

/**
 * And the half hour that takes the desk, which is the same rule and a much
 * bigger window: at x4 the whole meeting is seven seconds.
 *
 * The consequence is the point again - the block is STILL happening after the
 * real time that would have covered all of it - because a meeting the player
 * cannot read is a meeting whose joke has not been told.
 */
test('the meeting taking the desk drops the clock to x1', async ({ page }) => {
  await logInOnDay(page, 3, { brief: 'keep' });
  await beginShift(page);

  // Twenty past ten. The sync is announced for half past and takes no wander,
  // because a meeting that moved would make the summons mail a lie.
  await workUntilMinute(page, 10 * 60 + 20 - 8 * 60);
  await page.getByTestId('day-speed-4').click();

  await underPause(page, async () => {
    expect(await speedOnScreen(page)).toBe('x4');
    // The desk is the player's, so the drop below is the block arriving
    // rather than something the morning had already done.
    await expect(page.getByTestId('desktop'))
      .toHaveAttribute('data-takeover', 'none');
  });

  await huntFor(page, 'meeting', 20, 4);

  await underPause(page, async () => {
    expect(await speedOnScreen(page)).toBe('x1');
    await expect(page.getByTestId('desktop'))
      .toHaveAttribute('data-takeover', 'meeting');
  });

  // Half an hour of real time at x4, which is what the block would have cost
  // the player before this slice: seven and a half seconds.
  await runRealMinutes(page, 30, 4);

  await underPause(page, async () => {
    await expect(page.getByTestId('desktop'))
      .toHaveAttribute('data-takeover', 'meeting');
    await expect(page.getByTestId('meeting-room')).toBeVisible();
    // And the day did not stop for it either. Pause is a different question
    // and the answer to it is still the player's.
    expect(await speedOnScreen(page)).toBe('x1');
  });
});
