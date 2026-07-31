import { expect, type Page, test } from '@playwright/test';

import {
  logInOnDay,
  openFromStartMenu,
  runCommand,
  runSimMinutes,
  SHIFT_MINUTES,
  workUntil,
} from './helpers';

/**
 * The four beats of the week that are longer than a ticket.
 *
 * A shortcut whose bill arrives the next morning. A favour that means there is
 * no ticket at all. Forty people with one fault. And the same outage twice,
 * two days apart, at the same minute. Every one of them is a fork or a span,
 * and neither survives being tested one ticket at a time - which is why they
 * are here, on the built artifact, played both ways where there are two.
 */

/** Runs the rest of the day out and starts the next one. */
async function nextDay(page: Page, day: number): Promise<void> {
  await runSimMinutes(page, SHIFT_MINUTES);
  await expect(page.getByTestId('day-state')).toHaveText('Day end');
  await page.getByTestId('scorecard-clock-off').click();
  await expect(page.getByTestId('sim-clock-day'))
    .toHaveText(`Day ${String(day + 1)}`);
}

/* -- the enrolment nobody checked ----------------------------------------- */

test('the shortcut closes the ticket and lands in the post next morning', async ({
  page,
}) => {
  await logInOnDay(page, 3, { brief: 'keep' });
  await workUntil(page, 140);

  // She is in a hurry, and nothing in this building will stop you.
  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'mfa praval');
  await expect(page.getByTestId('cmd-output'))
    .toContainText('New authenticator enrolled');

  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-mfa-reregister').click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Closed');

  // Wednesday out, Thursday in.
  await nextDay(page, 3);
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();

  await openFromStartMenu(page, 'mail');
  await page.getByTestId('mail-row-security-incident').click();
  await expect(page.getByTestId('mail-subject')).toContainText('INCIDENT');
});

test('thirty seconds of checking means the post never comes', async ({
  page,
}) => {
  await logInOnDay(page, 3, { brief: 'keep' });
  await workUntil(page, 140);

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'verify praval');
  await runCommand(page, 'mfa praval');

  await nextDay(page, 3);
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();

  await openFromStartMenu(page, 'mail');
  await expect(page.getByTestId('mail-row-security-incident')).toHaveCount(0);
});

/* -- the favour ------------------------------------------------------------ */

test('doing it off the books means there is no ticket to be paid for', async ({
  page,
}) => {
  await logInOnDay(page, 2, { brief: 'keep' });
  // He messages at ten past two and gets round to the form at twenty past.
  await workUntil(page, 372);

  await openFromStartMenu(page, 'chat');
  await page.getByTestId('chat-person-terry').click();
  await expect(page.getByTestId('chat-transcript')).toContainText('quick favour');

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'resetpw tblunt');
  await expect(page.getByTestId('cmd-output'))
    .toContainText('Temporary password issued');

  await runSimMinutes(page, 20);

  // The work happened and the week has no record that it did.
  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('ticket-row-must-change-password'))
    .toHaveCount(0);
});

test('sending him to the form means there is a ticket, and eight points', async ({
  page,
}) => {
  await logInOnDay(page, 2, { brief: 'keep' });
  await workUntil(page, 372);

  await openFromStartMenu(page, 'chat');
  await page.getByTestId('chat-person-terry').click();
  // "Ask him to raise it properly, and say why it helps him."
  await page.getByTestId('chat-option-1').click();

  await runSimMinutes(page, 20);

  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-must-change-password').click();
  await expect(page.getByTestId('ticket-detail-title'))
    .toContainText('This keeps happening');

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'resetpw tblunt');

  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-must-change-password').click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Closed');
});

/* -- the flood ------------------------------------------------------------- */

test('Thursday: forty reports, one certificate, one repair', async ({
  page,
}) => {
  await logInOnDay(page, 4, { brief: 'keep' });
  await workUntil(page, 180);

  // The first thing everybody tries, and the refusal that explains why the
  // flood keeps arriving while somebody keeps restarting things.
  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'restart VPN Concentrator');
  await expect(page.getByTestId('cmd-output')).toContainText('already running');

  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-pick-vpn-cert-dup-ada').check();
  await page.getByTestId('ticket-pick-vpn-cert-dup-gary').check();
  await page.getByTestId('ticket-row-vpn-cert-expired').click();
  await page.getByTestId('ticket-link-parent').click();
  await expect(page.getByTestId('ticket-parent-standing'))
    .toContainText('2 ticket(s) attached');

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'renewcert VPN Concentrator');
  await expect(page.getByTestId('cmd-output'))
    .toContainText('New certificate issued');

  await openFromStartMenu(page, 'tickets');

  for (const slug of [
    'vpn-cert-expired',
    'vpn-cert-dup-ada',
    'vpn-cert-dup-gary',
  ]) {
    await page.getByTestId(`ticket-row-${slug}`).click();
    await expect(page.getByTestId('ticket-detail-state'))
      .toContainText('Closed');
  }
});

/* -- the arc --------------------------------------------------------------- */

test('the printer on Tuesday is a timetable by the Thursday', async ({
  page,
}) => {
  await logInOnDay(page, 2, { brief: 'keep' });
  await workUntil(page, 70);

  // Tuesday: turn it back on and get on with the day.
  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-print-warehouse').click();
  await page.getByTestId('remote-power-printer-warehouse').click();

  await nextDay(page, 2);
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
  await nextDay(page, 3);
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();

  // Thursday, and it is off again. The log on that box now has both outages
  // in it, and they are at the same minute.
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-vacuum-thursday').click();
  await page.getByTestId('ticket-open-events').click();
  await expect(page.getByTestId('events-app')).toContainText('lost power');

  // Power alone is a standing appointment rather than a fix.
  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-print-warehouse').click();
  await page.getByTestId('remote-power-printer-warehouse').click();

  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-vacuum-thursday').click();
  await expect(page.getByTestId('ticket-detail-state')).not.toContainText(
    'Closed',
  );

  // The fix is a piece of tape, and it is in Facilities.
  await openFromStartMenu(page, 'chat');
  await page.getByTestId('chat-person-vic').click();
  await page.getByTestId('chat-option-0').click();
  await page.getByTestId('chat-option-0').click();
  await expect(page.getByTestId('chat-transcript')).toContainText('DO NOT UNPLUG');

  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-vacuum-thursday').click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Closed');
});
