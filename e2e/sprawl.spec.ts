import { expect, test } from '@playwright/test';

import {
  beginShift,
  logIn,
  logInOnDay,
  openFromStartMenu,
  runSimMinutes,
  underPause,
} from './helpers';

/**
 * Channel sprawl, slice 3, on the built artifact: attention as a resource, the
 * deflection bot's pre-chew, and the bot-frustrated user met with a tone
 * (0.5.0 slice 3, issue #22).
 *
 * The three journeys the slice ships, driven the way a player meets them:
 *
 * - the unread room pile BUILDS while it is ignored and STOPS the moment it is
 *   read - the sprawl cost, made a thing on the screen. The STRESS the pile
 *   costs is small by design (a point a message, once) and is proven to the
 *   number in `src/shell/day-driver.test.ts` and witnessed in the determinism
 *   golden; what a browser can see is the pile itself accruing and clearing,
 *   which is what these assert;
 * - a ticket that arrives PRE-CHEWED by the portal bot reads honestly: the bot
 *   tried the obvious thing, it did not stick, and that is why the weird one
 *   survived to a human;
 * - the bot-FRUSTRATED user (Gary, bounced round the portal's reset loop)
 *   arrives cross, and the 0.4.1 tone register is how the player meets him -
 *   in kind, and the ticket still resolves, or on one of the neutral roads.
 */

test('the unread room pile builds while ignored and stops when it is read', async ({
  page,
}) => {
  await logInOnDay(page, 1);
  await beginShift(page);

  // Open Hubbub at nine, before anything has been said, and sit on the room the
  // rollout shipped empty - #water-cooler. From there the OTHER rooms fill
  // off-screen, so nothing is read on sight and the pile is left to climb: the
  // welcome at 09:05 and the two #helpdesk lines by 09:48. This is the drip's
  // input, the unread pile, visible as the badges the attention cost is a number
  // for. (The STRESS it costs is a point a message, once, and is proven exactly
  // in `src/shell/day-driver.test.ts`; here the journey is that pile itself.)
  await openFromStartMenu(page, 'hubbub');
  await page.getByTestId('hubbub-channel-water-cooler').click();

  await runSimMinutes(page, 50);
  await underPause(page, async () => {
    await expect(page.getByTestId('hubbub-summary')).toContainText('3 unread');
    await expect(page.getByTestId('hubbub-badge-announcements')).toHaveText('1');
    await expect(page.getByTestId('hubbub-badge-helpdesk')).toHaveText('2 @');
  });

  // Reading is what stops it. Opening #announcements and #helpdesk puts their
  // messages on screen, which is what "read" means - the badges clear, the
  // summary falls to nothing, and from here the pile the drip charges is empty.
  await underPause(page, async () => {
    await page.getByTestId('hubbub-channel-announcements').click();
    await page.getByTestId('hubbub-channel-helpdesk').click();
    await expect(page.getByTestId('hubbub-badge-announcements')).toBeHidden();
    await expect(page.getByTestId('hubbub-badge-helpdesk')).toBeHidden();
    await expect(page.getByTestId('hubbub-summary')).toContainText('0 unread');
  });

  // And the clear survives more of the day: nothing that has been read comes
  // back as unread, so the drip has nothing left to notice. The Tuesday copy
  // that has not arrived yet is not in this count - the pile is only ever what
  // the clock has actually dealt.
  await runSimMinutes(page, 30);
  await underPause(page, async () => {
    await expect(page.getByTestId('hubbub-summary')).toContainText('0 unread');
  });
});

test('a ticket the portal bot chewed first reads honestly', async ({ page }) => {
  await logIn(page);
  await openFromStartMenu(page, 'tickets');

  // Gary's locked account, Monday's own inherited ticket: the portal offered a
  // password reset (twice) and it changed nothing, because the account is
  // locked, not wrong. The pre-chew note says exactly that, in the bot's voice
  // and the user's, and it is read-only - context, not a control.
  await page.getByTestId('ticket-row-locked-account').click();
  const note = page.getByTestId('ticket-detail-prechew');
  await expect(note).toBeVisible();
  await expect(page.getByTestId('ticket-detail-prechew-tried'))
    .toContainText('Bot tried: Self-service password reset');
  await expect(page.getByTestId('ticket-detail-prechew-still'))
    .toContainText('User says:');
  // The bot could only OFFER the reset its own lockout put out of reach - he
  // never completed one (a completed reset would have cleared the lock), which
  // is the truth in this world's model.
  await expect(page.getByTestId('ticket-detail-prechew-still'))
    .toContainText('put out of reach');

  // And it is flavour, not a verb: there is no button in it, so it cannot be
  // confused for a step. The ticket still closes the way it always did.
  await expect(note.getByRole('button')).toHaveCount(0);
});

test('the bot-frustrated user can be met in kind, and the ticket still resolves', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'chat');
  await page.getByTestId('chat-person-gary').click();

  // He opens already cross, and about the RIGHT thing: the chat robot kept
  // telling him to reset a password that was never the problem. That is the
  // bot-frustrated beat, and the tone register is how the player answers it.
  await expect(page.getByTestId('chat-transcript'))
    .toContainText('chat robot');
  await expect(page.getByTestId('chat-transcript'))
    .toContainText('it is not the password');

  const options = page.getByTestId('chat-options');
  // Both roads are on the beat: the neutral de-escalation (ask him to read it
  // out) and the aggressive meet-in-kind. The tone is a real choice, not the
  // only button.
  await expect(
    options.getByRole('button', { name: /read the message out, word for word/ }),
  ).toBeVisible();
  const inKind = options.getByRole('button', {
    name: /robot is off the table/,
  });
  await expect(inKind).toBeVisible();

  // Meet him in kind. The SAME question is asked and the SAME thing is got out
  // of him as the neutral reply - the conversation lands on the reads beat - so
  // the fix is untouched; only the social cost is added.
  await inKind.click();
  await expect(page.getByTestId('chat-transcript'))
    .toContainText('locked out, please contact support');

  // The snap is on the record, on the reporter's own reaction stream (not the
  // customer-visible one), exactly as the 0.4.1 register puts it there.
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-locked-account').click();
  await expect(page.getByTestId('ticket-reactions'))
    .toContainText('no need for the tone');

  // And it still unlocks: the register never loses the ticket.
  await expect(page.getByTestId('ticket-row-locked-account')).toBeVisible();
});
