import { expect, type Page, test } from '@playwright/test';

import {
  logInOnDay,
  openFromStartMenu,
  resolvedToast,
  runCommand,
  workUntil,
} from './helpers';

/**
 * One journey per ticket the M4 roster added, on the built artifact.
 *
 * The solvability gate proves every one of these can be closed at graph level;
 * these prove a player can get at them. Different failure, different test: a
 * verb with no surface, a command that resolves the wrong node, a queue row
 * whose id nobody can click - none of those are visible from inside the world,
 * and all of them are the whole product from outside it.
 *
 * Each one walks to the day the week deals the ticket on, works past the minute
 * it arrives, and closes it the way the ticket's own content says it can be
 * closed. Ticks count from 08:00, which is what the day schedule is written in.
 */

/** A ticket's row in the queue, and the state its detail pane reports. */
async function expectClosed(page: Page, slug: string): Promise<void> {
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId(`ticket-row-${slug}`).click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Closed');
}

/* -- Monday --------------------------------------------------------------- */

test('the frozen computer is a mouse with no batteries in it', async ({
  page,
}) => {
  await logInOnDay(page, 1, { brief: 'keep' });
  // It drips in after lunch, and the jitter can move it either way, so this
  // walks comfortably past the latest minute it can land on.
  await workUntil(page, 360);

  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-ada').click();
  await expect(page.getByTestId('remote-battery-ada-mouse'))
    .toContainText('Battery 0%');

  await page.getByTestId('remote-replace-battery-ada-mouse').click();
  await expect(resolvedToast(page)).toHaveCount(1);
  await expectClosed(page, 'flat-mouse');
});

/* -- Tuesday -------------------------------------------------------------- */

test('the warehouse printer comes back on from the hardware panel', async ({
  page,
}) => {
  await logInOnDay(page, 2, { brief: 'keep' });
  await workUntil(page, 70);

  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-print-warehouse').click();
  await page.getByTestId('remote-power-printer-warehouse').click();

  await expect(resolvedToast(page)).toHaveCount(1);
  await expectClosed(page, 'vacuum-tuesday');
});

test('granting the mailbox brings the same man back about sending', async ({
  page,
}) => {
  await logInOnDay(page, 2, { brief: 'keep' });
  await workUntil(page, 320);

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'grant kboateng sales');
  await expect(page.getByTestId('cmd-output'))
    .toContainText('now has Full Access');

  await expectClosed(page, 'mailbox-access');

  // And there he is again, in the same queue, about the half nobody asked for.
  await page.getByTestId('ticket-row-sendas-missing').click();
  await expect(page.getByTestId('ticket-detail-title'))
    .toContainText('will not let me send');

  await openFromStartMenu(page, 'directory');
  await page.getByTestId('directory-row-kwame').click();
  await page.getByTestId('directory-group-picker')
    .selectOption('group:sales-send-as');
  await page.getByTestId('directory-add-group').click();

  await expectClosed(page, 'sendas-missing');
});

/* -- Wednesday ------------------------------------------------------------ */

test('the new phone is enrolled after somebody checks who she is', async ({
  page,
}) => {
  await logInOnDay(page, 3, { brief: 'keep' });
  await workUntil(page, 140);

  await openFromStartMenu(page, 'cmd');
  // The wrong flavour of fix first, because the refusal is the teaching.
  await runCommand(page, 'revoke praval');
  await expect(page.getByTestId('cmd-output'))
    .toContainText('the fix for that is a new enrolment');

  await runCommand(page, 'verify praval');
  await expect(page.getByTestId('cmd-output'))
    .toContainText('Identity check recorded');
  await runCommand(page, 'mfa praval');
  await expect(page.getByTestId('cmd-output'))
    .toContainText('New authenticator enrolled');

  await expectClosed(page, 'mfa-reregister');
});

test('the new starter gets the seat a leaver has been holding', async ({
  page,
}) => {
  await logInOnDay(page, 3, { brief: 'keep' });
  await workUntil(page, 70);

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'licence give rtulliver');
  await expect(page.getByTestId('cmd-output')).toContainText('no free seats');

  await runCommand(page, 'licence take cpeach');
  await expect(page.getByTestId('cmd-output')).toContainText('Seat reclaimed');
  await runCommand(page, 'licence give rtulliver');
  await expect(page.getByTestId('cmd-output')).toContainText('Seat assigned');

  await expectClosed(page, 'licence-exhausted');
});

test('the announced window closed an hour ago and the drive is still down', async ({
  page,
}) => {
  await logInOnDay(page, 3, { brief: 'keep' });
  await workUntil(page, 220);

  // The mail that said it would be back at eleven is in the inbox, from
  // Monday, where everybody deleted it.
  await openFromStartMenu(page, 'mail');
  await page.getByTestId('mail-row-maintenance-window').click();
  await expect(page.getByTestId('mail-subject')).toContainText('09:00-11:00');

  // The duplicate is attached to the incident, and the incident is repaired.
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-pick-share-dup-terry').check();
  await page.getByTestId('ticket-row-share-maintenance').click();
  await page.getByTestId('ticket-link-parent').click();
  await expect(page.getByTestId('ticket-parent-standing'))
    .toContainText('1 ticket(s) attached');

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'restart file sharing');
  await expect(page.getByTestId('cmd-output')).toContainText('RUNNING');

  await expectClosed(page, 'share-maintenance');
  await page.getByTestId('ticket-row-share-dup-terry').click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Closed');
});

/* -- Thursday ------------------------------------------------------------- */

test('the door stays open once the tablet stops typing', async ({ page }) => {
  await logInOnDay(page, 4, { brief: 'keep' });
  await workUntil(page, 70);

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'forget tablet');
  await expect(page.getByTestId('cmd-output'))
    .toContainText('Stored credentials cleared');
  await runCommand(page, 'unlock hmarsh');
  await expect(page.getByTestId('cmd-output')).toContainText('unlocked');

  await expectClosed(page, 'stale-device-relock');
});

/* -- Friday --------------------------------------------------------------- */

test('the man who reported the phish gets the rule and the reply', async ({
  page,
}) => {
  await logInOnDay(page, 5, { brief: 'keep' });
  await workUntil(page, 70);

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'rule on quarantine');
  await expect(page.getByTestId('cmd-output')).toContainText('is now on');

  await expectClosed(page, 'phishing-report');

  // The reply is the half that pays, so it is on the ticket where he can see
  // it rather than in a work note where he cannot.
  await openFromStartMenu(page, 'chat');
  await page.getByTestId('chat-person-dennis').click();
  await expect(page.getByTestId('chat-transcript'))
    .toContainText('Nobody writes back');
});

test('the backup agent that stopped itself at nine oh seven', async ({
  page,
}) => {
  await logInOnDay(page, 5, { brief: 'keep' });
  await workUntil(page, 180);

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'restart backup');
  await expect(page.getByTestId('cmd-output')).toContainText('RUNNING');

  await expectClosed(page, 'coverup-backup');
});

test('the report nobody raised in March is escalated with the date', async ({
  page,
}) => {
  await logInOnDay(page, 5, { brief: 'keep' });
  await workUntil(page, 230);

  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-hr-report-macro').click();
  await expect(page.getByTestId('ticket-detail-title')).toContainText('March');

  // Escalation is a real answer to this one, and the form is what makes it
  // one: second line take tickets on a form, not on trust. What was tried is
  // filled in from what was actually done to the estate, so the only thing
  // anybody types is the symptom.
  await page.getByTestId('ticket-escalate').click();
  await page.getByTestId('handoff-reported').fill(
    'Headcount report has not generated since March; needed at 15:00 today.',
  );
  await page.getByTestId('handoff-send').click();

  await expect(page.getByTestId('ticket-detail-state')).toContainText('Closed');
});
