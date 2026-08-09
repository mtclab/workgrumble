import { expect, type Page, test } from '@playwright/test';

import {
  beginShift,
  completeLogin,
  logIn,
  openFromStartMenu,
  runCommand,
  workUntilMinute,
} from './helpers';

/**
 * The Timesheet window, on the built artifact (0.30.0, slice 1).
 *
 * The total walk drives the sheet as far as one week can: the desk shape opens
 * on the Friday of the probation run and the engineer's edits are walked at the
 * MSP. What lives here is the pair of JOURNEYS the walk cannot hold, each of
 * which ends somewhere the walk never goes:
 *
 *  - THE DESK SHEET, FILED FROM THE WINDOW. The week run files the desk sheet
 *    from the terminal, and a sheet can be filed exactly once - so the other
 *    door, the one a player who never opens a terminal uses, needs a week of
 *    its own. It is also where the joke is: one bucket, one button, no line to
 *    argue with, done before the sigh finishes.
 *  - THE ENGINEER'S, ALL THE WAY THROUGH A RELOAD. Pad a line, make another
 *    one vague, send it in, save, reload the page, load - and the sheet comes
 *    back frozen with the claims standing on it. That last step is the one the
 *    whole record-versus-claim split is for, and nothing in the walk reloads a
 *    padded sheet.
 *
 * Both are DIRECTION and STATE rather than arithmetic: the minute a line is
 * worth is a deterministic unit test's question (`src/shell/apps/
 * timesheet.test.ts`), and a browser asserting one against a fast-forwarded
 * clock is a lesson this project has already paid for. Where a number is
 * needed, it is READ off the row and driven from - never computed here.
 */

const SWITCH_KEY = 'workgrumble/switch';

/** A career crossing into the MSP with the standing a promotion needs. */
const ARRIVAL = {
  employer: 'msp',
  career: {
    reputation: 74,
    title: 'IT Support Technician',
    farmFund: 30_000,
    trail: null,
  },
};

async function arriveAtMsp(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, record]) => {
      window.localStorage.setItem(key, JSON.stringify(record));
    },
    [SWITCH_KEY, ARRIVAL] as [string, typeof ARRIVAL],
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });

  const arrival = page.getByTestId('window-updates');

  if (await arrival.count()) {
    const close = arrival.getByTestId('window-close');

    if (await close.count()) {
      await close.first().click();
    }
  }

  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
}

/** The handle - `1.2` - of the nth line on the sheet, read off the row. */
async function handleAt(page: Page, index: number): Promise<string> {
  const row = page.locator('[data-testid^="timesheet-line-"]').nth(index);

  await expect(row).toBeVisible();

  const handle = await row.getAttribute('data-handle');

  expect(handle, 'every line on the sheet carries its handle').toBeTruthy();
  return handle ?? '';
}

test('the desk sheet is one bucket, one button, and no argument', async ({
  page,
}) => {
  await page.clock.install();
  await logIn(page);
  await beginShift(page);
  // Enough of a morning for the day to exist on the sheet at all: it is
  // derived from a clock that has actually run, not typed up in advance.
  await workUntilMinute(page, 120);

  await openFromStartMenu(page, 'timesheet');

  await expect(page.getByTestId('timesheet-app')).toBeVisible();
  await expect(page.getByTestId('timesheet-stance'))
    .toContainText('nothing on it to decide');

  // One line for the day, at seven and a half hours, attributed to nobody -
  // which is the whole of a service-desk sheet and the whole of the joke.
  const rows = page.locator('[data-testid^="timesheet-line-"]');

  await expect(rows).toHaveCount(1);

  const handle = await handleAt(page, 0);

  await expect(page.getByTestId(`timesheet-worked-${handle}`))
    .toHaveText('7h 30m');
  await expect(rows.first()).toHaveAttribute('data-billable', 'false');
  await expect(rows.first()).toContainText('Service Desk');

  // Nothing on it has a second number, because nobody has said anything about
  // it - and there is nothing here to say it WITH.
  await expect(rows.first()).toHaveAttribute('data-gap', 'unedited');
  await expect(page.locator('[data-testid^="timesheet-minutes-"]'))
    .toHaveCount(0);
  await expect(page.locator('[data-testid^="timesheet-detail-"]'))
    .toHaveCount(0);
  // And no "unattributed" row: a desk sheet attributes nothing at all, so a
  // row saying so under every day would be noise pretending to be a mechanic.
  await expect(page.locator('[data-testid^="timesheet-unattributed-"]'))
    .toHaveCount(0);

  await expect(page.getByTestId('timesheet-stamp')).toContainText('Due at the');

  await page.getByTestId('timesheet-submit').click();

  await expect(page.getByTestId('timesheet-outcome'))
    .toContainText('Timesheet submitted');
  await expect(page.getByTestId('timesheet-stamp'))
    .toContainText('Submitted at');
  // A filed piece of paper: the one button it had is refused in the world's
  // own sentence rather than quietly doing it twice.
  await expect(page.getByTestId('timesheet-submit')).toBeDisabled();
  await expect(page.getByTestId('timesheet-submit'))
    .toHaveAttribute('title', /That sheet has gone in/);
});

test('the engineer pads, blurs a line, and it survives a reload', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await arriveAtMsp(page);

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'promotion accept');
  await expect(page.getByTestId('cmd-output'))
    .toContainText('Systems Engineer now');

  // A mixed morning, so the sheet has something to attribute: the project's
  // own audit, and half an hour later somebody else's estate entirely.
  await runCommand(page, 'fw audit ARD-FW-01');
  await workUntilMinute(page, 110);
  await runCommand(page, 'rotate ELM-WS-01 90');
  await workUntilMinute(page, 150);

  await openFromStartMenu(page, 'timesheet');

  await expect(page.getByTestId('timesheet-stance'))
    .toContainText('A line per customer');

  const rows = page.locator('[data-testid^="timesheet-line-"]');

  // The project as an attributable line of its own, carrying its own name,
  // with at least one other estate beside it - which is what a sheet "per
  // customer" means and what a single-line one would prove nothing about. The
  // exact number of lines is a question about what else the morning touched,
  // and that is the unit suite's business rather than this one's.
  await expect(rows.filter({ hasText: 'edge firewall' })).toHaveCount(1);
  expect(await rows.count()).toBeGreaterThan(1);

  const first = await handleAt(page, 0);
  const second = await handleAt(page, 1);

  // The record, read off the row rather than parsed back out of "2h 30m": the
  // pad is driven from what the engine says the line was worth, so this cannot
  // be a test that quietly claims less than the truth on a slow morning.
  const worked = Number(await rows.first().getAttribute('data-worked'));

  expect(worked).toBeGreaterThan(0);
  await expect(rows.first()).toHaveAttribute('data-gap', 'unedited');
  await expect(page.getByTestId(`timesheet-claimed-${first}`)).toBeHidden();

  const claim = worked + 60;

  await page.getByTestId(`timesheet-minutes-${first}`).fill(String(claim));
  await page.getByTestId(`timesheet-put-${first}`).click();

  // Both numbers, side by side, and the record did not follow the claim: the
  // row's own reading of the gap says OVER, the second figure is on screen, and
  // what the engine recorded is still less than what was typed. RELATIVE, never
  // the same string twice - the line the player is standing in is still running,
  // so its worked figure grows between one assertion and the next, and pinning
  // it to an earlier read is the lesson this project paid for in 0.4.3. The
  // arithmetic of a line is a unit test's business.
  await expect(rows.first()).toHaveAttribute('data-gap', 'over');
  await expect(page.getByTestId(`timesheet-claimed-${first}`)).toBeVisible();
  expect(Number(await rows.first().getAttribute('data-worked')))
    .toBeLessThan(claim);
  await expect(page.getByTestId('timesheet-outcome'))
    .toContainText('The records still say what they said');

  // The other axis on the other line: what the sentence says, rather than what
  // the number is. A vague line stops being an invoice line and becomes a word.
  await expect(page.getByTestId(`timesheet-reads-${second}`))
    .toContainText('/1998');
  await page.getByTestId(`timesheet-detail-${second}`).selectOption('vague');

  await expect(rows.nth(1)).toHaveAttribute('data-detail', 'vague');
  await expect(page.getByTestId(`timesheet-reads-${second}`))
    .toHaveText('consulting');

  await page.getByTestId('timesheet-submit').click();
  await expect(page.getByTestId('timesheet-stamp'))
    .toContainText('Submitted at');
  // Frozen: not one line on it offers an edit any more.
  await expect(page.locator('[data-testid^="timesheet-minutes-"]'))
    .toHaveCount(0);
  await expect(page.locator('[data-testid^="timesheet-detail-"]'))
    .toHaveCount(0);

  const claimed = await page.getByTestId(`timesheet-claimed-${first}`)
    .innerText();

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-save').click();
  await expect(page.getByTestId('toast')).toContainText('Game saved');

  await page.reload();
  await completeLogin(page);
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Game loaded' }),
  ).toHaveCount(1);

  // A new browser session, a world stood up from nothing and then loaded over:
  // the sheet is still filed, the pad is still on it, and the vague line is
  // still vague. The claim is world state, so it comes back or it was never
  // really made.
  await openFromStartMenu(page, 'timesheet');

  await expect(page.getByTestId('timesheet-stamp'))
    .toContainText('Submitted at');
  await expect(page.getByTestId('timesheet-submit')).toBeDisabled();
  await expect(page.getByTestId(`timesheet-claimed-${first}`))
    .toHaveText(claimed);
  await expect(page.locator('[data-testid^="timesheet-line-"]').first())
    .toHaveAttribute('data-gap', 'over');
  await expect(page.getByTestId(`timesheet-reads-${second}`))
    .toHaveText('consulting');
});
