import { expect, type Page, test } from '@playwright/test';

import { completeLogin, focusWindow, logIn, openFromStartMenu } from './helpers';

/**
 * M3, on the built artifact: triage that computes a priority, a clock for the
 * reporter and a clock for the problem, two comment streams that are not the
 * same stream, a handoff form second line will actually keep, and a stress
 * meter that eventually shows in the player's hands.
 *
 * Everything here is driven the way a player drives it - dropdowns, buttons
 * and the clock - because a triage layer that works through the engine and not
 * through the queue is a triage layer nobody can use.
 */

/** Real milliseconds one simulated minute costs at x1 (`day-driver.ts`). */
const TICK_MS = 1_000;

function realMs(minutes: number, speed = 1): number {
  return (minutes * TICK_MS) / speed;
}

/** Logs on, starts the shift, and leaves the desktop clear. */
async function startShift(page: Page): Promise<void> {
  await completeLogin(page, { brief: 'keep' });
  await page.getByTestId('brief-start-shift').click();
  await expect(page.getByTestId('sim-clock-time')).toHaveText('09:00');
  await page.getByTestId('close-brief').click();
}

/** Runs the day at four times normal speed, which is what x4 is for. */
async function hurry(page: Page): Promise<void> {
  await page.getByTestId('day-speed-4').click();
  await expect(page.getByTestId('day-speed-4')).toHaveAttribute(
    'data-active',
    'true',
  );
}

/**
 * Triage: the reporter supplies an opinion, the player supplies a reading of
 * the estate, and the matrix supplies the priority - which then moves the
 * clock the ticket is actually held to.
 */
test('classifies a ticket and moves its SLA with the priority', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await startShift(page);
  await openFromStartMenu(page, 'tickets');

  await page.getByTestId('ticket-row-wedged-spooler').click();

  // Untriaged is not un-clocked: it sits at the middle of the ladder and says
  // so, because a ticket nobody has looked at cannot be free.
  const chip = page.getByTestId('ticket-detail-priority');
  await expect(chip).toContainText('Untriaged');
  await expect(page.getByTestId('ticket-row-priority-wedged-spooler'))
    .toHaveText('Untriaged');
  // Four hours from when it arrived at eight, which is P3's - the tier the
  // badge beside it says an untriaged ticket is treated as.
  await expect(page.getByTestId('ticket-detail-resolution'))
    .toHaveAttribute('data-due', '12:00');

  // The reporter's claim is on the form, and it is a claim.
  await expect(page.getByTestId('ticket-claimed-urgency'))
    .toContainText('high urgency');

  // Nothing is filed until both halves are picked.
  const file = page.getByTestId('triage-file');
  await expect(file).toBeDisabled();
  await page.getByTestId('triage-impact').selectOption('3');
  await expect(file).toBeDisabled();
  await page.getByTestId('triage-urgency').selectOption('2');
  await expect(page.getByTestId('triage-outcome')).toContainText('P2');
  await expect(file).toBeEnabled();

  await file.click();

  // The priority is a consequence, and it lands everywhere the priority is.
  await expect(chip).toHaveText('P2');
  await expect(page.getByTestId('ticket-row-priority-wedged-spooler'))
    .toHaveText('P2');
  await expect(page.getByTestId('ticket-row-wedged-spooler'))
    .toHaveAttribute('data-priority', '2');

  // And the deadline the ticket is held to moved with it: two hours from when
  // it arrived at eight, not two hours from now.
  await expect(page.getByTestId('ticket-detail-resolution'))
    .toHaveAttribute('data-due', '10:00');
  await expect(page.getByTestId('ticket-detail-response'))
    .toHaveAttribute('data-due', '08:30');
});

/**
 * The consequence of reading the estate wrong. The office-wide printer outage
 * is filed as one desk and nothing much, which buys it a P4 clock - and the
 * review at 17:00 puts the two readings side by side.
 */
test('carries a misclassified ticket through to the scorecard', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await startShift(page);
  await openFromStartMenu(page, 'tickets');

  await page.getByTestId('ticket-row-wedged-spooler').click();
  await page.getByTestId('triage-impact').selectOption('1');
  await page.getByTestId('triage-urgency').selectOption('1');
  await expect(page.getByTestId('triage-outcome')).toContainText('P4');
  await page.getByTestId('triage-file').click();
  await expect(page.getByTestId('ticket-detail-priority')).toHaveText('P4');

  // Run the shift out. Nobody prints all day and nobody is told why.
  await hurry(page);
  await page.clock.runFor(realMs(8 * 60, 4));
  await expect(page.getByTestId('sim-clock-time')).toHaveText('17:00');

  const scorecard = page.getByTestId('window-scorecard');
  await expect(scorecard).toBeVisible();
  await expect(page.getByTestId('scorecard-misclassified'))
    .toContainText('1 ticket(s) triaged against the evidence');
  await expect(page.getByTestId('scorecard-misclassified-wedged-spooler'))
    .toContainText('Low impact / Low urgency (P4)');
  await expect(page.getByTestId('scorecard-misclassified-wedged-spooler'))
    .toContainText('High impact / High urgency (P1)');

  // The day is scored on both clocks, not one.
  await expect(page.getByTestId('scorecard-late-response')).not.toHaveText('0');
  await expect(page.getByTestId('scorecard-breaches')).not.toHaveText('0');
});

/**
 * Two streams, told apart on the screen. What the reporter let slip is
 * internal; what was put TO them is not, and the second one is the only thing
 * that buys a pause.
 */
test('keeps work notes and customer comments in separate streams', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-rotated-screen').click();

  const worknotes = page.getByTestId('ticket-worknotes');
  const comments = page.getByTestId('ticket-comments');
  await expect(worknotes).toHaveAttribute('data-internal', 'true');
  await expect(comments).toHaveAttribute('data-internal', 'false');
  await expect(worknotes).toContainText('Nothing worked out yet');
  await expect(comments).toContainText('nobody has looked');

  // One question, which is both: a line to the reporter and a fact for you.
  await page.getByTestId('ticket-open-chat').click();
  await page
    .getByTestId('chat-options')
    .getByRole('button', { name: /anybody else was at her desk/ })
    .click();
  await focusWindow(page, 'tickets');

  // The question is on the customer-visible stream, word for word.
  await expect(comments).toContainText('anybody else was at her desk');
  // What she let slip is not: that is nobody's business outside the desk.
  await expect(worknotes).toContainText('showing her something');
  await expect(comments).not.toContainText('showing her something');
  await expect(worknotes).not.toContainText('anybody else was at her desk');
});

/**
 * The CYA rule, on the shipped path. The clock stops on the reporter only
 * once there is a question they could actually have seen - and a work note
 * saying you asked is not one.
 */
test('parks a ticket on the evidence in the customer stream', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-locked-account').click();

  const toggle = page.getByTestId('ticket-waiting-toggle');
  await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveAttribute(
    'title',
    /have not actually asked them anything yet/,
  );

  await page.getByTestId('ticket-open-chat').click();
  await page
    .getByTestId('chat-options')
    .getByRole('button', { name: /when he last logged in/ })
    .click();
  await focusWindow(page, 'tickets');

  await expect(page.getByTestId('ticket-comments'))
    .toContainText('when he last logged in');
  await expect(toggle).toBeEnabled();
  await toggle.click();

  // On hold, with the reason a review would ask for.
  await expect(page.getByTestId('ticket-detail-state'))
    .toContainText('Awaiting the user');
  await expect(page.getByTestId('ticket-row-locked-account'))
    .toContainText('Awaiting the user');
  await expect(toggle).toContainText('Take it back off hold');

  // And triage is refused while it is parked, in words, rather than quietly
  // handing back the time it has spent waiting.
  await page.getByTestId('triage-impact').selectOption('1');
  await page.getByTestId('triage-urgency').selectOption('3');
  await expect(page.getByTestId('triage-file')).toBeDisabled();
  await expect(page.getByTestId('triage-file')).toHaveAttribute(
    'title',
    /time it has already spent waiting comes with it/,
  );
});

/**
 * The handoff. A thin one is not refused - it is sent, and it comes back with
 * a note and a bill, which is what actually happens on a first-line desk.
 */
test('bounces a thin handoff and passes a complete one', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await startShift(page);
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-fan-noise').click();

  // The form opens instead of the escalation happening: second line take
  // tickets on a form.
  await page.getByTestId('ticket-escalate').click();
  const form = page.getByTestId('ticket-handoff');
  await expect(form).toBeVisible();
  await expect(page.getByTestId('handoff-tried-empty')).toBeVisible();
  await expect(page.getByTestId('handoff-warning'))
    .toContainText('what the user reported');

  // Send it anyway, with nothing in it.
  await page.getByTestId('handoff-send').click();
  await expect(form).toHaveCount(0);

  // It did not go: the ticket is still open and still yours.
  await expect(page.getByTestId('ticket-row-fan-noise'))
    .toHaveAttribute('data-state', 'open');

  // Second line get round to it, and it lands back on the desk with a note,
  // a toast and a reputation attached.
  await page.clock.runFor(realMs(25));
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Returned by second line' }),
  ).toHaveCount(1);
  await expect(page.getByTestId('ticket-worknotes'))
    .toContainText('Returned by second line');

  // And the mail nobody would have written if the form had been filled in.
  await openFromStartMenu(page, 'mail');
  await expect(page.getByTestId('mail-row-handoff-bounce')).toBeVisible();
  await page.getByTestId('mail-row-handoff-bounce').click();
  await expect(page.getByTestId('mail-reader')).toContainText('what is this');

  // Second time round: do something, then say what it was.
  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-beige-box').click();
  await page.getByTestId('remote-reboot').click();

  await focusWindow(page, 'tickets');
  await page.getByTestId('ticket-row-fan-noise').click();
  await page.getByTestId('ticket-escalate').click();
  await expect(page.getByTestId('handoff-tried')).toContainText('Rebooted it');
  await page
    .getByTestId('handoff-reported')
    .fill('It sounds like a hornet in a biscuit tin.');
  await expect(page.getByTestId('handoff-warning')).toBeHidden();
  await page.getByTestId('handoff-send').click();

  // This one goes, and the ticket goes with it.
  await expect(page.getByTestId('ticket-row-fan-noise'))
    .toHaveAttribute('data-state', 'resolved');
});

/**
 * Fumble mode. Four tickets nobody is closing, a deadline going past, and by
 * the middle of the afternoon the room is swimming - visibly, and only
 * visibly: the chip says so and the terminal says so, and every action still
 * lands exactly where it was aimed.
 */
test('starts fumbling once the day has gone badly enough', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await startShift(page);

  const desktop = page.getByTestId('desktop');
  await expect(desktop).toHaveAttribute('data-fumbling', 'false');
  await expect(page.getByTestId('fumble-chip')).toBeHidden();

  // Five hours of doing nothing about anything, at four times the speed.
  await hurry(page);
  await page.clock.runFor(realMs(5 * 60, 4));
  await expect(page.getByTestId('sim-clock-time')).toHaveText('14:00');

  await expect(desktop).toHaveAttribute('data-fumbling', 'true');
  const chip = page.getByTestId('fumble-chip');
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute('title', /entirely cosmetic/);

  // The terminal fumbles what you typed and then runs what you typed.
  await openFromStartMenu(page, 'cmd');
  const input = page.getByTestId('cmd-input');
  await input.fill('users gpoole');
  await input.press('Enter');

  const output = page.getByTestId('cmd-output');
  await expect(output).toContainText('Sent as typed');
  await expect(output).toContainText('C:\\SUPPORT> users gpoole');
  // And the command that ran is the one that was asked for, not the one the
  // shaking produced.
  await expect(output).toContainText('Gary Poole');
});

/**
 * A save from tomorrow, loaded into today, with the lead already in the
 * corridor.
 *
 * The engine announces the restored tick before the driver has rebuilt the day
 * that tick belongs to, so the paint that tick causes draws the corridor from
 * the wrong day's patrol. The player sees a clear corridor, pauses to read the
 * queue, and the door opens. Everything below is on the built artifact,
 * paused, so nothing but the load can move the screen.
 */
test('shows the right corridor the moment a paused save is loaded', async ({
  page,
}) => {
  await page.clock.install();
  // Day one runs untouched, so day two opens with the player fumbling; this
  // test is about the corridor, not the hands - shipped reduced-motion path.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await startShift(page);
  await hurry(page);

  // Day one, out and clocked off: day two starts with the same shape and a
  // patrol of its own.
  await page.clock.runFor(realMs(8 * 60, 4));
  await expect(page.getByTestId('sim-clock-time')).toHaveText('17:00');
  await page.getByTestId('scorecard-clock-off').click();
  await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 2');

  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();

  const desktop = page.getByTestId('desktop');
  const chip = page.getByTestId('boss-chip');

  // Walk day two up to the first set of footsteps and stop the clock dead.
  await page.clock.runFor(realMs(3 * 60, 4));
  await expect(desktop).toHaveAttribute('data-boss', 'telegraph', {
    timeout: 10_000,
  });
  await page.getByTestId('day-pause').click();
  await expect(page.getByTestId('day-state')).toContainText('paused');

  const telegraph = await chip.textContent();
  const clock = await page.getByTestId('sim-clock-time').textContent();

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-save').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Game saved' }))
    .toHaveCount(1);

  // A fresh session: day one, nine in the morning, nobody in the corridor.
  await page.reload();
  await completeLogin(page, { brief: 'keep' });
  await page.getByTestId('close-brief').click();
  await expect(desktop).toHaveAttribute('data-boss', 'clear');

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Game loaded' }))
    .toHaveCount(1);

  // Immediately: no tick has passed, because the clock is paused and a paused
  // clock is the whole point of this test.
  await expect(page.getByTestId('sim-clock-time')).toHaveText(clock ?? '');
  await expect(desktop).toHaveAttribute('data-boss', 'telegraph');
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText(telegraph ?? '');
  await expect(page.getByTestId('door-flash')).toBeVisible();
});
