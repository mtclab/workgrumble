import { expect, test } from '@playwright/test';

import {
  focusWindow,
  logIn,
  logInOnDay,
  openFromStartMenu,
} from './helpers';

test('opens the KB at the article the ticket names', async ({ page }) => {
  // The office-wide printer fault is Thursday's, because Thursday is the day
  // the week's ramp says should hurt - so this walks the week to it.
  await logInOnDay(page, 4);
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-wedged-spooler').click();
  await page.getByTestId('ticket-open-kb').click();

  await expect(page.getByTestId('window-kb')).toBeVisible();
  await expect(page.getByTestId('kb-reference')).toHaveText('kb/print-spooler');
  await expect(page.getByTestId('kb-title')).toContainText('print spooler');
  // Filed the way a real one is: the symptom in the reporter's words, where
  // it happens, the steps in order, and then why.
  await expect(page.getByTestId('kb-state')).toHaveText('Published');
  await expect(page.getByTestId('kb-issue')).toContainText('haunted');
  await expect(page.getByTestId('kb-environment')).toContainText('PRINT-01');
  await expect(page.getByTestId('kb-resolution')).toContainText(
    'STOP THE SPOOLER, then empty the queue',
  );
  // The learner path: it says WHY the queue goes first, and in which order.
  await expect(page.getByTestId('kb-cause')).toContainText(
    'stop, clear, start',
  );
  await expect(page.getByTestId('kb-body')).toContainText(
    'survive a restart on purpose',
  );
  await expect(page.getByTestId('kb-row-print-spooler')).toHaveAttribute(
    'data-selected',
    'true',
  );

  // See-also is a real link, not a decoration.
  await page.getByTestId('kb-see-also-power-cycle').click();
  await expect(page.getByTestId('kb-reference')).toHaveText('kb/power-cycle');
  await expect(page.getByTestId('kb-title')).toContainText(
    'turning it off and on again',
  );
  // Learner-honest: a restart drops what was in memory and hands back
  // everything that was already written down, queue included.
  await expect(page.getByTestId('kb-body')).toContainText(
    'only holding in memory',
  );
  await expect(page.getByTestId('kb-body')).toContainText(
    'does not empty a print queue',
  );

  // A second ticket re-aims the window that is already open, rather than
  // leaving the player on somebody else's article.
  await focusWindow(page, 'tickets');
  await page.getByTestId('ticket-row-locked-account').click();
  await page.getByTestId('ticket-open-kb').click();
  await expect(page.getByTestId('kb-reference')).toHaveText(
    'kb/account-lockout',
  );
  await expect(page.getByTestId('kb-body')).toContainText('lockout');
});

/**
 * The KCS loop, end to end: read the base while working the ticket, then say
 * which article you actually used. The link is the solve - it lands on the
 * ticket as a reference a report can count and as a work note the next person
 * can read, and the ticket's own KB button follows it afterwards.
 */
test('links the article that solved it onto the ticket', async ({ page }) => {
  await logIn(page);
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-locked-account').click();
  await expect(page.getByTestId('ticket-article-current')).toContainText(
    'Nothing linked yet',
  );

  // Read the base first, which is the half of the loop that teaches anything.
  await page.getByTestId('ticket-open-kb').click();
  await expect(page.getByTestId('kb-reference')).toHaveText(
    'kb/account-lockout',
  );
  await page.getByTestId('kb-see-also-three-ways-an-account-says-no').click();
  await expect(page.getByTestId('kb-resolution')).toContainText(
    'Disabled: somebody switched the account off on purpose',
  );

  await focusWindow(page, 'tickets');
  await page
    .getByTestId('ticket-article-picker')
    .selectOption('kb/three-ways-an-account-says-no');
  await page.getByTestId('ticket-link-article').click();

  await expect(page.getByTestId('ticket-article-current')).toContainText(
    'kb/three-ways-an-account-says-no',
  );
  // It counts as a work note, which is where the evidence of a solve lives.
  await expect(page.getByTestId('ticket-worknotes')).toContainText(
    'Linked knowledge article kb/three-ways-an-account-says-no',
  );
  // Linking it twice is refused, in the words the button already carried.
  await expect(page.getByTestId('ticket-link-article')).toBeDisabled();
  await expect(page.getByTestId('ticket-link-article')).toHaveAttribute(
    'title',
    /already the article on this ticket/,
  );

  // And the ticket's own KB button now follows what was linked rather than
  // what the ticket was filed under.
  await page.getByTestId('ticket-open-kb').click();
  await expect(page.getByTestId('kb-reference')).toHaveText(
    'kb/three-ways-an-account-says-no',
  );
});

/**
 * Every shelf has a draft on it. This one is in the list where anybody can
 * find it, flagged on the row and on the page, with the wrong step called out
 * by the editor who never got round to fixing it.
 */
test('shows the draft article as a draft, in the list with the rest', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'kb');

  const row = page.getByTestId('kb-row-vpn-on-the-print-server');
  await expect(row).toHaveAttribute('data-state', 'draft');
  await row.click();

  await expect(page.getByTestId('kb-state')).toContainText('Draft');
  await expect(page.getByTestId('kb-resolution')).toContainText(
    'Do not do this in working hours',
  );
  await expect(page.getByTestId('kb-cause')).toContainText('load-bearing beige');
});

test('reads the inbox on the shift clock and marks it read', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'mail');

  await expect(page.getByTestId('mail-summary')).toContainText('3 unread');
  const nag = page.getByTestId('mail-row-queue-nag');
  await expect(nag).toHaveAttribute('data-unread', 'true');
  await expect(page.getByTestId('mail-empty')).toBeVisible();

  await nag.click();
  await expect(page.getByTestId('mail-subject')).toContainText('the queue');

  // Sim time, not wall-clock time: the stamps are shift minutes rendered as
  // the same clock the taskbar shows.
  await expect(page.getByTestId('mail-reader').locator('article'))
    .toHaveCount(2);
  const first = page.getByTestId('mail-message-time-queue-nag-1');
  await expect(first).toContainText('Day 1');
  await expect(first).toContainText('08:05');
  await expect(page.getByTestId('mail-message-time-queue-nag-2'))
    .toContainText('08:25');
  await expect(page.getByTestId('mail-message-from-queue-nag-1')).toHaveText(
    'Desmond Frisk',
  );

  await expect(nag).toHaveAttribute('data-unread', 'false');
  await expect(page.getByTestId('mail-summary')).toContainText('2 unread');

  await page.getByTestId('mail-row-onboarding').click();
  await expect(page.getByTestId('mail-subject')).toContainText(
    'Welcome to Workgrumble',
  );
  await expect(page.getByTestId('mail-summary')).toContainText('1 unread');

  // The third thread is Wednesday's warning, sent well in advance so that
  // nobody can say they were not told (they will say it anyway).
  await page.getByTestId('mail-row-maintenance-window').click();
  await expect(page.getByTestId('mail-subject')).toContainText('PLANNED');
  await expect(page.getByTestId('mail-summary')).toContainText('0 unread');
});
