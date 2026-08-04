import { expect, type Page, test } from '@playwright/test';

import {
  beginShift,
  clockOffFor,
  completeLogin,
  focusWindow,
  logIn,
  logInOnDay,
  openFromStartMenu,
  runSimMinutes,
  workUntilMinute,
} from './helpers';
import { AWAY_NOTICED_LINES } from '../src/world/dialogue';

/**
 * The green-dot triangle, on the built artifact, through the real entry point.
 *
 * The units prove the arithmetic and the driver suite proves the world acts on
 * it. What is here is the thing a PLAYER meets, and every assertion is about a
 * state they reach rather than a control they could press:
 *
 * - a phone that does not ring, and the record of it afterwards;
 * - a meter that moved because the dot said one thing while the log said
 *   another;
 * - a sync that happens anyway, and a status the meeting will not let them
 *   change, in the meeting's own sentence;
 * - somebody who has been waiting saying what they think of a desk marked
 *   Away, in the conversation they would have said it in;
 * - and all of it still true after a save and a reload.
 *
 * The helper contract from 0.3.2 applies unchanged: `runSimMinutes` delivers
 * the minutes whatever the day does to the speed control, and anything that
 * pins an exact minute reads it with the day held.
 */

/** How long to keep working behind a dot before calling a drip a missing beat. */
const DRIP_ROUNDS = 8;

/** The word the taskbar is showing, which is what the office can see. */
function presenceState(page: Page) {
  return page.getByTestId('presence-state');
}

/** A meter off the scorecard, which is where a player reads one mid-day. */
async function meter(page: Page, testId: string): Promise<number> {
  await openFromStartMenu(page, 'scorecard');
  const text = await page.getByTestId(testId).textContent() ?? '';
  const value = /-?\d+/u.exec(text);

  expect(value, `${testId} reads "${text}"`).not.toBeNull();
  return Number(value?.[0]);
}

/**
 * Work that the world accepts and that resolves nothing: a screen rotated
 * between two wrong angles.
 *
 * The drip and the Away sting both read the same evidence - the dispatch log
 * says this desk is working - so a journey about either of them needs work
 * that can be done over and over without the queue emptying underneath it.
 */
async function doSomeWork(page: Page): Promise<void> {
  if (await page.getByTestId('window-remote').count() === 0) {
    await openFromStartMenu(page, 'remote');
  } else {
    await focusWindow(page, 'remote');
  }

  await page.getByTestId('remote-machine-ada').click();

  const viewport = page.getByTestId('remote-viewport');
  // The other wrong angle, whichever this is: applying the angle a screen is
  // already at is refused before the click, by a button that greys itself out.
  const angle = await viewport.getAttribute('data-rotation') === '180'
    ? '90'
    : '180';

  await page.getByTestId('remote-rotation-picker').selectOption(angle);
  await page.getByTestId('remote-apply-rotation').click();
  await expect(viewport).toHaveAttribute('data-rotation', angle);
}

/**
 * The same work, but for the behind-the-dot journey, where the desk is a moving
 * target.
 *
 * The drip reads the TOUCH LOG - a dispatched action on a ticket's estate - not
 * a window's focus flag, so what this ASSERTS is the durable thing (the rotation
 * the world accepted) and never the chrome. But reaching the machine list still
 * needs the remote window in front: behind a red dot an arrival, a slide or the
 * caught scene can drop or minimise it BETWEEN rounds, so each round raises it
 * again and, unlike the first cut of this helper, waits for the raise to LAND
 * before dispatching - a raise clicked and then dispatched in the same beat left
 * the machine-select click retrying against a still-covered button. It yields
 * when a takeover owns the desk because there is nothing to dispatch to then -
 * which the caller's loop is watching for anyway. Answers whether it managed to
 * work, so a loop can tell a blocked minute from a worked one.
 */
async function workBehindTheDot(page: Page): Promise<boolean> {
  // A takeover (the caught scene, chiefly) owns the whole desk: no window to
  // raise and nothing to dispatch. Yield and let the caller read the scene.
  if (await page.getByTestId('window-caught').count() > 0) {
    return false;
  }

  // The desktop always carries a `data-takeover` attribute - it reads "none"
  // when nothing holds the desk - so the test is for a real takeover value, not
  // for the attribute's presence. A meeting or the workstation holds it; a
  // ringing or slid interruption does not.
  const takeover = await page.getByTestId('desktop')
    .getAttribute('data-takeover');

  if (takeover !== null && takeover !== 'none') {
    return false;
  }

  const remote = page.getByTestId('window-remote');

  if (await remote.count() === 0) {
    await openFromStartMenu(page, 'remote');
  } else {
    // Raise it to the front and WAIT until it is there before dispatching.
    // `focusWindow` clicks the taskbar toggle only when the window needs it (so
    // a window that is already up is not minimised) and then blocks on
    // data-focused='true'. That block is the fix: the window manager keeps the
    // focused window the TOP visible one, so a confirmed focus is a guarantee
    // the machine list underneath is uncovered. A fire-and-forget raise could
    // not promise that - it clicked the toggle and dispatched in the same beat,
    // and a raise that had not landed yet left the machine-select click retrying
    // against a button still under another window until the whole test timed out.
    await focusWindow(page, 'remote');
  }

  await page.getByTestId('remote-machine-ada').click();

  const viewport = page.getByTestId('remote-viewport');
  const angle = await viewport.getAttribute('data-rotation') === '180'
    ? '90'
    : '180';

  await page.getByTestId('remote-rotation-picker').selectOption(angle);
  await page.getByTestId('remote-apply-rotation').click();
  // The world accepted the work - the screen turned - which is the touch the
  // drip reads. THIS is "working", not a focused window.
  await expect(viewport).toHaveAttribute('data-rotation', angle);
  return true;
}

/* -- the do-not-disturb journey -------------------------------------------- */

/**
 * Tuesday behind a red dot, and the Wednesday it does not save you from.
 *
 * The whole spec-named journey in one session, because it IS one: the quiet
 * the dot buys, the price it charges for that quiet, and the one thing in the
 * week that does not care what your status says.
 */
test('the dot turns the phone away, collects the drip, and meets the sync anyway', async ({
  page,
}) => {
  // A played Monday, a Tuesday worked behind the dot, and a Wednesday morning
  // to the sync. It is the longest journey in this file and buys the same
  // budget the other cross-day walks take.
  test.setTimeout(300_000);
  await logInOnDay(page, 2, { brief: 'keep' });
  await beginShift(page);

  /* The control itself: three states, one click each, always legible. */

  await expect(presenceState(page)).toHaveText('Available');
  await expect(page.getByTestId('presence-available'))
    .toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('presence-dnd').click();

  await expect(presenceState(page)).toHaveText('Do not disturb');
  await expect(page.getByTestId('presence-dnd'))
    .toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('presence-available'))
    .toHaveAttribute('aria-pressed', 'false');

  const suspicionBefore = await meter(page, 'scorecard-suspicion');

  /* A morning of work behind it, across the hour the phone would have gone. */

  await workUntilMinute(page, 9 * 60 + 40 - 8 * 60);

  for (let round = 0; round < DRIP_ROUNDS; round += 1) {
    await doSomeWork(page);
    await runSimMinutes(page, 10, 4);
  }

  /*
   * THE PHONE THAT DID NOT RING.
   *
   * Nothing took the screen: the call window is either not open at all or open
   * with nothing in it, which is the same fact said two ways and is why the
   * attribute rather than the window is what is read.
   */
  await openFromStartMenu(page, 'call');
  await expect(page.getByTestId('call-app'))
    .toHaveAttribute('data-call', 'none');

  // And the record, which is the honest trace: who tried, and when.
  const missed = page.getByTestId('call-missed');

  await expect(missed).toBeVisible();
  await expect(missed).toContainText('printer');
  await expect(missed.getByText(/^\d\d:\d\d$/u).first()).toBeVisible();

  // Said once, quietly, rather than once per slide: the notification centre is
  // the durable half of a toast, so this is a question about the record.
  await page.getByTestId('notification-tray').click();
  await expect(
    page
      .getByTestId('notification-panel-item')
      .filter({ hasText: 'The phone did not ring' }),
  ).toHaveCount(1);
  await page.keyboard.press('Escape');

  /* THE PRICE. The dot said busy; the dispatch log says otherwise. */

  expect(await meter(page, 'scorecard-suspicion'))
    .toBeGreaterThan(suspicionBefore);

  /* And the Wednesday, which does not care. */

  await clockOffFor(page, 2);
  await beginShift(page);

  // The status rode the night, because it is world state rather than a thing
  // the taskbar remembers.
  await expect(presenceState(page)).toHaveText('Do not disturb');

  await workUntilMinute(page, 10 * 60 + 25 - 8 * 60);

  const meeting = page.getByTestId('meeting-app');

  for (let minute = 0; minute < 40 && await meeting.count() === 0; minute += 1) {
    await runSimMinutes(page, 1, 1);
  }

  await expect(meeting).toBeVisible();
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-takeover', 'meeting');

  /*
   * THE STATUS CONTROL, INERT (0.3.6, F6). It used to answer a click here with a
   * refusal panel popped over the meeting - a dead click that talks back - so
   * now it goes dim and dead under a block instead, the same way the desk does.
   * The dimming IS the teaching. The buttons are disabled so neither the mouse
   * nor the keyboard can reach past it, and NO refusal pops.
   *
   * The pause and speed cluster stay live by the 0.3.0 exemption; this is only
   * the one tray control a block actually refuses.
   */
  await expect(page.getByTestId('presence-control'))
    .toHaveAttribute('data-inert', 'true');
  await expect(page.getByTestId('presence-available')).toBeDisabled();
  await expect(page.getByTestId('presence-dnd')).toBeDisabled();
  await expect(page.getByTestId('presence-away')).toBeDisabled();

  // No refused panel over the meeting - the dimming said it instead.
  await expect(page.getByTestId('presence-refusal')).toBeHidden();
  // And the dot did not move, because there was nothing to move it: the block
  // rode in on Do Not Disturb and it is still Do Not Disturb.
  await expect(presenceState(page)).toHaveText('Do not disturb');
  await expect(page.getByTestId('presence-dnd'))
    .toHaveAttribute('aria-pressed', 'true');

  // The meeting is untouched by any of it.
  await expect(meeting).toBeVisible();
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-takeover', 'meeting');

  // And the control comes back to life the minute the room empties: the buttons
  // are live again once the block is over, so nothing has been left disabled.
  for (let minute = 0; minute < 40 && await meeting.count() > 0; minute += 1) {
    await runSimMinutes(page, 1, 1);
  }

  await expect(meeting).toHaveCount(0);
  await expect(page.getByTestId('presence-control'))
    .toHaveAttribute('data-inert', 'false');
  await expect(page.getByTestId('presence-dnd')).toBeEnabled();
});

/* -- the chat beat: the tradeoff both ways, on the artifact ---------------- */

/**
 * The two halves of one choice, walked on the built artifact (0.4.3, F4/F5).
 *
 * The 0.3.3 journey above dodges a CALL and meets the meeting the dot cannot
 * touch. What was missing until this slice was a beat on a day a player would
 * actually think to hide from - so Do Not Disturb could read as free for a
 * whole probation. `chat:dennis-calendar`, ten to eleven on the Thursday, is
 * that beat: a colleague's quick question, a chat source the dot can wave off.
 *
 * These two tests are the same Thursday morning played the two ways, and the
 * pair is the assertion that NEITHER dominates:
 *
 *  - behind the dot, the message never lands - but the quiet is paid for in the
 *    drip, and a morning of it walks the player into the lead's beat;
 *  - on an honest dot, the message lands and is taken for what it costs - but
 *    the dot stays clean and nobody has anything to put together.
 *
 * One path trades focus for a clean record; the other trades a clean record for
 * focus. That is a tradeoff, which is the whole of what F4 set out to make real.
 */
test('behind the dot, the message is waved off and the morning is paid for', async ({
  page,
}) => {
  // A morning of work behind the dot ends at the lead's shoulder, which is the
  // longest single-day journey in this file - it has to run the drip all the
  // way to the beat's mark - so it buys the cross-day budget.
  test.setTimeout(240_000);
  await logInOnDay(page, 4, { brief: 'keep' });
  await beginShift(page);

  await expect(presenceState(page)).toHaveText('Available');
  await page.getByTestId('presence-dnd').click();
  await expect(presenceState(page)).toHaveText('Do not disturb');

  /*
   * THE PRICE, as the journey meets it: working behind the dot costs suspicion.
   * This asserts the TEACHING, not the arithmetic - the exact rate
   * (floor(workingMinutes * 2 / 5)) is a deterministic driver-level fact and is
   * owned by the unit suite (`presence-beat.test.ts`), where a tick is a tick
   * and nothing is billed against a faked browser clock. Here the only claim is
   * the one a player feels and the one that never depends on a boundary phase:
   * the dot said busy while the log said working, and the meter that reads both
   * went UP.
   *
   * The window is all working - the dot is red throughout, the desk is
   * re-touched (a dispatched rotation) inside the recency window each round - and
   * `before` is captured rather than assumed, so a non-zero carry-in changes
   * nothing: several intervals of working behind the dot always drip SOMETHING.
   */
  const before = await meter(page, 'scorecard-suspicion');

  for (let round = 0; round < 5; round += 1) {
    await workBehindTheDot(page);
    await runSimMinutes(page, 5, 4);
  }

  expect(await meter(page, 'scorecard-suspicion')).toBeGreaterThan(before);

  /*
   * THE MESSAGE THAT DID NOT LAND. Idle behind the dot to just past ten to
   * eleven - nothing worked, so no more drip, and the beat is nowhere near its
   * mark - and the chat message slides rather than landing. The call window is
   * open with nothing in it, and the record underneath is who tried and what
   * about: Dennis, and the calendar.
   */
  await workUntilMinute(page, 11 * 60 - 8 * 60);
  await openFromStartMenu(page, 'call');
  await expect(page.getByTestId('call-app'))
    .toHaveAttribute('data-call', 'none');

  const missed = page.getByTestId('call-missed');

  await expect(missed).toBeVisible();
  await expect(missed).toContainText('calendar');

  /*
   * THE BEAT. Resume working behind the dot and the drip crosses the mark; the
   * corridor decides when, and the lead comes down about the status - the
   * caught-scene class, keyed to the dot rather than to a screen. The loop stops
   * the moment the scene is up, and the work helper yields under a takeover, so
   * nothing reaches past one to a desk that is not there.
   */
  const caught = page.getByTestId('window-caught');

  for (let round = 0; round < 45 && await caught.count() === 0; round += 1) {
    await workBehindTheDot(page);
    await runSimMinutes(page, 5, 4);
  }

  await expect(caught).toBeVisible();
  await expect(page.getByTestId('caught-app'))
    .toHaveAttribute('data-app', 'presence:dnd');
  // The line is about the morning, and it is the dot's own conversation - not a
  // screen anybody was found on.
  await expect(page.getByTestId('caught-line')).toContainText('Do Not Disturb');
});

/**
 * And the same Thursday on an honest dot: the message lands, because that is
 * what a clean dot costs - you are reachable - and it is taken for what it is.
 */
test('on an honest dot, the message lands and is taken for its cost', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await logInOnDay(page, 4, { brief: 'keep' });
  await beginShift(page);

  await expect(presenceState(page)).toHaveText('Available');

  // To ten to eleven, a minute at a time once it is close, until the message
  // takes the call window. It is a chat source, so the window wears the message
  // register rather than the phone's.
  await workUntilMinute(page, 10 * 60 + 48 - 8 * 60);

  const call = page.getByTestId('call-app');

  for (let minute = 0; minute < 15 && await call.count() === 0; minute += 1) {
    await runSimMinutes(page, 1, 1);
  }

  await expect(call).toBeVisible();
  // The message register, not the phone's: the source is on the window and the
  // answer verb is "Reply" rather than "Answer".
  await expect(call).toHaveAttribute('data-source', 'chat');
  await expect(page.getByTestId('call-caller')).toContainText('Dennis');
  await expect(page.getByTestId('call-subject')).toContainText('calendar');
  await expect(page.getByTestId('call-answer')).toHaveText('Reply');

  /* TAKEN. Replying opens the thread - the message is answered, the minutes are
   * spent, and that is the cost of a dot that let it through. */

  await page.getByTestId('call-answer').click();
  await expect(page.getByTestId('call-transcript')).toContainText('calendar');

  /* And the dot stayed clean the whole time: an honest status collects no drip,
   * which is the other side of the trade the test above pays. */

  await expect(presenceState(page)).toHaveText('Available');
  expect(await meter(page, 'scorecard-suspicion')).toBe(0);
});

/* -- the away journey ------------------------------------------------------ */

/**
 * A desk marked Away with the queue moving, answered by the person who has
 * been waiting longest for a first word.
 *
 * The reputation is the world's arithmetic and lands whether or not anybody
 * reads a screen. What this asserts is the half that makes it fair: the player
 * can find out WHO, and what they said about it, in their own voice.
 */
test('working while Away is answered by somebody who was waiting', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await logIn(page, { brief: 'keep' });
  await beginShift(page);

  await page.getByTestId('presence-away').click();
  await expect(presenceState(page)).toHaveText('Away');

  const reputationBefore = await meter(page, 'scorecard-reputation');

  // Demonstrable work on somebody else's ticket, with the dot saying nobody is
  // here to do it.
  await doSomeWork(page);

  // Somebody took it off the reputation, and the notice says a person did.
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Somebody has noticed' }),
  ).toHaveCount(1);
  expect(await meter(page, 'scorecard-reputation'))
    .toBeLessThan(reputationBefore);

  /*
   * And the line itself, in the conversation it belongs to.
   *
   * WHO is discovered rather than assumed: the world picks whoever has been
   * waiting longest for a first word, and a test that hard-coded a name would
   * be a test about the seeded order of a queue. So the thread is found the
   * way the game wrote it, and then read on screen the way a player reads it.
   */
  const said = await page.evaluate(() => {
    const threads = globalThis.careerSim?.screens().chat.threads ?? {};

    return Object.entries(threads).map(([speaker, thread]) => ({
      speaker,
      text: thread.lines.at(-1)?.text ?? '',
    }));
  });
  const answered = said.find(
    (thread) => Object.values(AWAY_NOTICED_LINES).includes(thread.text),
  );

  expect(answered, 'nobody said anything about the dot').toBeDefined();

  await openFromStartMenu(page, 'chat');
  await page
    .getByTestId(`chat-person-${(answered?.speaker ?? '').split(':')[1] ?? ''}`)
    .click();
  await expect(page.getByTestId('chat-transcript'))
    .toContainText(answered?.text ?? '');

  /*
   * One thought per person per day. The same desk doing the same work again
   * does not buy the same person a second opinion of it - the second time
   * they simply stop expecting anything, which costs nothing today and is
   * much worse - so their thread still holds exactly one of these lines.
   */
  await doSomeWork(page);

  const repeats = await page.evaluate((speaker) => {
    const thread = globalThis.careerSim?.screens().chat.threads[speaker];

    return (thread?.lines ?? []).filter((line) => line.who === 'them').length;
  }, answered?.speaker ?? '');

  // Their opening line, and the one thing they had to say about the dot.
  expect(repeats).toBe(2);
});

/* -- the save, mid-dot ----------------------------------------------------- */

/**
 * A session saved behind a red dot comes back behind the same red dot, with
 * the filter still doing its job.
 *
 * The dot on the taskbar is the cheap half of this. The load-bearing half is
 * the FILTER: presence is world state, so a reloaded session has to keep
 * turning the phone away, and a call dodged after the reload is the proof that
 * what came back was the status rather than a label.
 */
test('a save taken behind the dot reloads behind the dot', async ({ page }) => {
  test.setTimeout(240_000);
  await logInOnDay(page, 2, { brief: 'keep' });
  await beginShift(page);

  await page.getByTestId('presence-dnd').click();
  await expect(presenceState(page)).toHaveText('Do not disturb');

  // Before the phone would have gone, so the filter still has work to do on
  // the far side of the reload.
  await workUntilMinute(page, 9 * 60 + 30 - 8 * 60);

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-save').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Game saved' }),
  ).toHaveCount(1);

  await page.reload();
  await completeLogin(page, { brief: 'keep' });

  // A fresh session is a fresh Monday with an honest dot on it, which is what
  // makes the load below a claim about the save rather than about the default.
  await expect(presenceState(page)).toHaveText('Available');

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Game loaded' }),
  ).toHaveCount(1);

  await expect(presenceState(page)).toHaveText('Do not disturb');
  await expect(page.getByTestId('presence-dnd'))
    .toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 2');

  // And it is still a filter rather than a label: the call the restored day
  // has yet to make is turned away exactly as it would have been.
  await runSimMinutes(page, 60, 4);

  await openFromStartMenu(page, 'call');
  await expect(page.getByTestId('call-app'))
    .toHaveAttribute('data-call', 'none');
  await expect(page.getByTestId('call-missed')).toBeVisible();
  await expect(page.getByTestId('call-missed'))
    .toHaveAttribute('data-dodged', /[1-9]/u);
});
