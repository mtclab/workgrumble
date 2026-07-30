import { expect, type Page, test } from '@playwright/test';

import { logIn, openFromStartMenu } from './helpers';

/**
 * M2 lane-A journeys: a player takes a ticket off the queue, works out what is
 * wrong, fixes the WORLD, and watches the ticket close itself. Nothing here
 * clicks a "resolve" button, because there is not one.
 *
 * Lane B adds the Chat, Remote Assist and KB halves of these journeys.
 */

/** Runs one line in the Support Terminal and waits for it to echo back. */
async function runCommand(page: Page, line: string): Promise<void> {
  const input = page.getByTestId('cmd-input');
  await input.fill(line);
  await input.press('Enter');
  await expect(page.getByTestId('cmd-output')).toContainText(
    `C:\\SUPPORT> ${line}`,
  );
}

async function focusWindow(page: Page, appId: string): Promise<void> {
  await page.getByTestId(`taskbar-button-${appId}`).click();
  await expect(page.getByTestId(`window-${appId}`)).toHaveAttribute(
    'data-focused',
    'true',
  );
}

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

test('needs both halves of the spooler fix before the ticket closes', async ({
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

  // Step one on its own is not a fix: the backlog is still there.
  await runCommand(page, 'restart spooler');
  await expect(page.getByTestId('cmd-output')).toContainText('RUNNING');
  await focusWindow(page, 'tickets');
  await expect(row).toHaveAttribute('data-state', 'open');
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Ticket resolved' }),
  ).toHaveCount(0);

  // Step two closes it.
  await focusWindow(page, 'cmd');
  await runCommand(page, 'clearqueue hercules');
  await expect(page.getByTestId('cmd-output')).toContainText('job(s) dropped');
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
  await runCommand(page, 'unlok gpoole');
  await expect(page.getByTestId('cmd-output')).toContainText(
    'Did you mean "unlock"?',
  );
});

test('parks a ticket on the user and visibly buys back the SLA', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-locked-account').click();

  const due = page.getByTestId('ticket-detail-due');
  const remaining = page.getByTestId('ticket-detail-sla');
  const firstDue = (await due.textContent())?.trim() ?? '';
  expect(firstDue).toMatch(/^\d{2}:\d{2}$/);

  // Unparked, the clock eats into the SLA.
  await expect(remaining).not.toHaveText(
    (await remaining.textContent())?.trim() ?? '',
    { timeout: 10_000 },
  );

  await page.getByTestId('ticket-waiting-toggle').click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText(
    'Waiting on user',
  );
  await expect(page.getByTestId('ticket-waiting-toggle')).toContainText(
    'Take it back off the user',
  );

  // Parked, the deadline itself moves out - the SLA is being bought back a
  // minute at a time, which is exactly the CYA mechanic.
  await expect(due).not.toHaveText(firstDue, { timeout: 10_000 });

  await page.getByTestId('ticket-waiting-toggle').click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Open');
});

test('offers escalation only where the ticket allows it', async ({ page }) => {
  await logIn(page);
  await openFromStartMenu(page, 'tickets');

  await page.getByTestId('ticket-row-locked-account').click();
  const escalate = page.getByTestId('ticket-escalate');
  await expect(escalate).toBeDisabled();
  await expect(escalate).toHaveAttribute('title', /fixable from your desk/);

  // The KB and Chat links belong to lane B; until those apps install they say
  // so instead of quietly doing nothing.
  await expect(page.getByTestId('ticket-open-kb')).toBeDisabled();
  await expect(page.getByTestId('ticket-open-kb')).toHaveAttribute(
    'title',
    /Knowledge Base is not installed/,
  );
  await expect(page.getByTestId('ticket-open-chat')).toBeDisabled();

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
