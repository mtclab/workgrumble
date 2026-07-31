import { expect, type Page, test } from '@playwright/test';

import {
  beginShift,
  clockOffFor,
  completeLogin,
  openFromStartMenu,
  runCommand,
  runToDayEnd,
  workUntilMinute,
} from './helpers';

/**
 * The probation week, on the built artifact, both ways it ends.
 *
 * Everything below is played rather than arranged: the review at three on
 * Friday reads a number the week itself moved, so the only honest way to see
 * both endings is to work a week and to not work one. The two journeys are
 * long on purpose - a week is the unit this milestone added, and a week is
 * what has to survive being played.
 */

/** Every day between here and Friday, worked or not, and clocked off. */
async function walkToFriday(page: Page, from: number): Promise<void> {
  for (let day = from; day < 5; day += 1) {
    await clockOffFor(page, day);
    await beginShift(page);
  }
}

/** Two accounts and a group, through the directory. */
async function addToGroup(
  page: Page,
  account: string,
  group: string,
): Promise<void> {
  await openFromStartMenu(page, 'directory');
  await page.getByTestId(`directory-row-${account}`).click();
  await page.getByTestId('directory-group-picker').selectOption(group);
  await page.getByTestId('directory-add-group').click();
}

/** Ticking duplicates and attaching them to the incident they are copies of. */
async function attachToParent(
  page: Page,
  parent: string,
  children: readonly string[],
): Promise<void> {
  await openFromStartMenu(page, 'tickets');

  for (const child of children) {
    await page.getByTestId(`ticket-pick-${child}`).check();
  }

  await page.getByTestId(`ticket-row-${parent}`).click();
  await page.getByTestId('ticket-link-parent').click();
}

/**
 * The week that goes well, and it has to be worked to go well.
 *
 * Twenty-three tickets across five days, closed on the shipped surfaces: the
 * terminal, the directory, the remote screen, the hardware panel, two
 * conversations and the queue itself. That length is the point rather than an
 * accident of the fixture - the review at three on Friday reads a number the
 * week itself moved, and a week where three things were fixed on the Monday and
 * nothing afterwards is a week that ends in the room with the blind.
 *
 * Each day is worked in sweeps rather than in one pass, because that is what
 * the queue asks for: an untriaged ticket has four working hours on it, so the
 * pile that was waiting at eight has to be dealt with before one o'clock and
 * the late-morning arrivals before the middle of the afternoon.
 */
test.setTimeout(240_000);
test('passes the review, opens the beer and reads the week back', async ({
  page,
}) => {
  await page.clock.install();
  // A week at four times speed leaves the player fumbling by the afternoon,
  // and the sway never settles under strict actionability checks. This is
  // about the week, not the hands - shipped reduced-motion path.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });

  /* -- Monday: the two that were waiting, and the two that turn up -------- */

  await beginShift(page);
  await workUntilMinute(page, 150);

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'unlock gpoole');
  await expect(page.getByTestId('cmd-output')).toContainText('unlocked');
  await runCommand(page, 'rotate SALES-02 0');
  await expect(page.getByTestId('cmd-output')).toContainText('set to 0 degrees');

  // The one about your own desk, which you filed yourself, and the one thing
  // in this game that is fixed by hitting it.
  await openFromStartMenu(page, 'about');
  await page.getByTestId('about-reseat-fan').click();
  // Three tickets close inside a couple of sim-minutes here and toasts only
  // expire on ticks, so the stack still holds the earlier two. The notice
  // body carries the ticket title, which is what makes this one exact.
  await expect(
    page.getByTestId('toast').filter({ hasText: 'hornet in a biscuit tin' }),
  ).toHaveCount(1);

  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('ticket-row-locked-account'))
    .toHaveAttribute('data-state', 'resolved');
  await expect(page.getByTestId('ticket-row-rotated-screen'))
    .toHaveAttribute('data-state', 'resolved');
  await expect(page.getByTestId('ticket-row-fan-noise'))
    .toHaveAttribute('data-state', 'resolved');

  // The lead's concern, raised by mentioning it, and the frozen computer that
  // turns out to have two flat batteries in it.
  await workUntilMinute(page, 400);
  await addToGroup(page, 'desmond', 'group:vpn-users');
  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-ada').click();
  await page.getByTestId('remote-replace-battery-ada-mouse').click();

  await clockOffFor(page, 1);

  /* -- Tuesday: the overnight outage, the spooler, and a favour ----------- */

  await beginShift(page);
  await workUntilMinute(page, 150);

  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-print-warehouse').click();
  await page.getByTestId('remote-power-printer-warehouse').click();

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'clearqueue hercules');
  await runCommand(page, 'restart spooler');
  await expect(page.getByTestId('cmd-output')).toContainText('RUNNING');

  // Reception's printing is a mid-morning arrival and the fault comes WITH it -
  // somebody is taken out of a group at the minute the ticket is raised - so
  // putting her back before it lands would be putting her back before she was
  // taken out. This one waits for one o'clock.
  await workUntilMinute(page, 300);
  await addToGroup(page, 'bev', 'group:print-users');

  // Ten past two: somebody who would rather message you than use the form.
  // Both answers are legitimate and this one is the answer that leaves a
  // record - which is the only reason the week has anything to show for it.
  await workUntilMinute(page, 372);
  await openFromStartMenu(page, 'chat');
  await page.getByTestId('chat-person-terry').click();
  await expect(page.getByTestId('chat-transcript')).toContainText('quick favour');
  await page.getByTestId('chat-option-1').click();

  await workUntilMinute(page, 405);
  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'resetpw tblunt');
  await runCommand(page, 'grant kboateng sales');
  await expect(page.getByTestId('cmd-output')).toContainText('Full Access');

  // And there he is again, an hour later, about the half nobody asked for.
  await addToGroup(page, 'kwame', 'group:sales-send-as');

  await clockOffFor(page, 2);

  /* -- Wednesday: a licence, a new phone and an announced window ---------- */

  await beginShift(page);
  await workUntilMinute(page, 150);

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'licence take cpeach');
  await runCommand(page, 'licence give rtulliver');
  await expect(page.getByTestId('cmd-output')).toContainText('Seat assigned');
  await runCommand(page, 'verify praval');
  await runCommand(page, 'mfa praval');
  await expect(page.getByTestId('cmd-output'))
    .toContainText('New authenticator enrolled');

  await workUntilMinute(page, 240);
  await attachToParent(page, 'share-maintenance', ['share-dup-terry']);
  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'restart file sharing');

  await clockOffFor(page, 3);

  /* -- Thursday: the arc, a relock, and forty people with one fault ------- */

  await beginShift(page);
  await workUntilMinute(page, 140);

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'forget tablet');
  await runCommand(page, 'unlock hmarsh');

  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-print-warehouse').click();
  await page.getByTestId('remote-power-printer-warehouse').click();

  // Twice at the same minute is a timetable, and a timetable is Facilities.
  await openFromStartMenu(page, 'chat');
  await page.getByTestId('chat-person-vic').click();
  await page.getByTestId('chat-option-0').click();
  await page.getByTestId('chat-option-0').click();
  await expect(page.getByTestId('chat-transcript'))
    .toContainText('DO NOT UNPLUG');

  await workUntilMinute(page, 260);
  await attachToParent(page, 'vpn-cert-expired', [
    'vpn-cert-dup-ada',
    'vpn-cert-dup-gary',
  ]);
  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'renewcert VPN Concentrator');
  await expect(page.getByTestId('cmd-output'))
    .toContainText('New certificate issued');

  await clockOffFor(page, 4);

  /* -- Friday, and the conversation at three ------------------------------ */

  await beginShift(page);
  await workUntilMinute(page, 150);

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'rule on quarantine');
  await expect(page.getByTestId('cmd-output')).toContainText('is now on');

  // The other two arrive during the morning and, like every fault in this
  // game, they arrive WITH their ticket - so they are worked on the second
  // sweep rather than fixed before anybody has reported them.
  await workUntilMinute(page, 260);
  await runCommand(page, 'restart backup');
  await runCommand(page, 'restart scheduled');

  await workUntilMinute(page, 425);

  const review = page.getByTestId('window-review');
  await expect(review).toBeVisible();
  await expect(page.getByTestId('review-app'))
    .toHaveAttribute('data-outcome', 'passed');
  await expect(page.getByTestId('review-heading'))
    .toContainText('probation');
  await expect(page.getByTestId('review-line')).toContainText('the week is fine');
  await expect(page.getByTestId('review-note')).toContainText('fridge');
  // Always dismissible, like every scene in this game.
  await page.getByTestId('review-dismiss').click();
  await expect(review).toHaveCount(0);

  /* -- five o'clock, and the fridge --------------------------------------- */

  await runToDayEnd(page);
  await expect(page.getByTestId('sim-clock-time')).toHaveText('17:00');

  const beer = page.getByTestId('window-beer');
  await expect(beer).toBeVisible();
  await expect(page.getByTestId('beer-app')).toHaveAttribute('data-opened', 'false');
  await expect(page.getByTestId('beer-heading')).toContainText('fridge');

  // The desk agrees: what was locked all week is a button now.
  await expect(page.getByTestId('desk-beer')).toHaveAttribute('data-locked', 'false');

  await page.getByTestId('beer-open').click();
  await expect(page.getByTestId('beer-app')).toHaveAttribute('data-opened', 'true');
  await expect(page.getByTestId('beer-reply')).toContainText('considerably better');
  await expect(page.getByTestId('desk-beer-label')).toHaveText('Empty');
  await page.getByTestId('beer-open').click();
  await expect(beer).toHaveCount(0);

  /* -- the week, added up ------------------------------------------------- */

  await page.getByTestId('scorecard-clock-off').click();

  const weekend = page.getByTestId('window-weekend');
  await expect(weekend).toBeVisible();
  await expect(page.getByTestId('weekend-verdict'))
    .toHaveAttribute('data-outcome', 'passed');
  await expect(page.getByTestId('weekend-verdict-title'))
    .toContainText('passed');
  // Five days, each with its own line. Monday is five in: the two that were
  // waiting at eight, the one about your own desk, the mouse after lunch, and
  // the concern the lead raises by mentioning it.
  await expect(page.getByTestId('weekend-day-1'))
    .toContainText('5 in, 5 closed');
  await expect(page.getByTestId('weekend-day-5')).toBeVisible();
  // What the week closed is pinned to the digit by the golden week, which
  // walks the same five days headlessly. What this journey is for is that a
  // person can reach it: the queue moved, and it moved because of the windows
  // above rather than because a test wrote a number into a field.
  await expect(page.getByTestId('weekend-closed')).not.toHaveText('0');
  await expect(page.getByTestId('weekend-bonus')).toContainText('£');
  await expect(page.getByTestId('weekend-earned')).toContainText('£');
  await expect(page.getByTestId('weekend-farm-total')).toContainText('banked');

  // Week two is not built yet, and the button says so rather than lying.
  const onward = page.getByTestId('weekend-onward');
  await expect(onward).toBeDisabled();
  await expect(onward).toHaveAttribute('title', /not built yet/);

  // And there is no Saturday: the clock stays where the week left it.
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 5');
  await expect(page.getByTestId('sim-clock-time')).toHaveText('17:00');
});

/**
 * And the week that does not: five days of the queue being ignored, a short
 * conversation on the Friday, and the screen that offers the only thing this
 * game will not take off you - the money towards the farm.
 */
test('fires a week nobody worked and starts the next one', async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });
  await beginShift(page);

  await walkToFriday(page, 1);
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 5');

  await workUntilMinute(page, 425);
  await expect(page.getByTestId('window-review')).toBeVisible();
  await expect(page.getByTestId('review-app'))
    .toHaveAttribute('data-outcome', 'fired');
  await expect(page.getByTestId('review-line')).toContainText('not working out');
  // The shift does not end early. There are two hours left on it.
  await expect(page.getByTestId('review-note')).toContainText('two hours');
  await page.getByTestId('review-dismiss').click();

  // The fridge stays shut: the beer was never about the beer.
  await expect(page.getByTestId('desk-beer')).toHaveAttribute('data-locked', 'true');

  await runToDayEnd(page);
  await expect(page.getByTestId('sim-clock-time')).toHaveText('17:00');
  await expect(page.getByTestId('window-beer')).toHaveCount(0);

  await page.getByTestId('scorecard-clock-off').click();
  await expect(page.getByTestId('window-weekend')).toBeVisible();
  await expect(page.getByTestId('weekend-verdict'))
    .toHaveAttribute('data-outcome', 'fired');
  await expect(page.getByTestId('weekend-verdict-title'))
    .toContainText('not continued');
  await expect(page.getByTestId('weekend-closed')).toHaveText('0');
  await expect(page.getByTestId('weekend-breached')).not.toHaveText('0');

  // What the week was worth, before the week starts again.
  const banked = await page.getByTestId('weekend-farm-total').textContent();
  expect(banked ?? '').toMatch(/£\d/);

  /* -- and again, Monday --------------------------------------------------- */

  const onward = page.getByTestId('weekend-onward');
  await expect(onward).toBeEnabled();
  await expect(onward).toHaveText('Start Monday again');
  await onward.click();

  // The retry rebuilds the world from nothing, which is a new page. Everything
  // the last week did is gone except the two things that survive a firing.
  await completeLogin(page, { brief: 'keep' });
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 1');
  await expect(page.getByTestId('sim-clock-time')).toHaveText(/^08:/);
  await expect(page.getByTestId('brief-queue-list').getByRole('listitem'))
    .toHaveCount(2);

  // The fund is exactly what Friday left in it: they take the desk, the queue
  // and the lanyard, and the money towards twelve acres is still yours.
  await openFromStartMenu(page, 'scorecard');
  await expect(page.getByTestId('scorecard-farm-total')).toHaveText(banked ?? '');
  await expect(page.getByTestId('scorecard-reputation')).toContainText('50');
});
