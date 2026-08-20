import { expect, type Page, test } from '@playwright/test';

import {
  beginShift,
  clockOffFor,
  completeLogin,
  openFromStartMenu,
} from './helpers';

/**
 * A REFRESH COMES BACK TO THE WEEK YOU WERE IN, AND THE DOOR OUT OF IT
 * (#61, 0.41.0).
 *
 * The defect, found by walking 0.36.0's senior journey on the box: a plain
 * reload booted the PROBATION world. The saved week came back only if the badge
 * held a newer copy or the player pressed Load, so a career that is a FACT
 * rather than a seed - the senior desk, an employer switch - was quietly
 * demoted on every refresh with the real week sitting unloaded in the slot.
 *
 * These walk it as a player does, on the built artifact, through the real
 * screens. The claim is never "the loader returned ok": it is which desk the
 * player is sitting at, which shop's queue is on the screen, and which day the
 * brief says it is - the things a demoted world would answer differently.
 *
 * Authored for the box run (specs are written here, not run here); it is part
 * of the version's single box cycle.
 */

const SWITCH_KEY = 'workgrumble/switch';
const SAVE_KEY = 'workgrumble/save';
const PLAYER = 'person:pat';

const SENIOR_TITLE = 'Senior Service Desk Analyst';
const PROBATION_TITLE = 'IT Support Technician (probationary)';

/** What the world says about the player, read off the shipped debug handle. */
async function playerField(page: Page, field: string): Promise<unknown> {
  return page.evaluate(
    ([node, name]) => globalThis.careerSim?.field(node, name) ?? null,
    [PLAYER, field] as [string, string],
  );
}

/** Whether this browser still has a saved week in it, as bytes on disk. */
async function savedWeek(page: Page): Promise<string | null> {
  return page.evaluate(
    (key: string) => window.localStorage.getItem(key),
    SAVE_KEY,
  );
}

/** Boot a browser that has never played before: the one boot that hires. */
async function freshBoot(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByTestId('login-screen')).toBeVisible();
}

/**
 * Takes the senior desk and logs on: a career the seed cannot reproduce.
 *
 * The pick rebuilds the world, so the machine starts again and comes back at
 * the new starter's ceremony before the log-on box - which is why there are two
 * log-ons in here and only one of them is the player's second thought.
 */
async function startAsSenior(page: Page): Promise<void> {
  await freshBoot(page);
  await page.getByTestId('login-desk').selectOption('sd_senior');
  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-screen'))
    .toBeVisible({ timeout: 30_000 });
  await completeLogin(page, { brief: 'keep' });
  expect(await playerField(page, 'title')).toBe(SENIOR_TITLE);
}

test('a refresh comes back to the senior desk, on the day it left', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await startAsSenior(page);

  // A day worked and clocked off, because the clock-off is where the boundary
  // save is written - and the boundary save is the thing a refresh has to come
  // back to. Monday is played out; Tuesday's brief is on screen.
  await beginShift(page);
  await clockOffFor(page, 1);
  await expect(page.getByTestId('brief-heading')).toContainText('Day 2');

  // AND THE REFRESH. Nothing is pressed on the far side of it: no Load, no
  // badge, no menu. This is the plain reload that used to hand the player a
  // probationer's Monday.
  await page.reload();
  await completeLogin(page, { brief: 'keep' });

  // The goal: the player is in THEIR world. The desk is the one they were
  // hired onto, the week is the one they were in, and it is still Tuesday.
  expect(await playerField(page, 'title')).toBe(SENIOR_TITLE);
  expect(await playerField(page, 'arc_week')).toBe(2);
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 2');
  await expect(page.getByTestId('brief-heading')).toContainText('Day 2');
});

test('a refresh comes back to the shop that was switched to', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/');

  // Seeded ONCE, by hand rather than through an init script: `addInitScript`
  // re-runs on every navigation, so the refresh below would arrive at
  // Bodgeworth a SECOND time - a fresh first day standing itself up over the
  // one the resume is supposed to bring back, which would prove nothing.
  await page.evaluate(
    ([key, record]) => {
      window.localStorage.setItem(key, JSON.stringify(record));
    },
    [SWITCH_KEY, {
      employer: 'bodgeworth',
      career: {
        reputation: 82,
        title: 'IT Support Technician',
        farmFund: 25_000,
        trail: null,
      },
    }] as [string, unknown],
  );

  await page.reload();
  await completeLogin(page, { brief: 'keep' });

  // The arrival plays the shop's boot ceremony on the update screen.
  const arrival = page.getByTestId('window-updates');

  if (await arrival.count()) {
    await page.getByTestId('close-updates').click();
    await expect(arrival).toHaveCount(0);
  }

  await expect(page.getByTestId('brief-heading')).toContainText('Day 1');

  // The arrival wrote its own save on the way through and let the switch
  // record go, so this refresh is carrying nothing but the week itself.
  await page.reload();
  await completeLogin(page, { brief: 'keep' });
  await beginShift(page);
  await openFromStartMenu(page, 'tickets');

  // Bodgeworth's queue, not the probation shop's: its shared front-desk login
  // is the Monday fault and the rotated screen is nowhere. A session that had
  // restarted would have exactly the other two.
  await expect(page.getByTestId('ticket-row-office-login-locked'))
    .toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('ticket-row-rotated-screen')).toHaveCount(0);
});

/**
 * THE START-FRESH DOOR, and the half of it that matters most: the half where
 * nothing happens.
 *
 * A player who opens it, reads what it says and changes their mind must come
 * out of it in exactly the career they went in with. Since #61 there is no
 * other way back to the ladder, so a door that quietly cost something would be
 * the only door there is.
 */
test('the door names the career, asks first, and keeps it when refused', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await startAsSenior(page);

  await page.reload();
  await expect(page.getByTestId('login-screen')).toBeVisible();

  // Shut: a button, and no ladder anywhere. A difficulty select on the log-on
  // screen of a browser mid-career would be a control that lies.
  await expect(page.getByTestId('login-desk-field')).toHaveCount(0);
  await expect(page.getByTestId('login-start-fresh')).toBeVisible();

  const button = await page.getByTestId('login-start-fresh').boundingBox();

  await page.getByTestId('login-start-fresh').click();

  // Asking: the career, in plain words, and STILL no ladder - the select is on
  // the far side of the question rather than beside it.
  const warning = page.getByTestId('login-start-fresh-warning');

  await expect(warning)
    .toContainText(`Starting a new career replaces ${SENIOR_TITLE} at`);
  await expect(warning).toContainText('week 2');
  await expect(page.getByTestId('login-desk-field')).toHaveCount(0);

  // AND THE EYE CAN FIND IT: attached-with-a-box is not seen. This is the one
  // sentence in the product that stands between a player and a career, so the
  // gate is GEOMETRY - it sits inside the log-on dialog, on screen, and where
  // the button that was pressed used to be rather than a scroll away from it.
  const warningBox = await warning.boundingBox();
  const dialogBox = await page.locator('.login-dialog').boundingBox();
  const viewport = page.viewportSize();

  expect(warningBox).not.toBeNull();
  expect(dialogBox).not.toBeNull();
  expect(warningBox?.width ?? 0).toBeGreaterThan(0);
  expect(warningBox?.height ?? 0).toBeGreaterThan(0);
  expect((warningBox?.y ?? 0) >= (dialogBox?.y ?? 0)).toBe(true);
  expect((warningBox?.y ?? 0) + (warningBox?.height ?? 0))
    .toBeLessThanOrEqual((dialogBox?.y ?? 0) + (dialogBox?.height ?? 0) + 1);
  expect((warningBox?.y ?? 0) + (warningBox?.height ?? 0))
    .toBeLessThanOrEqual(viewport?.height ?? 0);
  expect(Math.abs((warningBox?.y ?? 0) - (button?.y ?? 0))).toBeLessThan(160);

  // Changed their mind.
  await page.getByTestId('login-start-fresh-cancel').click();
  await expect(warning).toBeHidden();
  await expect(page.getByTestId('login-desk-field')).toHaveCount(0);
  await expect(page.getByTestId('login-start-fresh')).toBeVisible();

  // And logging on is the log-on it always was: the same career, resumed.
  await completeLogin(page, { brief: 'keep' });
  expect(await playerField(page, 'title')).toBe(SENIOR_TITLE);
  expect(await playerField(page, 'arc_week')).toBe(2);
});

test('the door starts a new career, and the old one lives until the log-on', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await startAsSenior(page);

  const senior = await savedWeek(page);

  expect(senior).not.toBeNull();

  await page.reload();
  await expect(page.getByTestId('login-screen')).toBeVisible();
  await page.getByTestId('login-start-fresh').click();
  await page.getByTestId('login-start-fresh-confirm-yes').click();

  // Open: the ladder, the line that says when the old career goes, and the
  // career itself still named above both - a rung is picked AGAINST something.
  await expect(page.getByTestId('login-desk-field')).toBeVisible();
  await expect(page.getByTestId('login-start-fresh-note'))
    .toContainText('replaced the moment you do, and not before');
  await expect(page.getByTestId('login-start-fresh-warning'))
    .toContainText(SENIOR_TITLE);

  // AND IT IS STILL THERE. Confirming named a career and put a ladder on the
  // screen; it did not touch the week. A player who closed the tab here would
  // still have the senior desk.
  expect(await savedWeek(page)).toBe(senior);

  // The bottom rung, deliberately: a start at the standard desk through this
  // door is the one case the hire never has to handle, because a hire that
  // picks the bottom rung is already sitting in the world it asked for.
  await page.getByTestId('login-desk').selectOption('sd_junior');
  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();

  // The machine starts again and comes back a probationer, at the bottom, on a
  // Monday - and the toast says which of the two starts this was.
  await expect(page.getByTestId('login-screen'))
    .toBeVisible({ timeout: 30_000 });
  // Second time round this browser is carrying the new career, so the ladder
  // is behind the door again rather than on the screen.
  await expect(page.getByTestId('login-desk-field')).toHaveCount(0);
  await completeLogin(page, { brief: 'keep' });

  expect(await playerField(page, 'title')).toBe(PROBATION_TITLE);
  expect(await playerField(page, 'arc_week')).toBe(1);
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 1');
  await expect(
    page.getByTestId('toast').filter({ hasText: 'took you on at the bottom' }),
  ).toHaveCount(1);

  // The senior week is gone, and it went at the log-on rather than at the
  // question: the file in this browser is the new career's own first save.
  const started = await savedWeek(page);

  expect(started).not.toBeNull();
  expect(started).not.toBe(senior);
});

/**
 * A SAVED WEEK THIS BUILD CANNOT OPEN.
 *
 * The one outcome the resume must never have is the one it replaced: a
 * probation Monday dealt in silence over somebody's career. A file that will
 * not open is refused out loud, the session is honest about what is on screen
 * instead, and the door is there for a player who wants a clean one.
 */
test('a week that will not open is said out loud, not swapped for a Monday', async ({
  page,
}) => {
  await page.addInitScript(
    ([key, file]) => {
      window.localStorage.setItem(key, file);
    },
    [SAVE_KEY, JSON.stringify({ schema: 99, engine: '{}' })] as [
      string,
      string,
    ],
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByTestId('login-screen')).toBeVisible();

  // No ladder over somebody's unreadable week: taking a desk from it would
  // write straight over the file. The door is what offers that, and it asks.
  await expect(page.getByTestId('login-desk-field')).toHaveCount(0);
  await expect(page.getByTestId('login-start-fresh')).toBeVisible();

  await completeLogin(page, { brief: 'keep' });

  const refusal = page.getByTestId('toast')
    .filter({ hasText: 'The saved week would not open' });

  await expect(refusal).toHaveCount(1);
  await expect(refusal).toContainText('newer build');
  await expect(refusal).toContainText('You are looking at a first Monday');
  // And the world really is the honest fall-back rather than a half-loaded one.
  expect(await playerField(page, 'title')).toBe(PROBATION_TITLE);
});
