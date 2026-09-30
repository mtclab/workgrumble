import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  focusWindow,
  openFromStartMenu,
  realMs,
  runSimMinutes,
  workUntil,
} from './helpers';
import { OFFICE } from './office';

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
  await page.goto(OFFICE);
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
  // Gary's machine is the one with a Monday log (his lockout landed there);
  // the print server's Monday is honestly empty and has no rows to keep.
  await page.getByTestId('events-machine-gary').click();
  const machine = page.getByTestId('events-machine-gary');
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

/**
 * And the conversation, which is the one made entirely of controls.
 *
 * Chat rebuilt its contact list and its whole panel on every world change, so
 * the meters moving every five minutes threw away the option the player was
 * reading and put an identical-looking new one in its place - along with the
 * transcript, its scroll position and anything they had selected in it. The
 * list is keyed and the panel is compared now, the same two answers the other
 * lists and panes got.
 */
test('keeps the contact and the option in the player\'s hand while the meters tick', async ({
  page,
}) => {
  await startShiftWithQueue(page);
  await openFromStartMenu(page, 'chat');
  await page.getByTestId('chat-person-ada').click();

  const contact = page.getByTestId('chat-person-ada');
  const option = page
    .getByTestId('chat-options')
    .getByRole('button', { name: /anybody else was at her desk/ });
  const transcript = page.getByTestId('chat-transcript');
  await mark(contact, 'contact');
  await mark(option, 'option');
  await mark(transcript, 'transcript');

  // Twenty minutes of an ordinary shift: four meter ticks at least, and a
  // queue moving underneath a window that is not about the queue.
  await runSimMinutes(page, 20);

  await expectSameElement(contact, 'contact');
  await expectSameElement(option, 'option');
  await expectSameElement(transcript, 'transcript');

  // The other half of the contract: saying something DOES rebuild it, and the
  // panel says the new thing.
  await option.click();
  await expect(page.getByTestId('chat-outcome'))
    .toContainText('Filed as a work note');
  await expect(transcript).not.toHaveAttribute('data-probe', 'transcript');
  await expect(
    page
      .getByTestId('chat-options')
      .getByRole('button', { name: /which keys Gareth pressed/ }),
  ).toBeVisible();
});

/**
 * And the two DETAIL panes, which are the ones that actually cost the player
 * something.
 *
 * Both hold a dropdown - the group picker in the directory, the rotation
 * picker in Remote Assist - and both were rebuilt on every world change. The
 * meters move every few minutes of every shift, so the pane was being thrown
 * away and rebuilt under the player's cursor while they were choosing from it,
 * which shuts an open dropdown and loses the choice.
 *
 * The clock is left running here rather than stepped: what is being proven is
 * that ordinary time passing - meters ticking, suspicion draining, the remote
 * taskbar clock ticking over - does not touch a pane whose subject has not
 * changed. And then that changing the subject DOES rebuild it, because a pane
 * that never repaints is not a fix, it is a worse bug.
 */
test('keeps the detail panes standing while the meters tick', async ({
  page,
}) => {
  await startShiftWithQueue(page);

  await openFromStartMenu(page, 'directory');
  await page.getByTestId('directory-row-gary').click();
  const accountPane = page.getByTestId('directory-detail-username');
  const groupPicker = page.getByTestId('directory-group-picker');
  await mark(accountPane, 'account-pane');
  await mark(groupPicker, 'group-picker');

  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-print').click();
  const rotationPicker = page.getByTestId('remote-rotation-picker');
  const remoteTray = page.getByTestId('remote-tray');
  await mark(rotationPicker, 'rotation-picker');
  const trayBefore = await textOf(remoteTray);

  // Twenty minutes of an ordinary shift: four meter ticks at least, and
  // twenty minutes on their taskbar clock.
  await runSimMinutes(page, 20);

  // Their clock moved, so this window is live rather than frozen...
  await expect(remoteTray).not.toHaveText(trayBefore);
  // ...and nothing else in either pane was rebuilt under it.
  await expectSameElement(rotationPicker, 'rotation-picker');
  await expectSameElement(accountPane, 'account-pane');
  await expectSameElement(groupPicker, 'group-picker');

  // The other half of the contract: a pane whose subject changes IS rebuilt,
  // and says the new thing.
  await rotationPicker.selectOption('180');
  await page.getByTestId('remote-apply-rotation').click();
  await expect(page.getByTestId('remote-rotation-state'))
    .toHaveText('180 degrees');
  await expect(rotationPicker).not.toHaveAttribute('data-probe', 'rotation-picker');

  // Through the raise-loop, because the line under it reaches INSIDE the
  // directory: the clock is running here by design and a raise the day takes
  // back would leave that click hunting a covered button.
  await focusWindow(page, 'directory');
  await page.getByTestId('directory-reset-password').click();
  await expect(page.getByTestId('directory-outcome'))
    .toContainText('Temporary password');
  await expect(page.getByTestId('directory-detail-must-change'))
    .toContainText('Yes');
  await expect(accountPane).not.toHaveAttribute('data-probe', 'account-pane');
});
