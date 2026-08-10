import { expect, test } from '@playwright/test';

import {
  beginShift,
  logInOnDay,
  openFromDesktopIcon,
  openFromStartMenu,
  runSimMinutes,
  underPause,
} from './helpers';

/**
 * Hubbub on the built artifact, through the real entry point: the channel
 * client the company rolled out (0.5.0 slice 1), driven the way a player
 * meets it.
 *
 * The units prove the arithmetic - the arrival filter, the badge counts, the
 * thread grouping, the ledger's one write. What is here is the JOURNEY those
 * numbers exist for:
 *
 * - a room that is honestly empty at nine, and filling by ten past;
 * - a badge that says two and flies the @ before the room is opened, and
 *   says nothing after - because having been on screen is what "read" means;
 * - a thread drawn one level under its root;
 * - a message about a ticket that opens the queue, where the credit lives;
 * - the taskbar's own dot, worn in the room's toolbar off the same field;
 * - and a read ledger that survives the window closing, so no badge charges
 *   twice for one Monday.
 *
 * Monday's authored rooms content: the welcome in #announcements at 09:05,
 * the @-mention about the locked account in #helpdesk at 09:40, the reply
 * threaded under it at 09:48, and #water-cooler shipped empty on purpose.
 */

test('fills the rooms at the authored minutes, badges them, and reads on sight', async ({
  page,
}) => {
  await logInOnDay(page, 1);
  await beginShift(page);

  // Nine o'clock, held still: the rollout has landed and nothing has been
  // said in it yet. The window opens on the first room, honestly empty, and
  // no badge anywhere claims otherwise.
  await underPause(page, async () => {
    await openFromStartMenu(page, 'hubbub');
    await expect(page.getByTestId('hubbub-summary')).toContainText('0 unread');
    await expect(page.getByTestId('hubbub-empty')).toBeVisible();
    await expect(page.getByTestId('hubbub-badge-announcements')).toBeHidden();
    await expect(page.getByTestId('hubbub-badge-helpdesk')).toBeHidden();
  });

  // Ten past: the welcome has arrived, in the room that is on screen - so it
  // is readable, and BECAUSE it was on screen its badge never lights. The
  // topic register is the product's own: very excited about itself.
  await runSimMinutes(page, 10);
  await underPause(page, async () => {
    await expect(page.getByTestId('hubbub-message-welcome'))
      .toContainText('Welcome to Hubbub');
    await expect(page.getByTestId('hubbub-topic'))
      .toContainText('single source of truth');
    await expect(page.getByTestId('hubbub-badge-announcements')).toBeHidden();
  });

  // Ten to ten: both #helpdesk messages have arrived in a room that is NOT
  // on screen. Two unread, and the badge flies the @ because one of them
  // names the player.
  await runSimMinutes(page, 40);
  await underPause(page, async () => {
    await expect(page.getByTestId('hubbub-badge-helpdesk')).toHaveText('2 @');
    await expect(page.getByTestId('hubbub-channel-helpdesk'))
      .toHaveAttribute('data-mention', 'true');
    await expect(page.getByTestId('hubbub-summary')).toContainText('2 unread');

    // Opening the room is the goal the badge was pointing at: the mention is
    // readable and flagged, the reply is drawn one level under its root, and
    // what has been on screen stops being unread.
    await page.getByTestId('hubbub-channel-helpdesk').click();
    await expect(page.getByTestId('hubbub-message-gary-account'))
      .toContainText('any movement on my account');
    await expect(page.getByTestId('hubbub-mention-gary-account'))
      .toHaveText('mentions you');
    await expect(
      page.getByTestId('hubbub-thread-gary-account')
        .getByTestId('hubbub-message-owen-reply'),
    ).toContainText('It is never the ticket system.');
    await expect(page.getByTestId('hubbub-badge-helpdesk')).toBeHidden();
    await expect(page.getByTestId('hubbub-channel-helpdesk'))
      .toHaveAttribute('data-mention', 'false');
    await expect(page.getByTestId('hubbub-summary')).toContainText('0 unread');

    // The room shipped with nothing in it says so, rather than rendering a
    // blank pane.
    await page.getByTestId('hubbub-channel-water-cooler').click();
    await expect(page.getByTestId('hubbub-empty')).toBeVisible();

    // And the ledger is the save's, not the window's: closed and reopened,
    // nothing arrived-and-read charges again.
    await page.getByTestId('close-hubbub').click();
    await expect(page.getByTestId('window-hubbub')).toHaveCount(0);
    await openFromDesktopIcon(page, 'hubbub');
    await expect(page.getByTestId('hubbub-badge-helpdesk')).toBeHidden();
    await expect(page.getByTestId('hubbub-badge-announcements')).toBeHidden();
    await expect(page.getByTestId('hubbub-summary')).toContainText('0 unread');
  });
});

test('opens the queue from a message that is about a ticket', async ({
  page,
}) => {
  await logInOnDay(page, 1);
  await beginShift(page);
  await runSimMinutes(page, 45);

  await underPause(page, async () => {
    await openFromStartMenu(page, 'hubbub');
    await page.getByTestId('hubbub-channel-helpdesk').click();

    // The message wears the ticket it is about, and the button under it lands
    // on the queue - the surface where the clock and the credit live. The
    // ticket named is Monday's own inherited one, so the queue has it.
    const open = page.getByTestId('hubbub-open-ticket-gary-account');
    // The button wears the ticket's own title ("About: Computer says the
    // password is wrong (it is not wrong)"), which is how the message names
    // the queue item it is about.
    await expect(open).toContainText('password is wrong');
    await open.click();
    await expect(page.getByTestId('window-tickets'))
      .toHaveAttribute('data-focused', 'true');
    await expect(page.getByTestId('ticket-row-locked-account')).toBeVisible();
  });
});

test('wears the dot the taskbar sets: one status, read off one field', async ({
  page,
}) => {
  await logInOnDay(page, 1);
  await beginShift(page);
  await openFromStartMenu(page, 'hubbub');

  const worn = page.getByTestId('hubbub-presence');
  await expect(worn).toHaveAttribute('data-presence', 'available');
  await expect(worn).toContainText('Available');

  // Set on the tray, read in the room: there is exactly one dot. What a red
  // dot DOES to a channel-source arrival is slice 3's question - nothing in
  // these rooms rings the desk, so there is nothing yet for it to turn away.
  await page.getByTestId('presence-dnd').click();
  await expect(worn).toHaveAttribute('data-presence', 'dnd');
  await expect(worn).toContainText('Do not disturb');

  await page.getByTestId('presence-available').click();
  await expect(worn).toHaveAttribute('data-presence', 'available');
});
