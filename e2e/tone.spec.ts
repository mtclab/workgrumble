import { expect, type Page, test } from '@playwright/test';

import {
  beginShift,
  focusWindow,
  logIn,
  logInOnDay,
  openFromStartMenu,
  resolvedToast,
  runSimMinutes,
  runToTelegraph,
} from './helpers';

/**
 * The aggressive register, end to end (issue #18).
 *
 * The owner's ask: the player can tell a user where to go - up to telling them
 * to fuck off - and it STILL fixes their ticket. These drive that through the
 * real chat UI and assert the four things the slice promises:
 *
 *  (a) the ticket still resolves, exactly as the neutral reply would close it;
 *  (b) reputation drops (the social cost is real, and paid);
 *  (c) with the lead at your shoulder, the caught-scene class fires;
 *  (d) snapping at the same reporter twice escalates their reaction.
 *
 * The engine-level proof of the same four lives in
 * `src/world/dialogue/tone.test.ts`; these are the journeys, in the shipped UI.
 */

/** Walks Ada's conversation to the beat where the screen can be rotated back. */
async function toRotateBeat(page: Page): Promise<void> {
  await openFromStartMenu(page, 'chat');
  await page.getByTestId('chat-person-ada').click();
  await expect(page.getByTestId('chat-heading')).toHaveText('Ada Whitlock');

  const options = page.getByTestId('chat-options');
  await options.getByRole('button', { name: /anybody else was at her desk/ })
    .click();
  await options.getByRole('button', { name: /which keys Gareth pressed/ })
    .click();
  await expect(page.getByTestId('chat-transcript'))
    .toContainText('Control, something, and an arrow');
}

/** The crude option on that beat, matched by the line the owner asked for. */
const CRUDE_ROTATE = /fuck off with the crime report/;

test('the crude reply still fixes the ticket, and costs reputation', async ({
  page,
}) => {
  await logIn(page);
  await toRotateBeat(page);

  // The genuinely blunt option - and it rotates the screen anyway.
  await page.getByTestId('chat-options').getByRole('button', {
    name: CRUDE_ROTATE,
  }).click();

  // (a) The fix still happens: one resolution, exactly as the polite reply.
  await expect(resolvedToast(page)).toHaveCount(1);
  await expect(page.getByTestId('chat-outcome')).toContainText('still fixed');

  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('ticket-row-rotated-screen'))
    .toHaveAttribute('data-state', 'resolved');

  // The reporter's reaction is on its own stream ("How they took it"), NOT the
  // customer-visible one - being rude never counts as putting a question to the
  // reporter, so it can never park the SLA on them.
  await page.getByTestId('ticket-row-rotated-screen').click();
  await expect(page.getByTestId('ticket-reactions'))
    .toContainText('mentioning your manner');

  // (b) Reputation dropped: 50 was "Steady", and it is not steady any more.
  await openFromStartMenu(page, 'scorecard');
  await expect(page.getByTestId('scorecard-reputation'))
    .toContainText('conversation about you that you were not at');
  await expect(page.getByTestId('scorecard-reputation')).not.toContainText(
    'Steady',
  );
});

test('the lead hears it when he is at your shoulder', async ({ page }) => {
  // A controlled clock and a running shift, so the patrol actually walks.
  await logInOnDay(page, 1, { brief: 'keep' });
  await beginShift(page);
  await toRotateBeat(page);

  // Wait for the corridor, then let him arrive. Nothing is minimised and no
  // slack is open, so the only thing he can catch is the mouth.
  await runToTelegraph(page);

  const desktop = page.getByTestId('desktop');
  for (let minute = 0; minute < 8; minute += 1) {
    if (await desktop.getAttribute('data-boss') === 'present') {
      break;
    }

    await runSimMinutes(page, 1, 1);
  }
  await expect(desktop).toHaveAttribute('data-boss', 'present');

  // Say it while he is standing there.
  await focusWindow(page, 'chat');
  await page.getByTestId('chat-options').getByRole('button', {
    name: CRUDE_ROTATE,
  }).click();

  // (c) The caught-scene class fires - the one about a person, not a screen.
  const caught = page.getByTestId('window-caught');
  await expect(caught).toBeVisible();
  await expect(page.getByTestId('caught-app'))
    .toHaveAttribute('data-app', 'conduct:rude');
  await expect(page.getByTestId('caught-heading'))
    .toHaveText('A quick word about tone');
  await expect(page.getByTestId('caught-line'))
    .toContainText('talk to them like that');

  // And the fix still happened, even caught: take it on the chin, then look.
  await page.getByTestId('caught-dismiss').click();
  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('ticket-row-rotated-screen'))
    .toHaveAttribute('data-state', 'resolved');
});

test('snapping at the same reporter twice escalates their reaction', async ({
  page,
}) => {
  // A 240s ceiling: this journey is a handful of clicks, and if it ever hangs
  // it must fail in four minutes, not the thirty a default timeout would spend.
  test.setTimeout(240_000);

  // Ada's opening beat on day one is a DIAGNOSTIC aggressive beat - it does not
  // resolve the ticket, so the rude option can be picked, backed out of, and
  // picked again, all on a ticket that is deterministically live on Monday.
  await logIn(page);
  await openFromStartMenu(page, 'chat');
  await page.getByTestId('chat-person-ada').click();
  await expect(page.getByTestId('chat-transcript'))
    .toContainText('I have been hacked');

  const options = page.getByTestId('chat-options');
  const rude = /flatly, whether anybody was at her desk/;

  // First snap: the flat reaction lands.
  await options.getByRole('button', { name: rude }).click();
  await options.getByRole('button', { name: /Go back to the top/ }).click();

  // Second snap at the same reporter, driven straight to it - the sharper one.
  await options.getByRole('button', { name: rude }).click();

  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-rotated-screen').click();
  const stream = page.getByTestId('ticket-reactions');
  // (d) Both reactions are on the record, the second sharper than the first.
  await expect(stream).toContainText('There is no need to take that tone');
  await expect(stream).toContainText('twice you have spoken to me like that');
});
