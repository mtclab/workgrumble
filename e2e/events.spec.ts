import { expect, test } from '@playwright/test';

import {
  focusWindow,
  logIn,
  logInOnDay,
  openFromStartMenu,
  runCommand,
} from './helpers';

/**
 * Event Viewer: the tool that tells you WHICH thing to fix.
 *
 * Nothing in this window changes anything, which is the whole point of it. The
 * journey is the real one - a refusal the player does not understand, a look
 * at what the box wrote down about itself, and a fix that turns up in the log
 * as its own line.
 */
test('reads the crash the print server logged, and filters it', async ({
  page,
}) => {
  // Thursday: the week keeps its only office-wide fault there.
  await logInOnDay(page, 4);

  // The refusal first, because that is the order a player meets it in.
  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'restart spooler');
  await expect(page.getByTestId('cmd-output')).toContainText(
    'It will just choke on the same job again.',
  );

  await openFromStartMenu(page, 'events');
  await page.getByTestId('events-machine-print').click();

  // 7031, in the words it is famous for - and with the count, which is the
  // half that turns a mystery into a timetable.
  const crash = page.getByTestId('events-table').locator('[data-event="7031"]');
  await expect(crash).toHaveAttribute('data-level', 'error');
  await expect(crash).toContainText(
    'The Print Spooler service terminated unexpectedly. It has done this '
    + '1 time(s). It will do it again.',
  );
  await expect(crash).toContainText('Service Control Manager');

  // The queue piling up behind it is the printer's own complaint, at a
  // different level - which is what the filter is for.
  await expect(
    page.getByTestId('events-table').locator('[data-event="372"]'),
  ).toHaveAttribute('data-level', 'warning');

  await page.getByTestId('events-filter').selectOption('error');
  await expect(crash).toBeVisible();
  await expect(
    page.getByTestId('events-table').locator('[data-event="372"]'),
  ).toHaveCount(0);

  await page.getByTestId('events-filter').selectOption('information');
  await expect(crash).toHaveCount(0);
  await expect(page.getByTestId('events-log-empty')).toContainText(
    'Nothing at that level',
  );

  // Fix it properly, and the box writes down that it came back.
  await page.getByTestId('events-filter').selectOption('all');
  await focusWindow(page, 'cmd');
  await runCommand(page, 'clearqueue hercules');
  await runCommand(page, 'restart spooler');

  await focusWindow(page, 'events');
  await expect(
    page.getByTestId('events-table').locator('[data-event="7036"]'),
  ).toContainText('entered the running state');
  await expect(
    page.getByTestId('events-table').locator('[data-event="307"]'),
  ).toContainText('emptied');
});

/**
 * The property the recurring-arc tickets rest on: a machine remembers days it
 * has already been through. The dispatch log is drained at every boundary; the
 * log on the box is not, and a fault that shows up as two outages days apart
 * has to be readable from one screen.
 */
test('still shows what happened on the days before', async ({ page }) => {
  await logInOnDay(page, 4);
  await openFromStartMenu(page, 'events');

  // Monday's queue was left to breach on the way here, and the agent said so
  // on the machines those incidents were about.
  await page.getByTestId('events-machine-ada').click();
  const missed = page.getByTestId('events-table').locator('[data-event="1101"]');
  await expect(missed.first()).toContainText('Service level objective missed');
  await expect(missed.first()).toContainText('Day 1');
});

test('says so plainly when a machine has nothing to report', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'events');

  await page.getByTestId('events-machine-beige-box').click();
  await expect(page.getByTestId('events-log-empty')).toContainText(
    'BEIGE-BOX has nothing to report',
  );
  await expect(page.getByTestId('events-count')).toContainText(
    '0 of 0 event(s) on BEIGE-BOX',
  );
});

/** The ticket knows which box the reporter is at; the log is one click away. */
test('opens the event log at the reporter\'s machine from the ticket', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-locked-account').click();
  await page.getByTestId('ticket-open-events').click();

  await expect(page.getByTestId('window-events')).toBeVisible();
  await expect(page.getByTestId('events-count')).toContainText('PAYROLL-04');
  await expect(
    page.getByTestId('events-table').locator('[data-event="4740"]'),
  ).toContainText('gpoole');

  // The rotated screen is nobody's event: her machine has nothing to say, and
  // the app says so rather than showing an empty table.
  await focusWindow(page, 'tickets');
  await page.getByTestId('ticket-row-rotated-screen').click();
  await page.getByTestId('ticket-open-events').click();
  await expect(page.getByTestId('events-log-empty')).toContainText(
    'SALES-02 has nothing to report',
  );
});
