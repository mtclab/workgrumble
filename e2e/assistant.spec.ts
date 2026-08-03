import { expect, type Page, test } from '@playwright/test';

import {
  beginShift,
  clockOffFor,
  completeLogin,
  logInOnDay,
  runSimMinutes,
  workUntilMinute,
  worldHash,
} from './helpers';
import { RETURNING_LINES } from '../src/shell/assistant-lines';

/**
 * The thing on the desk with the face on it, on the built artifact.
 *
 * Everything asserted here is a state a player reaches rather than a function
 * that returned: it is on screen and saying something, it goes when they close
 * it, it comes back with a different note about having been closed, it shuts
 * up during a meeting, and the count it escalates by survives the trip through
 * a save file. The one thing it must never do - name a real fix - is proven
 * offline against every registry in `assistant-lines.test.ts`, because that is
 * a claim about content rather than about a browser.
 */

function assistant(page: Page) {
  return page.getByTestId('assistant');
}

function line(page: Page) {
  return page.getByTestId('assistant-line');
}

/**
 * A distinctive fragment of the note at a given count, rather than the whole
 * line: the assertion is that THIS tier is on screen, and a whole-string match
 * is a test that every typo fix has to come back and rewrite.
 */
function noteAt(tier: number): string {
  const entry = RETURNING_LINES[tier - 1];

  if (entry === undefined) {
    throw new Error(`No returning line at tier ${String(tier)}.`);
  }

  return entry.text.split('.')[0] ?? entry.text;
}

/**
 * Runs the week forward until the character is back on the desk.
 *
 * Two doors open it and the test does not get to pick: the next big thing that
 * happens TO the player, or the next day. Which one a given day deals is the
 * week's business - the Monday authors no interruptions and the Tuesday has a
 * phone in it - so the walk waits for either and asserts what it SAYS when it
 * arrives, which is the part that is this slice's.
 */
async function waitForItToComeBack(page: Page, day: number): Promise<void> {
  for (let minute = 0; minute < 180; minute += 5) {
    if (await assistant(page).isVisible()) {
      return;
    }

    if (await page.getByTestId('day-state').getAttribute('data-state') === 'day_end') {
      break;
    }

    await runSimMinutes(page, 5, 4);
  }

  if (await assistant(page).isVisible()) {
    return;
  }

  await clockOffFor(page, day);
  await beginShift(page);
  await expect(assistant(page)).toBeVisible();
}

/** Monday, on a fake clock, with the shift started. */
async function startMonday(page: Page): Promise<void> {
  await page.clock.install();
  // The character breathes, and an actionability check on a moving element is
  // a flake looking for a slow machine. Nothing here is about the motion.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });
  await beginShift(page);
}

test('it turns up at the desk and says something about nothing', async ({
  page,
}) => {
  await startMonday(page);

  await expect(assistant(page)).toBeVisible();
  await expect(page.getByTestId('assistant-character')).toBeVisible();
  await expect(page.getByTestId('assistant-bubble')).toBeVisible();
  await expect(line(page)).not.toBeEmpty();

  // It is furniture, not a dialog: nothing about it takes the pointer, so the
  // desktop underneath is exactly as clickable as it was.
  await expect(assistant(page)).toHaveCSS('pointer-events', 'none');
  await expect(page.getByTestId('assistant-dismiss'))
    .toHaveCSS('pointer-events', 'auto');

  // And it keeps talking as the day moves, which is the cadence: a situation
  // that has been true for a quarter of an hour gets a different line about
  // being true.
  const first = await line(page).textContent();
  await runSimMinutes(page, 20, 1);
  await expect(line(page)).not.toHaveText(first ?? '');
});

test('closing it costs nothing and it takes it very well', async ({ page }) => {
  await startMonday(page);
  await expect(assistant(page)).toBeVisible();

  // THE PROPERTY THE WHOLE SLICE HANGS ON: it is pure overlay. The world is
  // the same world on both sides of the one thing anybody can do to it - no
  // dispatch, no meter, no minute.
  const before = await worldHash(page);
  await page.getByTestId('assistant-dismiss').click();
  await expect(assistant(page)).toBeHidden();
  expect(await worldHash(page)).toBe(before);

  // Quiet is quiet: an ordinary stretch of the same day does not bring it
  // back, because those are the minutes closing it bought.
  await runSimMinutes(page, 45, 4);
  await expect(assistant(page)).toBeHidden();
});

test('it comes back the next day, with a note, and the note escalates', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await startMonday(page);

  await expect(assistant(page)).toBeVisible();
  await page.getByTestId('assistant-dismiss').click();
  await expect(assistant(page)).toBeHidden();

  await clockOffFor(page, 1);
  await beginShift(page);

  // Day two: it is back, and the first thing it says is about having been
  // closed rather than about the desk.
  await expect(assistant(page)).toBeVisible();
  await expect(line(page)).toContainText(noteAt(1));

  // Close it again, and the note it comes back with is a DIFFERENT note - the
  // gag escalates by the count rather than repeating itself.
  await page.getByTestId('assistant-dismiss').click();
  await expect(assistant(page)).toBeHidden();
  await waitForItToComeBack(page, 2);

  await expect(line(page)).toContainText(noteAt(2));
  await expect(line(page)).not.toContainText(noteAt(1));
});

test('a meeting is the one thing it does not talk over', async ({ page }) => {
  test.setTimeout(240_000);
  await logInOnDay(page, 3, { brief: 'keep' });
  await beginShift(page);

  await expect(assistant(page)).toBeVisible();

  // Wednesday, half past ten: the sync takes the desk, and the desk includes
  // the helper. It is HIDDEN rather than dimmed like the rest of the
  // furniture - a joke over the top of a meeting is the one thing even this
  // character is not useless enough to attempt.
  await workUntilMinute(page, 10 * 60 + 25 - 8 * 60);

  const desktop = page.getByTestId('desktop');

  for (let minute = 0; minute < 20; minute += 1) {
    if (await desktop.getAttribute('data-takeover') === 'meeting') {
      break;
    }

    await runSimMinutes(page, 1, 1);
  }

  await expect(desktop).toHaveAttribute('data-takeover', 'meeting');
  await expect(assistant(page)).toBeHidden();

  // And out the far side it is back, with something to say about a desk that
  // has just been handed over.
  await runSimMinutes(page, 35);
  await expect(desktop).toHaveAttribute('data-takeover', 'none');
  await expect(assistant(page)).toBeVisible();
  await expect(line(page)).not.toBeEmpty();
});

test('a save taken after closing it remembers how many times', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await startMonday(page);

  await expect(assistant(page)).toBeVisible();
  await page.getByTestId('assistant-dismiss').click();
  await expect(assistant(page)).toBeHidden();

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-save').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Game saved' }),
  ).toHaveCount(1);

  await page.reload();
  await completeLogin(page, { brief: 'keep' });

  // A fresh session has never been closed, which is what makes the load below
  // a claim about the file rather than about the default.
  expect(await page.evaluate(
    () => globalThis.careerSim?.screens().assistant.dismissals ?? -1,
  )).toBe(0);

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Game loaded' }),
  ).toHaveCount(1);

  // THE GOAL: the count came back with the file, so the note it returns with
  // is the right tier - which is the only thing the count is for.
  expect(await page.evaluate(
    () => globalThis.careerSim?.screens().assistant.dismissals ?? -1,
  )).toBe(1);

  // And THE WHOLE-DAY DISMISSAL (0.3.6, P1-2): closing it holds for the day, and
  // that fact rode the save too - so a reload on the same day it was closed comes
  // back CLOSED rather than re-arriving inside the quiet the player bought. This
  // is where the mount-flag version got it wrong.
  await expect(assistant(page)).toBeHidden();

  // The day turns: the note is paid on the first paint of day two, at tier one.
  await clockOffFor(page, 1);
  await beginShift(page);
  await expect(assistant(page)).toBeVisible();
  await expect(line(page)).toContainText(noteAt(1));

  // Close it again on day two and cross into day three: the note escalates, and
  // it survives the boss beats and the checkpoint each boundary fires - none of
  // which reset it, because the state is in the store, not the object.
  await page.getByTestId('assistant-dismiss').click();
  await clockOffFor(page, 2);
  await beginShift(page);
  await expect(line(page)).toContainText(noteAt(2));
});
