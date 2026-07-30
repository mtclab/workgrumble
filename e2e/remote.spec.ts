import { expect, test } from '@playwright/test';

import {
  focusWindow,
  logIn,
  openFromStartMenu,
  resolvedToast,
} from './helpers';

/**
 * Remote Assist journeys. The gag has to be VISIBLE, not merely modelled: a
 * rotated screen is asserted through the computed CSS transform on the remote
 * viewport, before the fix and after it. `matrix(0, 1, -1, 0, 0, 0)` is a
 * quarter turn; `matrix(1, 0, 0, 1, 0, 0)` is upright.
 */

const TURNED = 'matrix(0, 1, -1, 0, 0, 0)';
/** The other quarter turn. 270 is not 90 with a different label on it. */
const COUNTER_TURNED = 'matrix(0, -1, 1, 0, 0, 0)';
const UPSIDE_DOWN = 'matrix(-1, 0, 0, -1, 0, 0)';
const UPRIGHT = 'matrix(1, 0, 0, 1, 0, 0)';

test('closes the rotated-screen ticket from inside Remote Assist', async ({
  page,
}) => {
  await logIn(page);

  // Park Remote Assist on somebody else's box first, so the ticket link has
  // to actually re-aim it rather than landing on whatever was already shown.
  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-print').click();
  await expect(page.getByTestId('remote-hostname')).toHaveText('PRINT-01');

  await openFromStartMenu(page, 'tickets');
  const row = page.getByTestId('ticket-row-rotated-screen');
  await row.click();
  await expect(page.getByTestId('ticket-detail-title')).toContainText('hacked');

  // The ticket detail opens Remote Assist ON the reporter's machine.
  await page.getByTestId('ticket-open-remote').click();
  await expect(page.getByTestId('window-remote')).toBeVisible();
  await expect(page.getByTestId('remote-hostname')).toHaveText('SALES-02');
  await expect(page.getByTestId('remote-owner')).toContainText('Ada');

  // Her screen really is sideways in front of the player.
  const viewport = page.getByTestId('remote-viewport');
  await expect(viewport).toHaveAttribute('data-rotation', '90');
  await expect(viewport).toHaveCSS('transform', TURNED);
  await expect(page.getByTestId('remote-rotation-state')).toHaveText(
    '90 degrees',
  );
  await expect(page.getByTestId('remote-resolution')).toHaveText('1024x768');

  // Setting it to what it already is is refused before the click.
  const picker = page.getByTestId('remote-rotation-picker');
  const apply = page.getByTestId('remote-apply-rotation');
  await picker.selectOption('90');
  await expect(apply).toBeDisabled();
  await expect(apply).toHaveAttribute('title', /already at 90 degrees/);

  // Put it back.
  await picker.selectOption('0');
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(page.getByTestId('remote-outcome')).toContainText(
    'Screen set to 0 degrees',
  );

  // The gag is gone from the screen, not just from a field.
  await expect(viewport).toHaveAttribute('data-rotation', '0');
  await expect(viewport).toHaveCSS('transform', UPRIGHT);

  // And the world being right closes the ticket by itself.
  await expect(resolvedToast(page)).toHaveCount(1);
  await focusWindow(page, 'tickets');
  await expect(row).toHaveAttribute('data-state', 'resolved');
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Closed');
});

test('shows the same rotation gag when the fix comes from the terminal', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-ada').click();

  const viewport = page.getByTestId('remote-viewport');
  await expect(viewport).toHaveCSS('transform', TURNED);

  // Fixed from a different app entirely: the remote screen is a view of the
  // world, so it straightens itself without being told.
  await openFromStartMenu(page, 'cmd');
  const input = page.getByTestId('cmd-input');
  await input.fill('rotate SALES-02 0');
  await input.press('Enter');
  await expect(page.getByTestId('cmd-output')).toContainText(
    'display set to 0 degrees',
  );

  await focusWindow(page, 'remote');
  await expect(viewport).toHaveCSS('transform', UPRIGHT);
  await expect(resolvedToast(page)).toHaveCount(1);
});

/**
 * Every rotation turns the screen the way it says. A viewport that renders
 * 90 and 270 the same way looks correct in the one screenshot anybody takes
 * and is wrong for half the values the action accepts.
 */
test('turns the remote screen in the direction the rotation names', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-ada').click();

  const viewport = page.getByTestId('remote-viewport');
  const picker = page.getByTestId('remote-rotation-picker');
  const apply = page.getByTestId('remote-apply-rotation');

  await expect(viewport).toHaveAttribute('data-rotation', '90');
  await expect(viewport).toHaveCSS('transform', TURNED);

  // The inverse quarter turn, which must be the inverse matrix.
  await picker.selectOption('270');
  await apply.click();
  await expect(viewport).toHaveAttribute('data-rotation', '270');
  await expect(viewport).toHaveCSS('transform', COUNTER_TURNED);
  expect(COUNTER_TURNED).not.toBe(TURNED);

  await picker.selectOption('180');
  await apply.click();
  await expect(viewport).toHaveCSS('transform', UPSIDE_DOWN);

  // None of that closed anything: only upright is a fix.
  await expect(resolvedToast(page)).toHaveCount(0);

  await picker.selectOption('0');
  await apply.click();
  await expect(viewport).toHaveCSS('transform', UPRIGHT);
  await expect(resolvedToast(page)).toHaveCount(1);
});

test('closes the spooler ticket from the remote services taskbar', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'tickets');
  const row = page.getByTestId('ticket-row-wedged-spooler');
  await row.click();
  await expect(page.getByTestId('ticket-detail-title')).toContainText(
    'haunted',
  );

  // Nina has no workstation of her own, so this one is driven from the picker.
  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-print').click();
  await expect(page.getByTestId('remote-hostname')).toHaveText('PRINT-01');

  const spooler = page.getByTestId('remote-service-spooler');
  await expect(spooler).toContainText('Not responding');

  // A healthy service on the same box refuses a restart, and says why.
  const vpnRestart = page.getByTestId('remote-restart-vpn');
  await expect(vpnRestart).toBeDisabled();
  await expect(vpnRestart).toHaveAttribute('title', /running/);

  // And the wedged one refuses too, for the honest reason: 47 jobs are still
  // waiting to jam it the moment it comes back.
  const spoolerRestart = page.getByTestId('remote-restart-spooler');
  await expect(spoolerRestart).toBeDisabled();
  await expect(spoolerRestart).toHaveAttribute(
    'title',
    /choke on the same job again/,
  );

  // Queue first, from the hardware panel. That alone is still not a fix.
  await page.getByTestId('remote-clear-printer').click();
  await expect(page.getByTestId('remote-queue-printer')).toHaveText(
    '0 job(s) queued',
  );
  await expect(page.getByTestId('remote-clear-printer')).toBeDisabled();
  await expect(spooler).toContainText('Not responding');
  await expect(resolvedToast(page)).toHaveCount(0);
  await focusWindow(page, 'tickets');
  await expect(row).toHaveAttribute('data-state', 'open');

  // Now the service can be started, and the ticket closes on the world.
  await focusWindow(page, 'remote');
  await expect(spoolerRestart).toBeEnabled();
  await spoolerRestart.click();
  await expect(spooler).toContainText('Running');
  await expect(resolvedToast(page)).toHaveCount(1);

  await focusWindow(page, 'tickets');
  await expect(row).toHaveAttribute('data-state', 'resolved');
});
