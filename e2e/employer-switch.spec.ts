import { expect, type Page, test } from '@playwright/test';

import {
  completeLogin,
  openFromStartMenu,
  runSimMinutes,
  SHIFT_MINUTES,
} from './helpers';

/**
 * The second employer, on the built artifact (0.6.0 slice 3, E5 #24).
 *
 * The switch spine's payoff, played as a user would: arrive at Bodgeworth &
 * Batch from a career that passed probation, play its wild-west week, meet the
 * reply-all storm on the Wednesday, install a toy that carries NO audit (which
 * is the whole of the wild-west contrast), and clear the Friday review. It is
 * the journey the version gate names, driven end to end through the real shell.
 *
 * The arrival is seeded the way the shell itself seeds it: a switch record in
 * storage, exactly what the offer-accept writes on the way out of probation
 * (`SwitchSlot`, key `workgrumble/switch`). Booting with one in place stands the
 * arriving employer up on the first Monday, which is the same code path a real
 * pass-and-accept takes - so this drives the shipped boot rather than a fixture.
 *
 * Authored for the box run (specs are written, not run here); it is part of the
 * version's single box cycle.
 */

const SWITCH_KEY = 'workgrumble/switch';

/** A clean pass at probation, crossing into Bodgeworth with standing intact. */
const ARRIVAL = {
  employer: 'bodgeworth',
  career: {
    reputation: 82,
    title: 'IT Support Technician',
    farmFund: 25_000,
    trail: null,
  },
};

/** Seed the switch record, then boot: the shell stands Bodgeworth up Monday. */
async function arriveAtBodgeworth(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, record]) => {
      window.localStorage.setItem(key, JSON.stringify(record));
    },
    [SWITCH_KEY, ARRIVAL] as [string, typeof ARRIVAL],
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });

  // The arrival plays the shop's boot ceremony on the update screen; close it
  // if it is up, the way the release-notes window is dismissed after a build.
  const arrival = page.getByTestId('window-updates');

  if (await arrival.count()) {
    const close = arrival.getByTestId('window-close');

    if (await close.count()) {
      await close.first().click();
    }
  }

  // And the first brief, at the new shop.
  await expect(page.getByTestId('brief-heading')).toContainText('Day 1');
}

/** Runs the day out and starts the next one, off the day screen. */
async function nextDay(page: Page, day: number): Promise<void> {
  await runSimMinutes(page, SHIFT_MINUTES);
  await expect(page.getByTestId('day-state')).toHaveText('Day end');
  await page.getByTestId('scorecard-clock-off').click();
  await expect(page.getByTestId('sim-clock-day'))
    .toHaveText(`Day ${String(day + 1)}`);
}

test('arrives at the wild-west shop and its week plays', async ({ page }) => {
  await arriveAtBodgeworth(page);

  // The arriving world is Bodgeworth's, not the probation shop's: its shared
  // front-desk login is the Monday fault, and the probation queue is nowhere.
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();

  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('ticket-row-office-login-locked')).toBeVisible();
  await expect(page.getByTestId('ticket-row-accounts-package-down'))
    .toBeVisible();
  await expect(page.getByTestId('ticket-row-rotated-screen')).toHaveCount(0);
});

test('the reply-all storm fires on the Wednesday, with a ticket buried in it', async ({
  page,
}) => {
  await arriveAtBodgeworth(page);

  // Monday and Tuesday out.
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
  await nextDay(page, 1);
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
  await nextDay(page, 2);

  // Wednesday: into the shift, far enough for the storm to have blown in.
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
  await runSimMinutes(page, 150);

  await openFromStartMenu(page, 'hubbub');
  // One all-staff room, not the probation shop's three governed ones.
  await page.getByTestId('hubbub-channel-office').click();

  // The storm: the root nobody wanted, a "stop replying all" scold that is
  // itself a reply-all, and - buried in the flood - the one message that is not
  // cake: the shared drive going down, with the player's name and a ticket on
  // it.
  await expect(page.getByTestId('hubbub-message-storm-root')).toBeVisible();
  await expect(page.getByTestId('hubbub-message-storm-scold-1'))
    .toContainText('STOP');
  await expect(page.getByTestId('hubbub-message-share-down'))
    .toContainText('shared drive');
  await expect(page.getByTestId('hubbub-open-ticket-share-down')).toBeVisible();

  // And the signal is real: opening it from the room lands on the ticket.
  await page.getByTestId('hubbub-open-ticket-share-down').click();
  await expect(page.getByTestId('ticket-detail-title'))
    .toContainText('shared drive');
});

test('installs a toy that carries no audit, the wild-west way', async ({
  page,
}) => {
  await arriveAtBodgeworth(page);
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();

  // The web store is fair game here: install a toy and it simply goes on,
  // frictionless, because a wild-west shop keeps no install audit. The
  // suspicion drip the probation shop charges for a sitting install does not
  // exist here - proven mechanically in the unit gate; what the artifact shows
  // is that the install works and the day plays on with nothing in the way.
  await openFromStartMenu(page, 'browser');
  await page.getByTestId('browser-store').click();
  await page.getByTestId('store-install-arcade').click();
  await expect(page.getByTestId('store-uninstall-arcade')).toBeVisible();

  // The toy is on the desktop and usable; nothing blocked the install and no
  // audit surfaced to be answered for.
  await runSimMinutes(page, 30);
  await expect(page.getByTestId('day-state')).toHaveText('Shift');
});

test('clears the Friday review at the new shop', async ({ page }) => {
  await arriveAtBodgeworth(page);

  // Four days worked lightly out to the Friday. The wild-west week is winnable;
  // the review at three goes the right way.
  for (let day = 1; day <= 4; day += 1) {
    await page.getByTestId('brief-start-shift').click();
    await page.getByTestId('close-brief').click();
    await nextDay(page, day);
  }

  // Friday: run to the review at three and past it.
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
  await runSimMinutes(page, SHIFT_MINUTES);

  await expect(page.getByTestId('day-state')).toHaveText('Day end');
  // The conversation went the right way - the review surface says kept on, not
  // let go.
  await expect(page.getByTestId('review-outcome')).toContainText(/pass|kept/i);
});
