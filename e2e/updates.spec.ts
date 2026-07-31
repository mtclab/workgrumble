import { expect, test } from '@playwright/test';

import { completeLogin, logIn, openFromStartMenu } from './helpers';

/**
 * Releases arrive as an operating-system update, which means the window has to
 * appear exactly once and then never stop being readable.
 *
 * The version this browser has been told about is seeded before the page
 * loads, because that is the only honest way to be a workstation that
 * remembers an older build. Nothing else about the test is faked.
 */

const SEEN_VERSION_KEY = 'workgrumble/seen-version';

test('says nothing on a workstation that has never run anything else', async ({
  page,
}) => {
  await logIn(page);

  // The one that would otherwise put a window in front of every new tester's
  // first boot, forever, announcing an update that did not happen.
  await expect(page.getByTestId('window-updates')).toHaveCount(0);
});

test('announces itself once on the first boot of a newer build', async ({
  page,
}) => {
  await page.addInitScript((key: string) => {
    window.localStorage.setItem(key, '0.0.1');
  }, SEEN_VERSION_KEY);

  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });

  const window_ = page.getByTestId('window-updates');
  await expect(window_).toBeVisible();
  await expect(page.getByTestId('updates-installed'))
    .toContainText(/DeskPro WorkGroup Update \d+\.\d+\.\d+ has been installed/);
  await expect(page.getByTestId('updates-line').first())
    .toContainText('Addresses an issue');
  await expect(
    page.getByTestId('toast').filter({ hasText: 'has been updated' }),
  ).toBeVisible();

  // Once. The record is written at boot rather than when the window is read,
  // so a second boot is a quiet one even if nobody looked at the notes.
  await page.reload();
  await completeLogin(page, { brief: 'keep' });
  await expect(page.getByTestId('window-updates')).toHaveCount(0);
});

test('keeps the notes readable after the window has been closed', async ({
  page,
}) => {
  await logIn(page);

  await openFromStartMenu(page, 'updates');
  await expect(page.getByTestId('updates-line').first()).toBeVisible();

  await page.getByTestId('close-updates').click();
  await expect(page.getByTestId('window-updates')).toHaveCount(0);

  // A changelog you can only read once is a changelog nobody has read.
  await openFromStartMenu(page, 'updates');
  await expect(page.getByTestId('updates-installed')).toBeVisible();
});
