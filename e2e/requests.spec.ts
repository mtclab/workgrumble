import { expect, test } from '@playwright/test';

import {
  beginShift,
  logInOnDay,
  openFromStartMenu,
  runSimMinutes,
} from './helpers';

/**
 * The same question everywhere, on the built artifact, through the real entry
 * point (0.5.0 slice 2). Bev asks for the VPN in three windows at ten to ten on
 * the Tuesday - the inbox, a one-to-one chat, and the #helpdesk room - and the
 * player learns to deal with it once.
 *
 * Two journeys, both walked as a player meets them:
 *
 * - the CORRECT play: convert the cross-post into a ticket. It mints a real
 *   ticket that the queue shows and Friday can see, and resolving it in the room
 *   quietens the mail and the chat copies too - the dedupe.
 * - the WRONG place: answer the human off the books. They are happy, and there
 *   is no ticket - the work is invisible on the scorecard, exactly as a direct
 *   message favour is.
 *
 * The units and the headless driver test own the arithmetic (that convert's
 * ticket is COUNTED and answer's gratitude is not); what is here is that the
 * three windows really carry the one request and that the bar resolves it.
 */

/** Ten to ten on the Tuesday: fifty minutes after the 09:00 start. */
async function reachTheRequest(page: import('@playwright/test').Page): Promise<void> {
  await logInOnDay(page, 2, { brief: 'keep' });
  await beginShift(page);
  await runSimMinutes(page, 50);
}

test('arrives in three windows, is converted, counts, and dedupes', async ({
  page,
}) => {
  await reachTheRequest(page);

  // The inbox carries it...
  await openFromStartMenu(page, 'mail');
  await expect(page.getByTestId('request-card-bev-vpn')).toBeVisible();
  await expect(page.getByTestId('request-elsewhere-bev-vpn'))
    .toContainText('same request');

  // ...so does the one-to-one chat...
  await openFromStartMenu(page, 'chat');
  await expect(page.getByTestId('request-card-bev-vpn')).toBeVisible();

  // ...and so does the room, where the bar lives on the message itself.
  await openFromStartMenu(page, 'hubbub');
  await page.getByTestId('hubbub-channel-helpdesk').click();
  await expect(page.getByTestId('hubbub-message-bev-vpn')).toBeVisible();
  await expect(page.getByTestId('request-convert-bev-vpn')).toBeVisible();

  // Convert it: the correct play. A real ticket is minted and the queue opens
  // on it, which is where the credit lives.
  await page.getByTestId('request-convert-bev-vpn').click();
  await expect(page.getByTestId('ticket-row-bev-vpn-request')).toBeVisible();

  // The room copy now reads converted...
  await openFromStartMenu(page, 'hubbub');
  await page.getByTestId('hubbub-channel-helpdesk').click();
  await expect(page.getByTestId('request-status-bev-vpn'))
    .toContainText('Converted');

  // ...and so does the inbox copy, because it is the same request: resolving one
  // quietens all three. There are no buttons left to press on it anywhere.
  await openFromStartMenu(page, 'mail');
  await expect(page.getByTestId('request-status-bev-vpn'))
    .toContainText('Converted');
  await expect(page.getByTestId('request-convert-bev-vpn')).toHaveCount(0);
});

test('answered in the wrong place: grateful, and no ticket', async ({ page }) => {
  await reachTheRequest(page);

  await openFromStartMenu(page, 'hubbub');
  await page.getByTestId('hubbub-channel-helpdesk').click();
  await expect(page.getByTestId('request-answer-bev-vpn')).toBeVisible();

  // Answer the human here, off the books.
  await page.getByTestId('request-answer-bev-vpn').click();
  await expect(page.getByTestId('request-status-bev-vpn'))
    .toContainText('off the books');

  // And there is nothing on the scorecard: the queue never gains the ticket,
  // because answering raised none. Grateful, and invisible on Friday.
  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('ticket-row-bev-vpn-request')).toHaveCount(0);

  // The chat copy is quiet too - the same request, dealt with once.
  await openFromStartMenu(page, 'chat');
  await expect(page.getByTestId('request-status-bev-vpn'))
    .toContainText('off the books');
});
