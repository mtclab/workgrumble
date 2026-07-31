import { expect, test } from '@playwright/test';

import {
  focusWindow,
  logIn,
  logInOnDay,
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
  await expect(page.getByTestId('ticket-detail-resolution'))
    .toContainText('Closed');
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

test('needs all three steps of the spooler fix, in the honest order', async ({
  page,
}) => {
  // Tuesday, which is the morning the week hands over its office-wide fault.
  await logInOnDay(page, 2);
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

  // Clearing the queue IS stopping the spooler - the spool files belong to
  // that service, and deleting them while it holds them is precisely when
  // deletion fails. So the command says it stopped the service, and leaves it
  // stopped: this half is not a fix on its own.
  await runCommand(page, 'clearqueue hercules');
  await expect(page.getByTestId('cmd-output')).toContainText(
    'Stopping Print Spooler ... service reports STOPPED.',
  );
  await expect(page.getByTestId('cmd-output')).toContainText('job(s) dropped');
  await expect(page.getByTestId('cmd-output')).toContainText('step three');
  await runCommand(page, 'services PRINT-01');
  await expect(page.getByTestId('cmd-output')).toContainText('STOPPED');
  await focusWindow(page, 'tickets');
  await expect(row).toHaveAttribute('data-state', 'open');
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Ticket resolved' }),
  ).toHaveCount(0);

  // Step three closes it.
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
  // Business hours: before 09:00 the SLA clock is held and every deadline
  // drifts outward by the minute - "the deadline does not move" is only a
  // promise the shift makes. Start it.
  await page.getByTestId('day-state').click();
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-locked-account').click();

  const toggle = page.getByTestId('ticket-waiting-toggle');
  // The resolution clock: the countdown is in the text and the deadline is on
  // the element, because one of them moves every minute and the other must
  // not move at all until the ticket is parked.
  const remaining = page.getByTestId('ticket-detail-resolution');
  const firstDue = (await remaining.getAttribute('data-due'))?.trim() ?? '';
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
  await expect(remaining).toHaveAttribute('data-due', firstDue);
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Open');

  // Ask him something. That is the whole price.
  await page.getByTestId('ticket-open-chat').click();
  await expect(page.getByTestId('chat-heading')).toHaveText('Gary Poole');
  await page
    .getByTestId('chat-options')
    .getByRole('button', { name: /when he last logged in/ })
    .click();
  await expect(page.getByTestId('chat-outcome')).toContainText(
    'where they can see it',
  );

  await focusWindow(page, 'tickets');
  // And the question is on the ticket, in the customer-visible stream, which
  // is the only evidence the rule accepts.
  await expect(page.getByTestId('ticket-comments')).toContainText(
    'when he last logged in',
  );
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText(
    'Awaiting the user',
  );
  await expect(toggle).toContainText('Take it back off hold');

  // Parked, the deadline itself moves out - the SLA is being bought back a
  // minute at a time, which is exactly the CYA mechanic.
  await expect(remaining).not.toHaveAttribute('data-due', firstDue, {
    timeout: 10_000,
  });

  await toggle.click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Open');
});

test('offers escalation only where the ticket allows it', async ({ page }) => {
  // Three tickets and three different answers, which needs a day by which all
  // three have arrived: Monday's account, Monday's fan and Thursday's printer.
  await logInOnDay(page, 4);
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

  // The hardware ticket is the one that earns a van - but second line wants
  // a real handoff: something tried, something the user reported.
  await openFromStartMenu(page, 'about');
  await page.getByTestId('about-run-diagnostics').click();
  await focusWindow(page, 'tickets');
  await page.getByTestId('ticket-row-fan-noise').click();
  await expect(escalate).toBeEnabled();
  await escalate.click();
  await expect(page.getByTestId('handoff-tried-empty')).toHaveCount(0);
  await page
    .getByTestId('handoff-reported')
    .fill('Fan screams like a biscuit tin full of hornets.');
  await page.getByTestId('handoff-send').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Ticket resolved' }),
  ).toHaveCount(1);
  await expect(
    page.getByTestId('ticket-row-fan-noise'),
  ).toHaveAttribute('data-state', 'resolved');
});

/**
 * The looking commands, walked end to end.
 *
 * They fix nothing, which is the point: first line LOOKS with these and fixes
 * with about four verbs. The journey asserts the two halves that make them
 * worth shipping - every number on screen is derived from the estate the
 * player can see, and `ipconfig /flushdns` prints the sentence every tech has
 * typed a thousand times while changing absolutely nothing.
 */
test('walks the ipconfig family without changing a thing', async ({ page }) => {
  await logIn(page);
  await openFromStartMenu(page, 'cmd');
  const output = page.getByTestId('cmd-output');

  await runCommand(page, 'ipconfig');
  await expect(output).toContainText('IPv4 Address');
  await expect(output).toContainText('Default Gateway . . . . . . . . . : 10.42.0.1');

  await runCommand(page, 'ipconfig /all');
  await expect(output).toContainText('Physical Address');
  await expect(output).toContainText('BEIGE-BOX');

  await runCommand(page, 'ipconfig /flushdns');
  await expect(output).toContainText('Successfully flushed the DNS Resolver Cache.');
  // Nothing was fixed by saying the words, so nothing closed.
  await expect(page.getByTestId('toast')).toHaveCount(0);

  await runCommand(page, 'whoami');
  await expect(output).toContainText('workgrumble\\ppending');

  await runCommand(page, 'whoami /groups');
  await expect(output).toContainText('WORKGRUMBLE\\Print Users');

  await runCommand(page, 'systeminfo PRINT-01');
  await expect(output).toContainText('VPN Concentrator');

  // The route out of this desk goes through the box that also carries the VPN
  // and the printer, which is the estate's whole personality in three lines.
  await runCommand(page, 'tracert SALES-02');
  await expect(output).toContainText('print-01.workgrumble.local');
  await expect(output).toContainText('Trace complete.');

  await runCommand(page, 'nslookup PRINT-01');
  await expect(output).toContainText('may still be on fire');

  await runCommand(page, 'nslookup wibble');
  await expect(output).toContainText('Non-existent domain');

  // The trade's spelling of a command the terminal already had.
  await runCommand(page, 'net user gpoole');
  await expect(output).toContainText('LOCKED OUT');
  await runCommand(page, 'net view PRINT-01');
  await expect(output).toContainText('is not something this terminal does');
});

/**
 * The rail on bulk-close, walked as a player would hit it.
 *
 * Attaching duplicates to a parent is the real flood workflow and it is also
 * the obvious way to cheat: tick everything, attach it to the one ticket you
 * fixed, and forty reporters are told their problem is solved. The queue lets
 * the player try, and the engine says no in a sentence - because whether a
 * ticket is somebody's duplicate is a fact about that ticket, written into its
 * own resolution rule by the person who wrote it.
 *
 * The cascade journey itself needs duplicate-capable content, which arrives
 * with lane C's certificate flood; the mechanism is proven at graph level in
 * `src/world/tickets/parent.test.ts` and through the shipped driver in
 * `src/shell/day-driver.test.ts`.
 */
test('refuses to attach a ticket that is nobody\'s duplicate', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'tickets');

  // The parent is the ticket you have open; the duplicates are the ones you
  // tick. Neither of Monday's two is a duplicate of anything.
  await page.getByTestId('ticket-row-rotated-screen').click();
  const attach = page.getByTestId('ticket-link-parent');
  await expect(attach).toBeDisabled();
  await expect(attach).toHaveAttribute('title', /Tick the tickets on the left/);
  await expect(page.getByTestId('ticket-parent-standing')).toContainText(
    'Nothing is attached to this one',
  );

  await page.getByTestId('ticket-pick-locked-account').check();
  await expect(attach).toBeEnabled();
  await expect(attach).toContainText('Attach 1 ticked to this');
  await attach.click();

  await expect(page.getByTestId('ticket-refusal')).toContainText(
    'not a duplicate of anything',
  );
  // Nothing moved: the ticket is still its own problem, still on the queue.
  await expect(page.getByTestId('ticket-parent-standing')).toContainText(
    'Nothing is attached to this one',
  );
  await expect(
    page.getByTestId('ticket-row-locked-account'),
  ).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('ticket-parent-outcome')).toBeHidden();
});

/**
 * The lockout, read rather than guessed.
 *
 * An unlock used to be a button somebody pressed because the word "locked" was
 * on the screen. The directory now tells the whole story - how many wrong
 * passwords, when the door shut, whether the account has been used at all -
 * and the other two states that look identical from the reporter's chair say
 * out loud which fix they want instead.
 */
test('tells the lockout story in Active Dictionary, and refuses the wrong fixes', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'directory');
  await page.getByTestId('directory-row-gary').click();

  await expect(page.getByTestId('directory-detail-status')).toHaveText(
    'Locked out',
  );
  await expect(page.getByTestId('directory-detail-status')).toHaveAttribute(
    'data-state',
    'locked',
  );
  await expect(page.getByTestId('directory-detail-bad-passwords')).toContainText(
    '5 since it was last cleared',
  );
  await expect(page.getByTestId('directory-detail-locked-since')).toContainText(
    '08:00',
  );
  // Two weeks away: he has not signed in since before the log starts, which is
  // the other half of the diagnosis.
  await expect(page.getByTestId('directory-detail-last-logon')).toContainText(
    'Not since before this log starts',
  );
  await expect(page.getByTestId('directory-detail-must-change')).toHaveText('No');

  // The other two fixes are offered and refused, in the words that say which
  // fault this actually is.
  const enable = page.getByTestId('directory-enable');
  await expect(enable).toBeDisabled();
  await expect(enable).toHaveAttribute('title', /is not disabled/);

  await page.getByTestId('directory-unlock').click();
  await expect(page.getByTestId('directory-detail-status')).toHaveText('Fine');
  await expect(page.getByTestId('directory-detail-bad-passwords')).toContainText(
    '0 since it was last cleared',
  );
  await expect(page.getByTestId('directory-detail-locked-since')).toHaveText(
    'Not locked',
  );

  // And the machine at that desk wrote all of it down.
  await openFromStartMenu(page, 'events');
  await page.getByTestId('events-machine-gary').click();
  await expect(
    page.getByTestId('events-table').locator('[data-event="4625"]'),
  ).toContainText('Bad password count is now 5');
  await expect(
    page.getByTestId('events-table').locator('[data-event="4740"]'),
  ).toContainText('gpoole');
  await expect(
    page.getByTestId('events-table').locator('[data-event="4767"]'),
  ).toContainText('unlocked by the service desk');
});

/**
 * A reset is the fix for an expired password and a sticky note for everything
 * else - and on this desk it also clears the lockout and sets "must change at
 * next logon", which is a bundle rather than a law of nature. The control has
 * to SAY so: a button labelled "Reset password" that silently ticks two boxes
 * teaches that a directory reset unlocks and forces a change by its nature,
 * and a real reset dialog asks about both.
 */
test('says on the button that a reset here does all three', async ({ page }) => {
  await logIn(page);
  await openFromStartMenu(page, 'directory');
  await page.getByTestId('directory-row-ada').click();
  await expect(page.getByTestId('directory-detail-must-change')).toHaveText('No');

  const reset = page.getByTestId('directory-reset-password');
  await expect(reset).toContainText('unlock');
  await expect(reset).toContainText('force change');

  await reset.click();
  await expect(page.getByTestId('directory-outcome')).toContainText(
    'this desk\'s reset does all three every time, where a real one asks',
  );
  await expect(page.getByTestId('directory-detail-must-change')).toContainText(
    'at next logon',
  );
});
