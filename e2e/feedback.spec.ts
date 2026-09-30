import { expect, test } from '@playwright/test';

import { issueBadge, logIn, openFromStartMenu } from './helpers';
import { OFFICE } from './office';

/**
 * "Report a real problem": the one window in the building that is not in
 * character, and the one whose promises about what it collects have to be
 * checked rather than believed.
 *
 * The submission journey needs a badge, because the Worker will not take a
 * report from a browser that is not carrying one - the per-badge rate limit is
 * the only thing standing between the tracker and forty copies of the same
 * complaint, and it cannot count what it cannot tell apart.
 */

test('shows what it will send before it sends anything', async ({ page }) => {
  await logIn(page);
  await openFromStartMenu(page, 'feedback');

  // Everything the report carries besides the words, printed. "What is this
  // sending" has to be a question a player answers by reading.
  const context = page.getByTestId('feedback-context');
  await expect(context).toContainText('Day 1 of the week');
  await expect(context).toContainText(/Build \d+\.\d+\.\d+/);
  await expect(context).toContainText(/engine \d+\.\d+\.\d+/);
  await expect(context).toContainText('save format');
  await expect(context).toContainText('Window in front');

  await expect(page.getByTestId('feedback-notice'))
    .toContainText('do not put anything personal');

  // And the tick that decides whether the badge goes with it starts OFF.
  await expect(page.getByTestId('feedback-contact')).not.toBeChecked();
});

test('asks for a line rather than filing a blank report', async ({ page }) => {
  await logIn(page);
  await openFromStartMenu(page, 'feedback');

  await page.getByTestId('feedback-details').fill('It went wrong somehow.');
  await page.getByTestId('feedback-send').click();

  await expect(page.getByTestId('feedback-refusal'))
    .toContainText('needs a line saying what happened');
  await expect(page.getByTestId('feedback-outcome')).toBeHidden();
});

test('files a report against a badge and says it has gone', async ({
  page,
}) => {
  await page.goto(OFFICE);
  await page.keyboard.press('Space');
  await issueBadge(page);
  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('desktop')).toBeVisible();

  await openFromStartMenu(page, 'feedback');
  await page.getByTestId('feedback-summary')
    .fill('The spooler button did nothing on Thursday');
  await page.getByTestId('feedback-details')
    .fill('Clicked it four times. The queue stayed where it was.');
  await page.getByTestId('feedback-contact').check();
  await page.getByTestId('feedback-send').click();

  await expect(page.getByTestId('feedback-outcome')).toContainText('Filed');
  await expect(page.getByTestId('feedback-refusal')).toBeHidden();

  // The form empties itself, because a report that is still sitting in the box
  // is a report somebody files twice.
  await expect(page.getByTestId('feedback-summary')).toHaveValue('');
  await expect(page.getByTestId('feedback-contact')).not.toBeChecked();
});
