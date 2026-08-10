import { expect, type Page, test } from '@playwright/test';

import {
  completeLogin,
  focusWindow,
  openFromStartMenu,
  runSimMinutes,
} from './helpers';

/**
 * The M3 exit gate: one player, one day, on the built artifact.
 *
 * Morning brief, triage that computes a priority, work that closes, the lead
 * coming down the corridor twice - survived once with the boss key and walked
 * into once on purpose - lunch spent doing nothing on the company's time, a
 * can of something legal and the bill for it, an escalation second line will
 * actually keep, and a scorecard at 17:00 that reflects every one of those.
 * Then a save, a page reload, a load, and the same world to the byte.
 *
 * The minutes below are the shipped seed's own schedule. They are not magic
 * numbers: `buildPatrolSchedule(1, WORLD_SEED)` produces them, the unit suite
 * asserts their shape, and this test is the half that proves a player can see
 * and play them.
 */

/** Day one, from the shipped seed. Minutes since 08:00. */
const FIRST_TELEGRAPH = 216;
const FIRST_ARRIVAL = 220;
const FIRST_PING = 229;
const SECOND_TELEGRAPH = 307;
const SECOND_ARRIVAL = 311;

const SHIFT_END = 540;
const LUNCH_START = 240;
const LUNCH_END = 270;
/** The one Monday ticket that is not waiting at 08:00: `buildDaySchedule`
 * puts it at eight minutes past ten, and the week's table names the hour. */
const DRIP_ARRIVAL = 128;

/**
 * Runs the day forward to a given minute-of-day, at four times normal speed.
 *
 * Through the house helper rather than through the clock directly, and the
 * reason is halfway down this test: the lead is walked into ON PURPOSE at
 * SECOND_ARRIVAL, and being caught drops the speed control to x1. Everything
 * after it - the fifty minutes of recovery, the run out to 17:00 - would have
 * bought a quarter of the minutes it asked for, and the scorecard this test
 * exists to read would have been asserted against an afternoon that had not
 * happened yet.
 */
async function runTo(page: Page, tick: number): Promise<void> {
  const now = await page.evaluate(() => globalThis.careerSim?.tick() ?? 0);

  if (tick <= now) {
    return;
  }

  await runSimMinutes(page, tick - now, 4);
}

/**
 * The whole session in three values: the world, the minute, and the screens.
 * Compared as objects rather than as JSON, because two identical sessions may
 * still write their keys in a different order and that is not a difference a
 * player could ever see.
 */
async function simState(page: Page): Promise<{
  hash: string;
  tick: number;
  screens: unknown;
}> {
  return page.evaluate(() => ({
    hash: globalThis.careerSim?.hash() ?? '',
    tick: globalThis.careerSim?.tick() ?? -1,
    screens: globalThis.careerSim?.screens() ?? null,
  }));
}

test('plays a whole day and comes back to the same one', async ({ page }) => {
  // A played day plus a save, reload and replay is the longest single-day
  // journey in the suite; the post-restore night advance alone is seconds.
  test.setTimeout(240_000);
  await page.clock.install();
  // The journey asserts fumble STATE (chip + data attribute), not the sway
  // pixels - reduced motion keeps every assertion honest while making mid-day
  // clicks stable under strict actionability checks.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });

  /* -- the morning ------------------------------------------------------- */

  await expect(page.getByTestId('brief-heading')).toContainText('Day 1');
  // Two, which is the ceiling a morning may hand anybody: the screen
  // somebody rotated and the account somebody locked. The rest of the day
  // arrives while it is being worked.
  await expect(page.getByTestId('brief-queue-list').getByRole('listitem'))
    .toHaveCount(2);
  await page.getByTestId('brief-start-shift').click();
  // The hour, not the minute: the shift's clock is running from the moment it
  // opens (the contract in `helpers.ts`), so a read pinned to 09:00 races the
  // first tick of it. Nine o'clock is the claim - the morning was skipped.
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^09:/);
  await page.getByTestId('close-brief').click();

  await page.getByTestId('day-speed-4').click();
  await expect(page.getByTestId('day-speed-4'))
    .toHaveAttribute('data-active', 'true');

  /* -- triage, and then actually fixing something ------------------------ */

  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-rotated-screen').click();
  // One desk, and the person at it can still work: the estate says low
  // impact, the ticket says it can wait until somebody looks, and the matrix
  // says P4. Filing what the estate supports is the boring correct answer,
  // and the scorecard at 17:00 says nothing about it - which is the point.
  await page.getByTestId('triage-impact').selectOption('1');
  await page.getByTestId('triage-urgency').selectOption('2');
  await expect(page.getByTestId('triage-outcome')).toContainText('P4');
  await page.getByTestId('triage-file').click();
  await expect(page.getByTestId('ticket-detail-priority')).toHaveText('P4');

  await openFromStartMenu(page, 'directory');
  await page.getByTestId('directory-search').fill('gpoole');
  await page.getByTestId('directory-row-gary').click();
  await page.getByTestId('directory-unlock').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Ticket resolved' }),
  ).toHaveCount(1);

  /* -- the morning's arrival --------------------------------------------- */

  // Nothing has been raised since the player sat down: everything so far was
  // already in the queue. This one turns up on its own, on the minute the
  // week's table named and the day's seeded jitter settled on.
  await focusWindow(page, 'tickets');
  await expect(page.getByTestId('ticket-row-fan-noise')).toHaveCount(0);

  await runTo(page, DRIP_ARRIVAL);
  await expect(
    page.getByTestId('toast').filter({ hasText: 'New ticket' }),
  ).toHaveCount(1);
  await expect(
    page.getByTestId('toast').filter({ hasText: 'hornet in a biscuit tin' }),
  ).toHaveCount(1);

  const dripped = page.getByTestId('ticket-row-fan-noise');
  await expect(dripped).toBeVisible();
  await dripped.click();
  await expect(page.getByTestId('ticket-detail-raised')).toHaveText('10:08');
  // Untriaged, and the badge says what that costs rather than leaving the
  // player to find out at 17:00.
  await expect(page.getByTestId('ticket-detail-priority'))
    .toHaveText('Untriaged (treated as P3)');

  /* -- the corridor, survived -------------------------------------------- */

  const desktop = page.getByTestId('desktop');
  await expect(desktop).toHaveAttribute('data-boss', 'clear');

  await openFromStartMenu(page, 'browser');
  await page.getByTestId('browser-site-forum').click();
  await expect(page.getByTestId('browser-thread')).toContainText(/mower wont/i);

  await runTo(page, FIRST_TELEGRAPH);
  await expect(desktop).toHaveAttribute('data-boss', 'telegraph');
  await expect(page.getByTestId('boss-chip')).toBeVisible();
  await expect(page.getByTestId('boss-chip')).toContainText('Footsteps');
  await expect(page.getByTestId('door-flash')).toBeVisible();

  // The core skill, on the shipped path: one key, and the evidence is gone.
  await page.keyboard.press('Backquote');
  await expect(page.getByTestId('window-browser')).toBeHidden();

  await runTo(page, FIRST_ARRIVAL + 2);
  await expect(page.getByTestId('window-caught')).toHaveCount(0);
  await expect(desktop).toHaveAttribute('data-boss', 'clear');

  /* -- the ping, which is a ticket nobody raised ------------------------- */

  await runTo(page, FIRST_PING + 1);
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Message from the lead' }),
  ).toHaveCount(1);

  await focusWindow(page, 'tickets');
  const trap = page.getByTestId('ticket-row-boss-phone');
  await expect(trap).toBeVisible();
  await trap.click();
  await expect(page.getByTestId('ticket-claimed-urgency'))
    .toContainText('high urgency');

  // File it the way the man who raised it would like it filed. The estate
  // says one desk, so the review will say otherwise at 17:00.
  await page.getByTestId('triage-impact').selectOption('3');
  await page.getByTestId('triage-urgency').selectOption('3');
  await page.getByTestId('triage-file').click();
  await expect(page.getByTestId('ticket-detail-priority')).toHaveText('P1');

  // And his line landed in the thread he has always used, standing on the
  // question it is about rather than on his usual one.
  await openFromStartMenu(page, 'chat');
  await page.getByTestId('chat-person-desmond').click();
  await expect(page.getByTestId('chat-transcript'))
    .toContainText('stopped getting email');
  await expect(
    page.getByTestId('chat-options')
      .getByRole('button', { name: /still arriving on his desktop/ }),
  ).toBeVisible();

  /* -- lunch, which is the safe window ----------------------------------- */

  await runTo(page, LUNCH_START + 5);
  await expect(page.getByTestId('day-state')).toHaveText('Lunch');
  // The browser is behind the panic key from the corridor above, and the line
  // under this one reaches inside it: raised through the loop, because a raise
  // the day takes back - it is still putting its own screens on the desk - is a
  // click hunting a covered button (the contract in `helpers.ts`).
  await focusWindow(page, 'browser');
  await page.getByTestId('browser-site-cats').click();
  await expect(page.getByTestId('browser-grid').getByRole('listitem'))
    .toHaveCount(6);

  await runTo(page, LUNCH_END + 5);
  await expect(page.getByTestId('day-state')).toHaveText('Shift');

  /* -- the corridor, walked into on purpose ------------------------------ */

  await runTo(page, SECOND_TELEGRAPH + 1);
  await expect(desktop).toHaveAttribute('data-boss', 'telegraph');
  // This time the browser stays exactly where it is.
  await runTo(page, SECOND_ARRIVAL + 1);

  const caught = page.getByTestId('window-caught');
  await expect(caught).toBeVisible();
  await expect(page.getByTestId('caught-line')).toContainText('forum');
  await expect(page.getByTestId('caught-app')).toHaveAttribute(
    'data-app',
    'browser',
  );
  // Always dismissible: the scene has its own way out, and behind it the
  // queue is still there.
  await page.getByTestId('caught-dismiss').click();
  await expect(caught).toHaveCount(0);

  await page.keyboard.press('Backquote');
  await expect(page.getByTestId('window-browser')).toBeHidden();

  /* -- the can, and the bill for it -------------------------------------- */

  const drink = page.getByTestId('desk-drink');
  await expect(page.getByTestId('desk-drink-label')).toHaveText('Energy drink');
  await drink.click();
  await expect(page.getByTestId('desk-drink-label')).toHaveText('Wired');
  await expect(desktop).toHaveAttribute('data-drink', 'buff');
  await expect(page.getByTestId('desk-empties')).toBeVisible();

  await runTo(page, SECOND_ARRIVAL + 50);
  await expect(desktop).toHaveAttribute('data-drink', 'crash');
  await expect(page.getByTestId('desk-drink-label')).toHaveText('Coming down');
  await expect(
    page.getByTestId('toast').filter({ hasText: 'That is the can, then' }),
  ).toHaveCount(1);

  /* -- the handoff second line will keep --------------------------------- */

  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-beige-box').click();
  await page.getByTestId('remote-reboot').click();

  await focusWindow(page, 'tickets');
  await page.getByTestId('ticket-row-fan-noise').click();
  await page.getByTestId('ticket-escalate').click();
  await expect(page.getByTestId('handoff-tried')).toContainText('Rebooted it');
  await page
    .getByTestId('handoff-reported')
    .fill('It sounds like a hornet in a biscuit tin.');
  await page.getByTestId('handoff-send').click();
  await expect(page.getByTestId('ticket-row-fan-noise'))
    .toHaveAttribute('data-state', 'resolved');

  /* -- seventeen hundred -------------------------------------------------- */

  await runTo(page, SHIFT_END);
  await expect(page.getByTestId('sim-clock-time')).toHaveText('17:00');
  await expect(page.getByTestId('window-scorecard')).toBeVisible();

  // Everything the day actually contained, on one screen.
  await expect(page.getByTestId('scorecard-arrived')).toHaveText('5');
  await expect(page.getByTestId('scorecard-closed')).toHaveText('2');
  await expect(page.getByTestId('scorecard-caught')).toContainText('1 ·');
  await expect(page.getByTestId('scorecard-consumables')).toContainText('£1.20');
  await expect(page.getByTestId('scorecard-suspicion-events'))
    .not.toHaveText('0');
  await expect(page.getByTestId('scorecard-misclassified'))
    .toContainText('1 ticket(s) triaged against the evidence');
  await expect(page.getByTestId('scorecard-misclassified-boss-phone'))
    .toContainText('Low impact / Low urgency (P4)');
  const payslip = page.getByTestId('scorecard-pay');
  await expect(payslip).toContainText('Vending machine');
  await expect(payslip).toContainText('-£1.20');

  /* -- save, reload the page, load --------------------------------------- */

  const before = await simState(page);

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-save').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Game saved' }))
    .toHaveCount(1);

  await page.reload();
  await completeLogin(page, { brief: 'keep' });

  // A fresh session: a different world, at 08:00, having done none of it.
  const fresh = await simState(page);
  expect(fresh.hash).not.toBe(before.hash);

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Game loaded' }))
    .toHaveCount(1);

  // The same world, to the byte; the same minute; the same screens.
  const after = await simState(page);
  expect(after).toEqual(before);

  // And the same day on the surfaces the player can see.
  await expect(page.getByTestId('sim-clock-time')).toHaveText('17:00');
  await expect(page.getByTestId('day-state')).toHaveText('Day end');
  await page.getByTestId('day-state').click();
  await expect(page.getByTestId('scorecard-caught')).toContainText('1 ·');
  await expect(page.getByTestId('scorecard-consumables')).toContainText('£1.20');
  await expect(page.getByTestId('scorecard-closed')).toHaveText('2');

  // The day still ends when the player says so, which is the last thing a
  // loaded save has to be able to do.
  await page.getByTestId('scorecard-clock-off').click();
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 2');
  await expect(page.getByTestId('window-brief')).toBeVisible();
});
