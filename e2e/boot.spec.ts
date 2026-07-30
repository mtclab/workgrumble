import { expect, test } from '@playwright/test';

/** Journey 1: boot -> skip -> login -> desktop. */
test('boots, skips the POST gag, logs in and lands on the desktop', async ({
  page,
}) => {
  await page.goto('/');

  const boot = page.getByTestId('boot-screen');
  await expect(boot).toBeVisible();
  await expect(page.getByTestId('boot-hint')).toContainText('skip');

  await page.keyboard.press('Space');

  await expect(boot).toBeHidden();
  const login = page.getByTestId('login-screen');
  await expect(login).toBeVisible();
  await expect(page.getByTestId('login-user')).toContainText('Pat Pending');
  await expect(page.getByTestId('login-hint')).toContainText('sticky note');

  await page.getByTestId('login-password').fill('any password at all');
  await page.getByTestId('login-submit').click();

  await expect(login).toBeHidden();
  await expect(page.getByTestId('desktop')).toBeVisible();
  await expect(page.getByTestId('taskbar')).toBeVisible();
  await expect(page.getByTestId('desktop-icon-about')).toBeVisible();
  await expect(page.getByTestId('desktop-icon-bubbles')).toBeVisible();
  await expect(page.getByTestId('sim-clock-time')).toContainText(':');
});

test('restarting from the login screen returns to boot without a reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('login-screen')).toBeVisible();

  await page.getByTestId('login-restart').click();

  await expect(page.getByTestId('boot-screen')).toBeVisible();
  await expect(page.getByTestId('login-screen')).toBeHidden();
});
