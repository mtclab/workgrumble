import { expect, test } from '@playwright/test';

import {
  focusWindow,
  logIn,
  openFromStartMenu,
  runCommand,
} from './helpers';

/**
 * M2 lane-A journeys: a player takes a ticket off the queue, works out what is
 * wrong, fixes the WORLD, and watches the ticket close itself. Nothing here
 * clicks a "resolve" button, because there is not one.
 *
 * The Chat, Remote Assist and KB halves live in their own spec files.
 */

test('closes the locked-account ticket through Active Dictionary', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'tickets');

  // Queue -> ticket detail.
  const row = page.getByTestId('ticket-row-locked-account');
  await row.click();
  await expect(page.getByTestId('ticket-detail-title')).toContainText(
    'password is wrong',
  );
  await expect(page.getByTestId('ticket-detail-body')).toContainText(
    'locked out',
  );
  await expect(row).toHaveAttribute('data-state', 'open');

  // Diagnose in the directory: the account, not the password.
  await openFromStartMenu(page, 'directory');
  await page.getByTestId('directory-search').fill('gpoole');
  await page.getByTestId('directory-row-gary').click();
  await expect(page.getByTestId('directory-detail-status')).toHaveText(
    'Locked out',
  );

  // Fix the world.
  await page.getByTestId('directory-unlock').click();
  await expect(page.getByTestId('directory-outcome')).toContainText('Unlocked');
  await expect(page.getByTestId('directory-detail-status')).toHaveText('Fine');

  // The engine closes the ticket by itself and the shell says so.
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Ticket resolved' }),
  ).toHaveCount(1);

  // And the queue reflects it without being told twice.
  await focusWindow(page, 'tickets');
  await expect(row).toHaveAttribute('data-state', 'resolved');
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Closed');
  await expect(page.getByTestId('ticket-detail-sla')).toHaveText('Closed');
});

test('closes the locked-account ticket through the terminal', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-locked-account').click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Open');

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'users gpoole');
  await expect(page.getByTestId('cmd-output')).toContainText('LOCKED OUT');

  await runCommand(page, 'unlock gpoole');
  await expect(page.getByTestId('cmd-output')).toContainText('unlocked');
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Ticket resolved' }),
  ).toHaveCount(1);

  await focusWindow(page, 'tickets');
  await expect(
    page.getByTestId('ticket-row-locked-account'),
  ).toHaveAttribute('data-state', 'resolved');
});

test('closes the rotated-screen ticket through the terminal', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-rotated-screen').click();
  await expect(page.getByTestId('ticket-detail-title')).toContainText('hacked');

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'rotate SALES-02 0');
  await expect(page.getByTestId('cmd-output')).toContainText(
    'display set to 0 degrees',
  );
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Ticket resolved' }),
  ).toHaveCount(1);

  await focusWindow(page, 'tickets');
  await expect(
    page.getByTestId('ticket-row-rotated-screen'),
  ).toHaveAttribute('data-state', 'resolved');
});

test('needs both halves of the spooler fix, in the honest order', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'tickets');
  const row = page.getByTestId('ticket-row-wedged-spooler');
  await row.click();
  await expect(page.getByTestId('ticket-detail-title')).toContainText(
    'haunted',
  );

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'services PRINT-01');
  await expect(page.getByTestId('cmd-output')).toContainText('WEDGED');
  await runCommand(page, 'queue hercules');
  await expect(page.getByTestId('cmd-output')).toContainText('47 job(s)');

  // The wrong way round is refused outright: queued jobs outlive a restart,
  // so a spooler started in front of them is handed the same bad job back.
  await runCommand(page, 'restart spooler');
  await expect(page.getByTestId('cmd-output')).toContainText(
    'It will just choke on the same job again.',
  );
  await runCommand(page, 'services PRINT-01');
  await expect(page.getByTestId('cmd-output')).toContainText('WEDGED');

  // Step one on its own is not a fix either: the service is still wedged.
  await runCommand(page, 'clearqueue hercules');
  await expect(page.getByTestId('cmd-output')).toContainText('job(s) dropped');
  await focusWindow(page, 'tickets');
  await expect(row).toHaveAttribute('data-state', 'open');
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Ticket resolved' }),
  ).toHaveCount(0);

  // Step two closes it.
  await focusWindow(page, 'cmd');
  await runCommand(page, 'restart spooler');
  await expect(page.getByTestId('cmd-output')).toContainText('RUNNING');
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Ticket resolved' }),
  ).toHaveCount(1);

  await focusWindow(page, 'tickets');
  await expect(row).toHaveAttribute('data-state', 'resolved');
});

test('explains every refusal in words a person can act on', async ({
  page,
}) => {
  await logIn(page);

  // A control that would be refused is disabled BEFORE the click, and says why.
  await openFromStartMenu(page, 'directory');
  await page.getByTestId('directory-search').fill('awhitlock');
  await page.getByTestId('directory-row-ada').click();
  const unlock = page.getByTestId('directory-unlock');
  await expect(unlock).toBeDisabled();
  await expect(unlock).toHaveAttribute('data-blocked', 'true');
  await expect(unlock).toHaveAttribute('title', /is not locked/);

  // And a refusal that only the engine can know arrives as a sentence.
  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'restart vpn');
  await expect(page.getByTestId('cmd-output')).toContainText(
    'is already running',
  );
  await runCommand(page, 'rotate SALES-02 45');
  await expect(page.getByTestId('cmd-output')).toContainText('not an angle');

  // The fan is hardware. It is listed with the services because it reports a
  // status, and the terminal refuses to pretend that makes it restartable.
  await runCommand(page, 'services BEIGE-BOX');
  await expect(page.getByTestId('cmd-output')).toContainText(
    '[hardware, not restartable]',
  );
  await runCommand(page, 'restart fan');
  await expect(page.getByTestId('cmd-output')).toContainText(
    'It will not help.',
  );

  await runCommand(page, 'unlok gpoole');
  await expect(page.getByTestId('cmd-output')).toContainText(
    'Did you mean "unlock"?',
  );
});

test('never aims a directory action at an account the search has hidden', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'directory');
  await page.getByTestId('directory-search').fill('gpoole');
  await page.getByTestId('directory-row-gary').click();
  await expect(page.getByTestId('directory-detail-username')).toHaveText(
    'gpoole',
  );
  await expect(page.getByTestId('directory-detail-status')).toHaveText(
    'Locked out',
  );

  // Filter him out. The detail pane follows the list, not the memory of what
  // was selected before it - otherwise every button here is pointed at
  // somebody the player can no longer see.
  await page.getByTestId('directory-search').fill('awhitlock');
  await expect(page.getByTestId('directory-row-gary')).toHaveCount(0);
  await expect(page.getByTestId('directory-detail-username')).toHaveText(
    'awhitlock',
  );
  await expect(page.getByTestId('directory-detail-status')).toHaveText('Fine');

  // Filter everybody out and there is nothing to aim anything at: no detail,
  // no action row, nothing to click by accident.
  await page.getByTestId('directory-search').fill('zzzz');
  await expect(page.getByTestId('directory-empty')).toBeVisible();
  await expect(page.getByTestId('directory-detail-empty')).toBeVisible();
  await expect(page.getByTestId('directory-unlock')).toHaveCount(0);
  await expect(page.getByTestId('directory-reset-password')).toHaveCount(0);

  // And nothing happened to Gary while he was off screen.
  await page.getByTestId('directory-search').fill('gpoole');
  await expect(page.getByTestId('directory-detail-status')).toHaveText(
    'Locked out',
  );
});

/**
 * The CYA rule end to end. Parking a ticket on the user stops their SLA, so
 * it costs a real question first - otherwise the toggle is a button that
 * freezes every clock in the building and triage stops being a game.
 */
test('parks a ticket only once the user has actually been asked', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-locked-account').click();

  const toggle = page.getByTestId('ticket-waiting-toggle');
  const due = page.getByTestId('ticket-detail-due');
  const remaining = page.getByTestId('ticket-detail-sla');
  const firstDue = (await due.textContent())?.trim() ?? '';
  expect(firstDue).toMatch(/^\d{2}:\d{2}$/);

  // Nobody has spoken to Gary yet, so the toggle is refused BEFORE the click
  // and says why in the same words the engine would have used.
  await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveAttribute('data-blocked', 'true');
  await expect(toggle).toHaveAttribute(
    'title',
    /have not actually asked them anything yet/,
  );

  // Meanwhile the clock eats the SLA and the deadline stays exactly where it
  // was: nothing has been bought back.
  await expect(remaining).not.toHaveText(
    (await remaining.textContent())?.trim() ?? '',
    { timeout: 10_000 },
  );
  await expect(due).toHaveText(firstDue);
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Open');

  // Ask him something. That is the whole price.
  await page.getByTestId('ticket-open-chat').click();
  await expect(page.getByTestId('chat-heading')).toHaveText('Gary Poole');
  await page
    .getByTestId('chat-options')
    .getByRole('button', { name: /when he last logged in/ })
    .click();
  await expect(page.getByTestId('chat-outcome')).toContainText(
    'Logged as asked',
  );

  await focusWindow(page, 'tickets');
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText(
    'Waiting on user',
  );
  await expect(toggle).toContainText('Take it back off the user');

  // Parked, the deadline itself moves out - the SLA is being bought back a
  // minute at a time, which is exactly the CYA mechanic.
  await expect(due).not.toHaveText(firstDue, { timeout: 10_000 });

  await toggle.click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Open');
});

test('offers escalation only where the ticket allows it', async ({ page }) => {
  await logIn(page);
  await openFromStartMenu(page, 'tickets');

  await page.getByTestId('ticket-row-locked-account').click();
  const escalate = page.getByTestId('ticket-escalate');
  await expect(escalate).toBeDisabled();
  await expect(escalate).toHaveAttribute('title', /fixable from your desk/);

  // The cross-app links are live now that Chat, Remote Assist and the KB are
  // installed - and the one with nowhere to go still says why.
  await expect(page.getByTestId('ticket-open-kb')).toBeEnabled();
  await expect(page.getByTestId('ticket-open-chat')).toBeEnabled();
  const remote = page.getByTestId('ticket-open-remote');
  await expect(remote).toBeEnabled();
  await expect(remote).toHaveAttribute('data-blocked', 'false');

  // The spooler ticket is reported by somebody with no workstation of their
  // own, so Remote Assist has no screen to open - and says so rather than
  // opening the wrong machine.
  await page.getByTestId('ticket-row-wedged-spooler').click();
  await expect(remote).toBeDisabled();
  await expect(remote).toHaveAttribute(
    'title',
    /No workstation is signed out to this reporter/,
  );

  // The hardware ticket is the one that earns a van.
  await page.getByTestId('ticket-row-fan-noise').click();
  await expect(escalate).toBeEnabled();
  await escalate.click();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Ticket resolved' }),
  ).toHaveCount(1);
  await expect(
    page.getByTestId('ticket-row-fan-noise'),
  ).toHaveAttribute('data-state', 'resolved');
});
