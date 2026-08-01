import { expect, test } from '@playwright/test';

import {
  beginShift,
  clockOffFor,
  completeLogin,
  focusWindow,
  logInOnDay,
  openFromStartMenu,
  runCommand,
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

/**
 * Runs the clock a minute at a time until something is actually taking the
 * screen, or gives up and says what never turned up.
 *
 * It watches the window's own attribute rather than whether the window
 * EXISTS, and that is the difference between a search and a coincidence: both
 * of these windows can be open with nothing in them - a call that was waved
 * off leaves its window up with the outcome on it, and either can be opened
 * cold from the start menu on a quiet Monday.
 */
async function huntFor(
  page: import('@playwright/test').Page,
  appId: 'call' | 'meeting',
  limit = HUNT_MINUTES,
): Promise<void> {
  const app = page.getByTestId(`${appId}-app`);
  const attribute = appId === 'call' ? 'data-call' : 'data-meeting';

  for (let minute = 0; minute < limit; minute += 1) {
    if (
      await app.count() > 0
      && await app.getAttribute(attribute) !== 'none'
    ) {
      return;
    }

    await runSimMinutes(page, 1, 1);
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

  const deadline = page.getByTestId('ticket-detail-resolution');
  const dueBefore = await deadline.getAttribute('data-due');

  expect(dueBefore).not.toBeNull();

  // Ten o'clock, with the ticket open, in the queue, and untouched: which is
  // what makes the call about it a call about NOTHING - the cost model reads
  // what the player is doing rather than what the row says.
  await workUntil(page, 10 * 60 - 8 * 60);
  await huntFor(page, 'call');

  const call = page.getByTestId('call-app');
  await expect(call).toHaveAttribute('data-benign', 'false');

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

  // The price, said out loud on the taskbar: the player is looking for their
  // place again, and nothing on any screen can clear it.
  await expect(page.getByTestId('refocus-chip')).toBeVisible();
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-refocusing', 'true');

  // Through the window and out the far side. It expires quietly.
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
  await expect(page.getByTestId('meeting-refusal')).toBeVisible();
  await page.getByTestId('meeting-defer').click();
  await expect(page.getByTestId('meeting-refusal')).toBeVisible();
  await expect(page.getByTestId('meeting-app')).toBeVisible();

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
  await huntFor(page, 'call');

  const before = await page.getByTestId('sim-clock-time').textContent();
  const ringingFor = await page.getByTestId('call-app').getAttribute('data-call');

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
  expect(await page.getByTestId('sim-clock-time').textContent()).toBe(before);
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

  const before = await page.getByTestId('sim-clock-time').textContent();
  const beats = await page.getByTestId('meeting-room').getAttribute('data-beats');

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

  expect(await page.getByTestId('sim-clock-time').textContent()).toBe(before);
  // Still in the room, at the same point in it, with the desk still
  // unreachable - which is the half a save file could most easily lose.
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-takeover', 'meeting');
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-item-meeting').click();
  await expect(page.getByTestId('meeting-room'))
    .toHaveAttribute('data-beats', beats ?? '0');
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
  await huntFor(page, 'call', 40);
  await expect(page.getByTestId('call-app'))
    .toHaveAttribute('data-callback', 'true');

  await page.getByTestId('call-decline').click();
  await expect(page.getByTestId('call-refusal')).toContainText('coming back');

  await page.getByTestId('call-answer').click();
  await expect(page.getByTestId('call-app'))
    .toHaveAttribute('data-answered', 'true');
  // One takeover at a time, the whole way through: nothing else ever shared
  // the screen with it.
  await expect(page.getByTestId('window-meeting')).toHaveCount(0);
});
