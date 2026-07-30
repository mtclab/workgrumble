import { expect, test } from '@playwright/test';

import {
  focusWindow,
  logIn,
  openFromStartMenu,
  resolvedToast,
  runCommand,
} from './helpers';

/**
 * The vague-ticket mechanic, end to end: the reporter is wrong about the
 * cause, one question in the conversation is the right one, and asking it has
 * to end with the cause written on the ticket the player is looking at.
 */

test('reveals the hidden cause when the right question is asked', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-rotated-screen').click();

  // Nothing has been learned yet, so there is nothing on the ticket.
  await expect(page.getByTestId('ticket-clues')).toHaveCount(0);

  await page.getByTestId('ticket-open-chat').click();
  await expect(page.getByTestId('window-chat')).toBeVisible();
  await expect(page.getByTestId('chat-heading')).toHaveText('Ada Whitlock');

  const transcript = page.getByTestId('chat-transcript');
  const options = page.getByTestId('chat-options');
  await expect(transcript).toContainText('I have been hacked');

  // A question that is not the right one moves the conversation without
  // learning anything: the clue panel stays empty.
  await options.getByRole('button', { name: /doing when she left on Friday/ })
    .click();
  await expect(transcript).toContainText('I locked it, I went home');
  await focusWindow(page, 'tickets');
  await expect(page.getByTestId('ticket-clues')).toHaveCount(0);

  // The right question.
  await focusWindow(page, 'chat');
  await options.getByRole('button', { name: /anybody else was at her desk/ })
    .click();
  await expect(page.getByTestId('chat-outcome')).toContainText('Written onto');
  await expect(transcript).toContainText('Gareth was showing me a shortcut');

  // And it lands on the ticket, where the player will actually see it.
  await focusWindow(page, 'tickets');
  await expect(page.getByTestId('ticket-clues')).toContainText(
    'showing her something',
  );

  // Asking it twice does not write it twice, and explains itself.
  await focusWindow(page, 'chat');
  await options.getByRole('button', { name: /Go back to the top/ }).click();
  await options.getByRole('button', { name: /anybody else was at her desk/ })
    .click();
  await expect(page.getByTestId('chat-refusal')).toContainText(
    'already written on the ticket',
  );
  await focusWindow(page, 'tickets');
  await expect(page.getByTestId('ticket-clues').getByRole('listitem'))
    .toHaveCount(1);
});

test('changes what the reporter says once their ticket is closed', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'chat');
  await page.getByTestId('chat-person-ada').click();

  const transcript = page.getByTestId('chat-transcript');
  const options = page.getByTestId('chat-options');
  await expect(transcript).toContainText('I have been hacked');
  await expect(page.getByTestId('chat-person-ada')).toContainText(
    'Open ticket',
  );

  // Fix the world from somewhere else entirely, with the chat window open.
  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'rotate SALES-02 0');
  await expect(resolvedToast(page)).toHaveCount(1);

  // She comes back with a different problem: the story she has told people.
  await focusWindow(page, 'chat');
  await expect(transcript).toContainText('They message you again.');
  await expect(transcript).toContainText('It is the right way up');
  await expect(options.getByRole('button', { name: /rotation shortcut/ }))
    .toBeVisible();
  await expect(page.getByTestId('chat-person-ada')).not.toContainText(
    'Open ticket',
  );

  // The reaction branch is a real conversation, not a dead end.
  await options.getByRole('button', { name: /rotation shortcut/ }).click();
  await expect(transcript).toContainText('Control, Alt and an arrow');
  await options.getByRole('button', { name: /shows Gareth the same shortcut/ })
    .click();
  await expect(transcript).toContainText('The conversation ends.');
  await page.getByTestId('chat-restart').click();
  await expect(options.getByRole('button', { name: /rotation shortcut/ }))
    .toBeVisible();
});

test('keeps the boss channel to talk and no consequences', async ({ page }) => {
  await logIn(page);
  await openFromStartMenu(page, 'chat');
  await page.getByTestId('chat-person-desmond').click();

  const transcript = page.getByTestId('chat-transcript');
  const options = page.getByTestId('chat-options');
  await expect(transcript).toContainText('on top of the queue');

  await options.getByRole('button', { name: /raise a ticket like everybody/ })
    .click();
  await expect(transcript).toContainText('I raise concerns');

  // Nothing the boss channel says can change the world, so nothing here
  // reports an outcome or a refusal.
  await expect(page.getByTestId('chat-outcome')).toBeHidden();
  await expect(page.getByTestId('chat-refusal')).toBeHidden();
  await expect(resolvedToast(page)).toHaveCount(0);
});
