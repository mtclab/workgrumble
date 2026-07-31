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

  // "Message reporter" opens the conversation with THIS ticket's reporter,
  // and re-aims a chat window that is already open on somebody else.
  await page.getByTestId('ticket-row-locked-account').click();
  await page.getByTestId('ticket-open-chat').click();
  await expect(page.getByTestId('window-chat')).toBeVisible();
  await expect(page.getByTestId('chat-heading')).toHaveText('Gary Poole');

  await focusWindow(page, 'tickets');
  await page.getByTestId('ticket-row-rotated-screen').click();

  // Nothing has been learned yet, so there is nothing on the ticket.
  await expect(page.getByTestId('ticket-worknotes')).toContainText(
    'Nothing worked out yet',
  );

  await page.getByTestId('ticket-open-chat').click();
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
  await expect(page.getByTestId('ticket-worknotes')).toContainText(
    'Nothing worked out yet',
  );

  // The right question.
  await focusWindow(page, 'chat');
  await options.getByRole('button', { name: /anybody else was at her desk/ })
    .click();
  await expect(page.getByTestId('chat-outcome')).toContainText(
    'Filed as a work note',
  );
  await expect(transcript).toContainText('Gareth was showing me a shortcut');

  // And it lands on the ticket, where the player will actually see it.
  await focusWindow(page, 'tickets');
  await expect(page.getByTestId('ticket-worknotes')).toContainText(
    'showing her something',
  );

  // Asking it twice does not write it twice, and explains itself. The first
  // thing that refuses is the question, because the question is now a line on
  // the ticket rather than a flag, and it is already on there word for word.
  await focusWindow(page, 'chat');
  await options.getByRole('button', { name: /Go back to the top/ }).click();
  await options.getByRole('button', { name: /anybody else was at her desk/ })
    .click();
  await expect(page.getByTestId('chat-refusal')).toContainText(
    'already put that to them',
  );
  await focusWindow(page, 'tickets');
  await expect(page.getByTestId('ticket-worknotes').getByRole('listitem'))
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

/**
 * The awkward case the ordering in `chat.ts` exists for: an option that fixes
 * the world resolves its own ticket synchronously, mid-click, and the world
 * listener repaints the thread before the dispatch has even returned. The
 * conversation has to land on the reporter's REACTION, not on the branch the
 * option named a moment before the problem stopped existing.
 */
test('lands on the reaction when a chat option closes its own ticket', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'chat');
  await page.getByTestId('chat-person-ada').click();

  const transcript = page.getByTestId('chat-transcript');
  const options = page.getByTestId('chat-options');

  // The walk-through sits behind the diagnosis, which is the point of it.
  await options.getByRole('button', { name: /anybody else was at her desk/ })
    .click();
  await options.getByRole('button', { name: /which keys Gareth pressed/ })
    .click();
  await expect(transcript).toContainText('Control, something, and an arrow');

  await options
    .getByRole('button', { name: /Control, Alt and Up right now/ })
    .click();

  // One dispatch, one resolution, and it says what it did.
  await expect(resolvedToast(page)).toHaveCount(1);
  await expect(page.getByTestId('chat-outcome')).toContainText('Done, from '
    + 'here');

  // The option pointed at a node on the open branch. The thread ends on the
  // reaction anyway, and stays there: the options on offer are hers from
  // AFTER the fix, and none of them belong to the node the option named.
  await expect(transcript).toContainText('They message you again.');
  await expect(transcript).toContainText('It is the right way up');
  await expect(options.getByRole('button', { name: /rotation shortcut/ }))
    .toBeVisible();
  await expect(
    options.getByRole('button', { name: /sit up, this takes a moment/ }),
  ).toHaveCount(0);
  await expect(
    options.getByRole('button', { name: /Control, Alt and Up right now/ }),
  ).toHaveCount(0);
  await expect(page.getByTestId('chat-person-ada')).not.toContainText(
    'Open ticket',
  );

  // And the queue agrees that it closed, once.
  await openFromStartMenu(page, 'tickets');
  await expect(
    page.getByTestId('ticket-row-rotated-screen'),
  ).toHaveAttribute('data-state', 'resolved');
});

/**
 * Cross-app links open the target app ONCE and hand it its aim once, whether
 * the window was closed, already open, or minimized behind the taskbar. A
 * second window, or a second delivery, is a conversation restarted under the
 * player mid-sentence.
 */
test('opens the chat window once and re-aims the one that exists', async ({
  page,
}) => {
  await logIn(page);
  await openFromStartMenu(page, 'tickets');

  // Chat is not running. The ticket link mounts it AND lands it on Ada.
  await page.getByTestId('ticket-row-rotated-screen').click();
  await page.getByTestId('ticket-open-chat').click();
  await expect(page.getByTestId('window-chat')).toHaveCount(1);
  await expect(page.getByTestId('taskbar-button-chat')).toHaveCount(1);
  await expect(page.getByTestId('chat-heading')).toHaveText('Ada Whitlock');

  // Her opening line is in the transcript exactly once: a second mount, or a
  // second intent, would say it again.
  await expect(
    page.getByTestId('chat-transcript').getByText(/I have been hacked/),
  ).toHaveCount(1);

  // Minimized, the same link has to restore it and re-aim it - not open a
  // second one, and not leave the player looking at the wrong reporter.
  await page.getByTestId('minimize-chat').click();
  await expect(page.getByTestId('window-chat')).toBeHidden();

  await page.getByTestId('ticket-row-wedged-spooler').click();
  await page.getByTestId('ticket-open-chat').click();
  await expect(page.getByTestId('window-chat')).toBeVisible();
  await expect(page.getByTestId('window-chat')).toHaveCount(1);
  await expect(page.getByTestId('taskbar-button-chat')).toHaveCount(1);
  await expect(page.getByTestId('chat-heading')).toHaveText('Nina Okafor');
  await expect(
    page.getByTestId('chat-transcript').getByText(/printer is haunted/),
  ).toHaveCount(1);
});

test('keeps the boss channel to talk and no consequences', async ({ page }) => {
  await logIn(page);
  await openFromStartMenu(page, 'chat');

  // Start somewhere else so selecting the boss has to actually do something.
  await page.getByTestId('chat-person-bev').click();
  await expect(page.getByTestId('chat-heading')).toHaveText('Bev Tannock');
  await expect(page.getByTestId('chat-person-bev')).toHaveAttribute(
    'data-selected',
    'true',
  );

  await page.getByTestId('chat-person-desmond').click();
  await expect(page.getByTestId('chat-heading')).toHaveText('Desmond Frisk');
  await expect(page.getByTestId('chat-person-bev')).toHaveAttribute(
    'data-selected',
    'false',
  );

  const transcript = page.getByTestId('chat-transcript');
  const options = page.getByTestId('chat-options');
  await expect(transcript).toContainText('on top of the queue');

  await options.getByRole('button', { name: /raise a ticket like everybody/ })
    .click();
  await expect(transcript).toContainText('I raise concerns');
  // The thread moved: the option that got us here is gone from the panel.
  await expect(
    options.getByRole('button', { name: /raise a ticket like everybody/ }),
  ).toHaveCount(0);

  // Nothing the boss channel says can change the world, and the world agrees:
  // the queue is exactly where it was before the conversation started.
  await expect(page.getByTestId('chat-outcome')).toBeHidden();
  await expect(page.getByTestId('chat-refusal')).toBeHidden();
  await expect(resolvedToast(page)).toHaveCount(0);
  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('tickets-summary')).toContainText('4 open');
});
