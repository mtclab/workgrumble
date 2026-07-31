import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  openFromStartMenu,
  realMs,
  runSimMinutes,
  workUntil,
} from './helpers';

/**
 * The repaint gate: a minute passing must not rebuild the screen.
 *
 * Every list in this shell repaints on every world change, and the ticket queue
 * repaints on every minute of the shift as well, because the SLA countdown on
 * each row moves. The old answer was to empty the list and build every row
 * again - which is invisible in a screenshot and ruinous in the hand: a ticked
 * duplicate box unticks itself, a half-made triage closes, and whatever the
 * player had selected is a new element by the time they click it.
 *
 * The assertion is element IDENTITY. A marker is written onto the live DOM
 * node, the clock is run, and the marker has to still be there - a rebuilt row
 * would come back without it. The rows say something new; they are not new.
 */

/** Writes a marker onto the element behind a locator. */
async function mark(target: Locator, name: string): Promise<void> {
  await target.evaluate((element, value) => {
    element.setAttribute('data-probe', value);
  }, name);
}

async function expectSameElement(target: Locator, name: string): Promise<void> {
  await expect(target).toHaveAttribute('data-probe', name);
}

/** Reads a cell's text now, for comparing against it after the clock moves. */
async function textOf(target: Locator): Promise<string> {
  return (await target.textContent()) ?? '';
}

async function startShiftWithQueue(page: Page): Promise<void> {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.keyboard.press('Space');
  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('desktop')).toBeVisible();
  // Tick 90 of the day: the shift is running, the morning pile is in, and
  // there is a countdown on every row to watch move.
  await workUntil(page, 90);
}

test('keeps every queue row, and the selection on it, across a minute', async ({
  page,
}) => {
  await startShiftWithQueue(page);
  await openFromStartMenu(page, 'tickets');

  const row = page.getByTestId('ticket-row-locked-account');
  await row.click();
  await expect(page.getByTestId('ticket-detail-title')).toBeVisible();

  // Three things a rebuild would throw away: the row element, the detail pane
  // that names it, and a duplicate box the player has ticked but not filed.
  const pick = page.getByTestId('ticket-pick-locked-account');
  await pick.check();
  await mark(row, 'queue-row');
  await mark(page.getByTestId('ticket-detail-title'), 'detail');

  const countdown = row.locator('.ticket-row-sla');
  const rowBefore = await textOf(countdown);
  const detailBefore = await textOf(
    page.getByTestId('ticket-detail-resolution'),
  );

  await page.clock.runFor(realMs(5, 1));

  // The clocks did move, so this test is about a live screen rather than a
  // frozen one that would pass identity by doing nothing at all.
  await expect(page.getByTestId('ticket-detail-resolution'))
    .not.toHaveText(detailBefore);
  await expect(countdown).not.toHaveText(rowBefore);

  await expectSameElement(row, 'queue-row');
  await expectSameElement(page.getByTestId('ticket-detail-title'), 'detail');
  await expect(pick).toBeChecked();
  await expect(row).toHaveAttribute('data-selected', 'true');
});

/**
 * A ticket ARRIVING is a different question: the row that was not there has to
 * be built, and every row that was there has to survive it.
 */
test('builds a row for the ticket that arrives and keeps the rest', async ({
  page,
}) => {
  await startShiftWithQueue(page);
  await openFromStartMenu(page, 'tickets');

  const rows = page.getByTestId('tickets-queue').locator('li');
  const before = await rows.count();
  const survivor = page.getByTestId('ticket-row-locked-account');
  await mark(survivor, 'survivor');

  // The drip: run until the queue is longer than it was.
  await runSimMinutes(page, 120);
  await expect(rows).not.toHaveCount(before);
  await expectSameElement(survivor, 'survivor');
});

/**
 * The same discipline, on the three other lists that repaint on every world
 * change: the directory, the event log and the remote machine list.
 */
test('keeps the directory, event and remote rows across a world change', async ({
  page,
}) => {
  await startShiftWithQueue(page);

  await openFromStartMenu(page, 'directory');
  const account = page.getByTestId('directory-row-gary');
  await account.click();
  await mark(account, 'directory');

  await openFromStartMenu(page, 'events');
  await page.getByTestId('events-machine-print').click();
  const machine = page.getByTestId('events-machine-print');
  await mark(machine, 'events');
  const firstEvent = page.getByTestId('events-row-0');
  await mark(firstEvent, 'event-row');

  await openFromStartMenu(page, 'remote');
  const workstation = page.getByTestId('remote-machine-print');
  await mark(workstation, 'remote');

  // A real change to the world, dispatched through the shipped UI - which is
  // what makes every open app repaint.
  await page.getByTestId('remote-reboot').click();
  await expect(page.getByTestId('remote-outcome')).toContainText('Rebooted');
  await runSimMinutes(page, 10);

  await expectSameElement(workstation, 'remote');
  await expectSameElement(machine, 'events');
  await expectSameElement(firstEvent, 'event-row');
  await expectSameElement(account, 'directory');
});
