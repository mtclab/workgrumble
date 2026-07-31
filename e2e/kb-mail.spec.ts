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
  // The learner path: it says WHY the queue goes first, and in which order.
  await expect(page.getByTestId('kb-body')).toContainText(
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

test('reads the inbox on the shift clock and marks it read', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'mail');

  await expect(page.getByTestId('mail-summary')).toContainText('2 unread');
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
  await expect(page.getByTestId('mail-summary')).toContainText('1 unread');

  await page.getByTestId('mail-row-onboarding').click();
  await expect(page.getByTestId('mail-subject')).toContainText(
    'Welcome to Workgrumble',
  );
  await expect(page.getByTestId('mail-summary')).toContainText('0 unread');
});
